"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, Eye, FileText, History, MapPin, RefreshCw, Scale, UserPlus,
} from "lucide-react";
import { ApiError, staffFetch } from "@/lib/client/api";
import { reviewOutcomes, type ReviewOutcome } from "@/lib/case-contract";
import {
  caseEventMeta, category as categoryOf, reviewMeta, type ResponseState, type ReviewState,
} from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/signa/shell";
import { SectionHeading } from "@/components/signa/page-header";
import { StaffGate } from "@/components/signa/staff-gate";
import { SafetyNotice } from "@/components/signa/safety-notice";
import { CategoryGlyph, ResponseChip, ReviewChip } from "@/components/signa/status-chip";
import { Timeline, type TimelineEntry } from "@/components/signa/timeline";
import { Reveal, Stagger, StaggerItem } from "@/components/signa/motion";
import { cn, formatDateTime, formatRelative, shortRef } from "@/lib/utils";
import { AiAssessmentPanel } from "@/components/signa/ai-assessment-panel";

type CaseFile = {
  reviewEligibility: { canReview: boolean; reason: string | null };
  incident: {
    id: string;
    summary: string;
    review_state: ReviewState;
    response_state: ResponseState;
    created_at: string;
    updated_at: string;
    polling_units: {
      code: string; name: string; ward: string | null; lga: string | null;
      state: string | null; is_simulated: boolean;
    } | null;
  };
  reports: { id: string; category: string; description: string; received_at: string; occurred_at: string | null; aiEligible: boolean; latestAssessment: import("@/components/signa/ai-assessment-panel").Assessment | null }[];
  reviews: { id: string; outcome: ReviewOutcome; reason: string; created_at: string; evidence_ids?: string[] }[];
  assignment: {
    id: string; assigned_to: string; assigned_at: string;
    acknowledged_at: string | null; acknowledgement_note: string | null;
  } | null;
  events: { id: number; event_type: string; details: Record<string, unknown>; created_at: string }[];
};

type Coordinator = { id: string; display_name: string | null };
type EvidenceItem = { id: string; reportId: string; mimeType: string; byteSize: number; sha256: string; receivedAt: string };
type EvidenceView = { items: EvidenceItem[]; error?: string };

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<CaseFile | null>(null);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [access, setAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [evidenceByReport, setEvidenceByReport] = useState<Record<string, EvidenceView>>({});
  const [preview, setPreview] = useState<{ evidenceId: string; signedUrl: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [selectedReviewEvidence, setSelectedReviewEvidence] = useState<string[]>([]);

  const [outcome, setOutcome] = useState<ReviewOutcome>("inconclusive");
  const [reason, setReason] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [coordinatorId, setCoordinatorId] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return false;
    setLoading(true);
    setError("");
    try {
      const file = await staffFetch<CaseFile>(`/api/monitor/incidents/${id}`);
      setData(file);
      setAccess(true);
      const evidenceEntries = await Promise.all(file.reports.map(async (report) => {
        try {
          const response = await staffFetch<{ evidence: EvidenceItem[] }>(`/api/reports/${report.id}/evidence`);
          return [report.id, { items: response.evidence || [] }] as const;
        } catch (e) {
          return [report.id, { items: [], error: e instanceof Error ? e.message : "Evidence could not be loaded." }] as const;
        }
      }));
      setEvidenceByReport(Object.fromEntries(evidenceEntries));
      try {
        const list = await staffFetch<{ coordinators: Coordinator[] }>("/api/monitor/coordinators");
        setCoordinators(list.coordinators || []);
      } catch {
        setCoordinators([]);
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAccess(false);
      } else {
        setError(e instanceof Error ? e.message : "Unable to load this case");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function recordReview() {
    setSavingReview(true);
    setReviewFeedback(null);
    try {
      await staffFetch(`/api/monitor/incidents/${id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ outcome, reason, evidenceIds: selectedReviewEvidence }),
      });
      setReason("");
      setSelectedReviewEvidence([]);
      setReviewFeedback({ ok: true, text: "Review recorded. The case status and timeline are updating." });
      if (!(await load())) setReviewFeedback({ ok: true, text: "Review recorded, but the case could not refresh. Refresh to see the latest timeline." });
    } catch (e) {
      setReviewFeedback({ ok: false, text: e instanceof Error ? e.message : "Could not record the review" });
    } finally {
      setSavingReview(false);
    }
  }

  async function assign() {
    setAssigning(true);
    setAssignFeedback(null);
    try {
      await staffFetch(`/api/monitor/incidents/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({ coordinatorId, note: assignNote || null }),
      });
      setAssignNote("");
      setAssignFeedback({ ok: true, text: "Assignment recorded. The case is updating." });
      if (!(await load())) setAssignFeedback({ ok: true, text: "Assignment recorded, but the case could not refresh. Refresh to see its status." });
    } catch (e) {
      setAssignFeedback({ ok: false, text: e instanceof Error ? e.message : "Could not assign this case" });
    } finally {
      setAssigning(false);
    }
  }

  if (!access) {
    return (
      <PageShell>
        <StaffGate
          title="Case file"
          description="Case files are restricted to approved monitors and coordinators."
          onSignedIn={() => void load()}
        />
      </PageShell>
    );
  }

  if (loading && !data) {
    return (
      <PageShell width="wide">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-6 h-10 w-2/3" />
        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell width="narrow">
        <EmptyState
          icon={FileText}
          title="Case unavailable"
          description={error || "This case could not be loaded. It may have been removed or you may not have access."}
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/monitor">Back to the inbox</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { incident, reports, reviews, assignment, events, reviewEligibility } = data;
  const unit = incident.polling_units;
  const canAssign = incident.review_state === "supported" && !assignment;
  const availableEvidence = reports.flatMap((report) => (evidenceByReport[report.id]?.items || []).map((item) => ({ ...item, reportId: report.id })));

  async function openEvidence(reportId: string, evidenceId: string) {
    setPreview(null);
    setPreviewError("");
    try {
      const result = await staffFetch<{ signedUrl: string; expiresAt: string }>(`/api/reports/${reportId}/evidence/${evidenceId}`);
      setPreview({ evidenceId, signedUrl: result.signedUrl });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Evidence preview is unavailable.");
    }
  }

  const timeline: TimelineEntry[] = events.map((event) => {
    const meta = caseEventMeta[event.event_type] ?? { label: event.event_type, tone: "neutral" as const };
    const details = event.details || {};
    const detail =
      (typeof details.reason === "string" && details.reason) ||
      (typeof details.note === "string" && details.note) ||
      (typeof details.action === "string" && details.action) ||
      (typeof details.summary === "string" && details.summary) ||
      null;
    return {
      id: event.id,
      label: meta.label,
      tone: meta.tone,
      at: event.created_at,
      detail,
    };
  });

  return (
    <PageShell width="wide" className="pb-16">
      <Reveal>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/monitor">
            <ArrowLeft className="size-4" aria-hidden />
            Back to inbox
          </Link>
        </Button>

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ReviewChip state={incident.review_state} />
              <ResponseChip state={incident.response_state} />
              <Badge tone="neutral" size="md" className="font-mono">
                CASE {shortRef(incident.id)}
              </Badge>
            </div>
            <h1 className="mt-4 max-w-3xl text-[26px] font-semibold leading-[1.15] sm:text-[32px]">
              {incident.summary}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-ink/80">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden />
                {unit ? `${unit.code} · ${unit.name}` : "Polling unit unavailable"}
                {unit?.is_simulated ? " · simulated" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <History className="size-3.5" aria-hidden />
                Opened {formatDateTime(incident.created_at)}
              </span>
            </div>
          </div>
          <Button variant="secondary" size="md" onClick={() => void load()} loading={loading}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
        </div>
      </Reveal>

      {error && (
        <p role="alert" className="mt-4 text-[13.5px] text-alert">{error}</p>
      )}

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        {/* ---------- Left: evidence + actions ---------- */}
        <div className="min-w-0 space-y-5">
          <Card className="p-5 sm:p-6">
            <SectionHeading
              title={`Linked reports (${reports.length})`}
              description="Each item is a separate submission. The system does not establish whether submissions came from different people."
            />
            <Stagger className="mt-5 space-y-3">
              {reports.map((report) => (
                <StaggerItem key={report.id}>
                  <div className="flex gap-3.5 rounded-[14px] bg-canvas p-4 ring-1 ring-inset ring-[var(--hairline)]">
                    <CategoryGlyph value={report.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14.5px] font-semibold text-navy">
                          {categoryOf(report.category).label}
                        </p>
                        <span className="font-mono text-[11.5px] text-muted-ink">
                          {shortRef(report.id)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-ink/85">
                        {report.description}
                      </p>
                      <p className="mt-2 text-[12px] text-muted-ink">
                        Received {formatDateTime(report.received_at)}
                        {report.occurred_at ? ` · observed ${formatDateTime(report.occurred_at)}` : ""}
                      </p>
                      <div className="mt-4 border-t border-[var(--hairline)] pt-3">
                        <p className="text-[12px] font-semibold text-navy">Private evidence</p>
                        {evidenceByReport[report.id]?.error ? (
                          <p className="mt-1 text-[12px] text-alert">Evidence unavailable: {evidenceByReport[report.id].error}</p>
                        ) : evidenceByReport[report.id]?.items.length ? (
                          <ul className="mt-2 space-y-2">
                            {evidenceByReport[report.id].items.map((item) => (
                              <li key={item.id} className="rounded-xl bg-white p-3 ring-1 ring-inset ring-[var(--hairline)]">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[12px] text-slate-ink/80">{item.mimeType} · {(item.byteSize / 1024).toFixed(0)} KB · {formatDateTime(item.receivedAt)}</span>
                                  <Button type="button" size="sm" variant="subtle" onClick={() => void openEvidence(report.id, item.id)}><Eye className="size-3.5" aria-hidden />View privately</Button>
                                </div>
                                {preview?.evidenceId === item.id && <img src={preview.signedUrl} alt={`Private evidence for report ${shortRef(report.id)}`} className="mt-3 max-h-96 w-full rounded-lg bg-canvas object-contain" onError={() => { setPreview(null); setPreviewError("This private preview link expired or the image is unavailable. Refresh and try again."); }} />}
                              </li>
                            ))}
                          </ul>
                        ) : evidenceByReport[report.id] ? (
                          <p className="mt-1 text-[12px] text-slate-ink/70">No received photos are attached to this report.</p>
                        ) : (
                          <p className="mt-1 text-[12px] text-slate-ink/70" role="status">Loading private evidence…</p>
                        )}
                        {previewError && <p role="alert" className="mt-2 text-[12px] text-alert">{previewError}</p>}
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </Card>

          {/* Record a review */}
          <Card className="p-5 sm:p-6">
            <SectionHeading
              title="Record a review"
              description="Your outcome and rationale are stored against your account and appear on the case timeline."
            />
            {!reviewEligibility.canReview ? (
              <p role="status" className="mt-4 rounded-xl bg-warn-soft p-4 text-[13px] text-slate-ink">Awaiting independent review. {reviewEligibility.reason} Another authorized reviewer must record the decision.</p>
            ) : <>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {reviewOutcomes.map((value) => {
                const meta = reviewMeta[value];
                const Icon = meta.icon;
                const active = outcome === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOutcome(value)}
                    className={cn(
                      "flex min-h-[78px] flex-col items-start gap-2 rounded-[14px] p-3.5 text-left transition-all duration-200",
                      active
                        ? "bg-midnight text-white shadow-[0_8px_24px_rgba(11,18,32,0.18)]"
                        : "bg-canvas text-navy ring-1 ring-inset ring-[var(--hairline)] hover:bg-white hover:shadow-sm",
                    )}
                  >
                    <Icon className={cn("size-[18px]", active ? "text-white" : "text-slate-ink")} aria-hidden />
                    <span className="text-[13.5px] font-semibold leading-tight">{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-ink/75">
              {reviewMeta[outcome].help}
            </p>
            <div className="mt-4">
              <Field
                label="Rationale"
                htmlFor="reason"
                hint={`${reason.length} / 2000`}
                help="Minimum 12 characters. Describe what the observations do and do not support."
              >
                <Textarea
                  id="reason"
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="The linked accounts consistently describe a pause in accreditation, but do not establish intent or criminal conduct."
                />
              </Field>
            </div>
            {availableEvidence.length > 0 && (
              <fieldset className="mt-4">
                <legend className="text-[13px] font-semibold text-navy">Evidence references (optional)</legend>
                <p className="mt-1 text-[12px] text-slate-ink/70">Select only the photos your written rationale addresses. References do not establish authenticity.</p>
                <div className="mt-2 space-y-2">
                  {availableEvidence.map((item) => (
                    <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-xl bg-canvas px-3 py-2 text-[12.5px] text-slate-ink ring-1 ring-inset ring-[var(--hairline)]">
                      <input type="checkbox" checked={selectedReviewEvidence.includes(item.id)} onChange={(event) => setSelectedReviewEvidence((current) => event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id))} className="size-4 accent-primary" />
                      <span>{shortRef(item.id)} · report {shortRef(item.reportId)} · {item.mimeType}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Button
              variant="primary"
              size="lg"
              className="mt-4"
              loading={savingReview}
              disabled={reason.trim().length < 12}
              onClick={() => void recordReview()}
            >
              <Scale className="size-4" aria-hidden />
              Record review outcome
            </Button>
            </>}
            {reviewFeedback && <p role={reviewFeedback.ok ? "status" : "alert"} className={cn("mt-3 rounded-lg p-3 text-[13px]", reviewFeedback.ok ? "bg-trust-soft text-trust" : "bg-alert/10 text-alert")}>{reviewFeedback.text}</p>}
          </Card>

          <AiAssessmentPanel reports={reports} reviewState={incident.review_state} responseState={incident.response_state} />

          {/* Assign */}
          <Card className="p-5 sm:p-6">
            <SectionHeading
              title="Route for internal follow-up"
              description="Only a case reviewed as supported can be assigned to a coordinator."
            />
            {assignment ? (
              <div className="mt-5 flex items-start gap-3 rounded-[14px] bg-trust-soft p-4 ring-1 ring-inset ring-[rgba(15,118,110,0.18)]">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-trust" aria-hidden />
                <div>
                  <p className="text-[14px] font-semibold text-trust">
                    Assigned {formatRelative(assignment.assigned_at)}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-ink/85">
                    {assignment.acknowledged_at
                      ? `Acknowledged by the coordinator on ${formatDateTime(assignment.acknowledged_at)}.`
                      : "Waiting for the coordinator to acknowledge receipt."}
                  </p>
                  {assignment.acknowledgement_note && (
                    <p className="mt-2 rounded-[10px] bg-white/70 p-3 text-[13px] leading-relaxed text-slate-ink">
                      {assignment.acknowledgement_note}
                    </p>
                  )}
                </div>
              </div>
            ) : canAssign ? (
              <div className="mt-5 space-y-4">
                <Field
                  label="Coordinator"
                  htmlFor="coordinator"
                  help={
                    coordinators.length
                      ? "Only users with an approved coordinator role are listed."
                      : "No approved coordinators are available yet. An admin assigns this role in the database."
                  }
                >
                  <Select
                    id="coordinator"
                    value={coordinatorId}
                    onChange={(e) => setCoordinatorId(e.target.value)}
                  >
                    <option value="">Select a coordinator</option>
                    {coordinators.map((coordinator) => (
                      <option key={coordinator.id} value={coordinator.id}>
                        {coordinator.display_name || shortRef(coordinator.id)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Routing note (optional)" htmlFor="assign-note">
                  <Textarea
                    id="assign-note"
                    maxLength={2000}
                    value={assignNote}
                    onChange={(e) => setAssignNote(e.target.value)}
                    className="min-h-[88px]"
                    placeholder="Internal monitoring follow-up requested."
                  />
                </Field>
                <Button
                  variant="primary"
                  size="lg"
                  loading={assigning}
                  disabled={!coordinatorId}
                  onClick={() => void assign()}
                >
                  <UserPlus className="size-4" aria-hidden />
                  Assign case
                </Button>
              </div>
            ) : (
              <p className="mt-5 rounded-[14px] bg-canvas p-4 text-[13.5px] leading-relaxed text-slate-ink/80 ring-1 ring-inset ring-[var(--hairline)]">
                This case is {reviewMeta[incident.review_state].label.toLowerCase()}. Record a
                supported review outcome before routing it to a coordinator.
              </p>
            )}
            {assignFeedback && <p role={assignFeedback.ok ? "status" : "alert"} className={cn("mt-3 rounded-lg p-3 text-[13px]", assignFeedback.ok ? "bg-trust-soft text-trust" : "bg-alert/10 text-alert")}>{assignFeedback.text}</p>}
          </Card>
        </div>

        {/* ---------- Right: history ---------- */}
        <div className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <Card className="p-5 sm:p-6">
            <SectionHeading title="Case timeline" description="Append-only record of every decision." />
            <div className="mt-6">
              {timeline.length === 0 ? (
                <p className="text-[13.5px] text-slate-ink/75">No events recorded yet.</p>
              ) : (
                <Timeline entries={timeline} />
              )}
            </div>
          </Card>

          {reviews.length > 0 && (
            <Card className="p-5 sm:p-6">
              <SectionHeading title="Review history" description="Earlier outcomes are never overwritten." />
              <div className="mt-5 space-y-3">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-[14px] bg-canvas p-4 ring-1 ring-inset ring-[var(--hairline)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ReviewChip state={review.outcome} size="sm" />
                      <span className="text-[12px] text-muted-ink">
                        {formatDateTime(review.created_at)}
                      </span>
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-ink/85">
                      {review.reason}
                    </p>
                    {review.evidence_ids?.length ? (
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-ink/75">
                        Evidence references: {review.evidence_ids.map((evidenceId) => {
                          const item = availableEvidence.find((evidence) => evidence.id === evidenceId);
                          return item ? `${shortRef(evidenceId)} (report ${shortRef(item.reportId)})` : `${shortRef(evidenceId)} (currently unavailable)`;
                        }).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <SafetyNotice tone="info" title="Acknowledgement is not dispatch">
            Routing a case inside Signa records internal monitoring follow-up only. It does not
            contact police, emergency responders or INEC.
          </SafetyNotice>
        </div>
      </div>
    </PageShell>
  );
}
