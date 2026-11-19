import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { adminClient } from "@/lib/server/supabase";
import { isUuid } from "@/lib/report-contract";
import { errorResponse, noStore } from "@/lib/server/responses";
import { approvedFictionalReport } from "@/lib/server/fictional-ai";

/** Full case file: linked reports, recorded reviews, assignment and audit timeline. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer(req, ["monitor", "coordinator", "admin"]);
    const { id } = await ctx.params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: { code: "INPUT", message: "Invalid case ID" } },
        { status: 400, headers: noStore },
      );

    const db = adminClient();
    if (viewer.role === "coordinator") {
      const { data: assignment, error: assignmentError } = await db
        .from("assignments")
        .select("id")
        .eq("incident_id", id)
        .eq("assigned_to", viewer.userId)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment)
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Case not found" } },
          { status: 404, headers: noStore },
        );
    }
    const { data: incident, error } = await db
      .from("incidents")
      .select(
        "id,summary,review_state,response_state,created_at,updated_at,polling_unit_id,created_by," +
          "polling_units(code,name,ward,lga,state,is_simulated)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!incident)
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: noStore },
      );

    const [links, reviews, assignment, events] = await Promise.all([
      db
        .from("incident_reports")
        .select("report_id,linked_at,reports(id,category,description,received_at,occurred_at,reporter_id,ai_processing_consent)")
        .eq("incident_id", id),
      db
        .from("reviews")
        .select("id,outcome,reason,created_at,reviewer_id,review_evidence(evidence_id)")
        .eq("incident_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("assignments")
        .select("id,assigned_to,assigned_by,assigned_at,acknowledged_at,acknowledgement_note")
        .eq("incident_id", id)
        .maybeSingle(),
      db
        .from("case_events")
        .select("id,event_type,details,created_at,actor_id")
        .eq("incident_id", id)
        .order("id", { ascending: true }),
    ]);

    if (links.error) throw links.error;
    if (reviews.error) throw reviews.error;
    if (events.error) throw events.error;
    type ReportRow = { id: string; category: string; description: string; received_at: string; occurred_at: string | null; reporter_id: string; ai_processing_consent: boolean };
    const linkedReports = ((links.data || []) as unknown as { reports: ReportRow | ReportRow[] | null }[])
      .flatMap((link) => link.reports ? (Array.isArray(link.reports) ? link.reports : [link.reports]) : []);
    const reportIds = linkedReports.map((report) => report.id);
    const assessmentRows = reportIds.length
      ? await db.from("ai_assessments")
          .select("id,report_id,status,provisional_summary,model_observations,deterministic_checks,source_references,uncertainty,provider_failure,created_at")
          .in("report_id", reportIds).order("created_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    if (assessmentRows.error) throw assessmentRows.error;
    const latest = new Map<string, NonNullable<typeof assessmentRows.data>[number]>();
    for (const row of assessmentRows.data || []) if (!latest.has(row.report_id)) latest.set(row.report_id, row);
    const eligible = viewer.role === "monitor" || viewer.role === "admin";
    const { created_by: creatorId, ...publicIncident } = incident as unknown as Record<string, unknown>;
    const independent = eligible && creatorId !== viewer.userId &&
      !linkedReports.some((report) => report.reporter_id === viewer.userId);

    return NextResponse.json(
      {
        incident: publicIncident,
        reviewEligibility: { canReview: independent, reason: independent ? null : eligible ? "An independent reviewer is required. The case creator or a contributing reporter cannot record its review." : "Only an authorized incident reviewer can record a review." },
        reports: linkedReports.map((report) => ({ ...report, reporter_id: undefined, ai_processing_consent: undefined, aiEligible: report.ai_processing_consent === true && approvedFictionalReport(report.reporter_id, report.received_at), latestAssessment: latest.get(report.id) || null })),
        reviews: (reviews.data || []).map((review: { review_evidence?: { evidence_id: string }[]; [key: string]: unknown }) => ({
          ...review,
          evidence_ids: (review.review_evidence || []).map((link) => link.evidence_id),
          review_evidence: undefined,
        })),
        assignment: assignment.data || null,
        events: events.data || [],
      },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
