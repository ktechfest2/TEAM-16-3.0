"use client";

import { useState } from "react";
import { Bot, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { staffFetch } from "@/lib/client/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/signa/page-header";
import { ReviewChip } from "@/components/signa/status-chip";
import type { ReviewState, ResponseState } from "@/lib/taxonomy";
import { shortRef } from "@/lib/utils";

type CaseReport = { id: string; category: string; description: string; received_at: string; occurred_at: string | null; aiEligible: boolean; latestAssessment: Assessment | null };
export type Assessment = {
  id: string;
  status: "completed" | "failed" | string;
  provisional_summary: string | null;
  model_observations: {
    summary?: string;
    observations?: string[];
    image_observations?: string[];
    uncertainty?: string[];
  } | null;
  deterministic_checks: {
    location?: string;
    category?: string;
    occurredAt?: string | null;
    possibleDuplicateReportIds?: string[];
  } | null;
  source_references: { type: string; id: string }[];
  uncertainty: string[];
  provider_failure: string | null;
  created_at: string;
};

type ResultState = { loading: boolean; assessment?: Assessment; error?: string };

export function AiAssessmentPanel({
  reports,
  reviewState,
  responseState,
}: {
  reports: CaseReport[];
  reviewState: ReviewState;
  responseState: ResponseState;
}) {
  const [results, setResults] = useState<Record<string, ResultState>>({});

  async function requestAssessment(reportId: string) {
    setResults((current) => ({ ...current, [reportId]: { ...current[reportId], loading: true, error: undefined } }));
    try {
      const result = await staffFetch<{ assessment: Assessment }>("/api/monitor/ai-assessments", {
        method: "POST",
        body: JSON.stringify({ reportId, consentedFictionalEvidence: true }),
      });
      setResults((current) => ({ ...current, [reportId]: { loading: false, assessment: result.assessment } }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [reportId]: { ...current[reportId], loading: false, error: error instanceof Error ? error.message : "Assessment is unavailable." },
      }));
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading
        title="AI assessment"
        description="Optional provisional observations from the assessment service. Human review and response remain separate."
      />
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-warn-soft p-3.5 text-[12.5px] leading-relaxed text-slate-ink/85">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <p>AI does not verify an allegation. Only approved fictional reports with consent are eligible. If assessment is unavailable, reporting and human review continue independently.</p>
      </div>
      <div className="mt-4 rounded-xl bg-canvas p-3.5 ring-1 ring-inset ring-[var(--hairline)]">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-ink">Authoritative workflow statuses</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-slate-ink/75">Human verification</span><ReviewChip state={reviewState} size="sm" />
          <span className="ml-1 text-[12px] text-slate-ink/75">Response</span><span className="text-[12px] font-semibold text-navy">{responseState.replaceAll("_", " ")}</span>
        </div>
        <p className="mt-2 text-[12px] text-slate-ink/70">These case statuses are stored by Signa and do not change when an AI assessment is requested.</p>
      </div>

      <div className="mt-5 space-y-3">
        {reports.map((report) => {
          const result = results[report.id];
          const assessment = result?.assessment && (!report.latestAssessment || result.assessment.created_at >= report.latestAssessment.created_at)
            ? result.assessment : report.latestAssessment;
          const observations = assessment?.model_observations;
          const duplicateIds = assessment?.deterministic_checks?.possibleDuplicateReportIds || [];
          return (
            <section key={report.id} className="rounded-[14px] bg-canvas p-4 ring-1 ring-inset ring-[var(--hairline)]" aria-label={`AI assessment for report ${shortRef(report.id)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13.5px] font-semibold text-navy">Report {shortRef(report.id)}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-ink/75">{report.description}</p>
                </div>
                {report.aiEligible && assessment?.status !== "completed" && <Button type="button" variant="subtle" size="sm" loading={result?.loading} disabled={result?.loading} onClick={() => void requestAssessment(report.id)}>
                  {assessment ? <RefreshCw className="size-3.5" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
                  {assessment ? "Retry assessment" : "Request assessment"}
                </Button>}
              </div>
              {!assessment && <p className="mt-3 text-[12.5px] text-muted-ink">{report.aiEligible ? "No persisted assessment yet. Human review can proceed independently." : "External AI assessment is unavailable for this report."}</p>}
              {result?.loading && <p role="status" className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-ink/75"><Loader2 className="size-4 animate-spin" aria-hidden />Requesting an assessment…</p>}
              {result?.error && <p role="alert" className="mt-3 rounded-lg bg-alert/5 p-3 text-[12.5px] text-alert">Assessment unavailable: {result.error}. No result is being inferred.</p>}
              {assessment && (
                <div className="mt-4 space-y-4 border-t border-[var(--hairline)] pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={`rounded-full px-2.5 py-1 font-semibold ${assessment.status === "completed" ? "bg-trust-soft text-trust" : "bg-alert/10 text-alert"}`}>AI status: {assessment.status}</span>
                    <span className="text-muted-ink">Assessment {shortRef(assessment.id)} · {new Date(assessment.created_at).toLocaleString()}</span>
                  </div>
                  {assessment.provider_failure && <p role="status" className="rounded-lg bg-alert/5 p-3 text-[12.5px] text-alert">Provider unavailable: {assessment.provider_failure}. Deterministic checks below are still shown only as possible matches.</p>}
                  {assessment.provisional_summary && <div><h4 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-ink">Provisional summary</h4><p className="mt-1.5 text-[13px] leading-relaxed text-slate-ink/90">{assessment.provisional_summary}</p></div>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ObservationList title="Evidence observations" items={observations?.observations} empty="No text observations returned." />
                    <ObservationList title="Image observations" items={observations?.image_observations} empty="No image observations returned." />
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-ink">Possible duplicates</h4>
                    {duplicateIds.length ? <ul className="mt-1.5 space-y-1 text-[12.5px] text-slate-ink/85">{duplicateIds.map((id) => <li key={id}>Possible same-unit/category/time match · {shortRef(id)}</li>)}</ul> : <p className="mt-1.5 text-[12.5px] text-slate-ink/75">No possible duplicate IDs were returned by the deterministic check.</p>}
                    <p className="mt-1 text-[11.5px] text-muted-ink">A possible match does not establish duplication or independent corroboration.</p>
                  </div>
                  <ObservationList title="Uncertainty" items={assessment.uncertainty?.length ? assessment.uncertainty : observations?.uncertainty} empty="The response returned no uncertainty details; treat this output as uncertain." />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <NotProvided title="Contradictions" />
                    <NotProvided title="Corroboration signals" note="The endpoint does not assess corroboration. Report count is not proof of independent witnesses." />
                    <NotProvided title="Suggested priority" />
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-ink">Source references</h4>
                    <p className="mt-1.5 text-[12.5px] text-slate-ink/75">{assessment.source_references?.length ? assessment.source_references.map((source) => `${source.type} ${shortRef(source.id)}`).join(" · ") : "No source references returned."}</p>
                  </div>
                  <p className="text-[11.5px] text-muted-ink">Provider attribution is not included in this response. No AI score or truth verdict is supplied.</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function ObservationList({ title, items, empty }: { title: string; items?: string[]; empty: string }) {
  return <div><h4 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-ink">{title}</h4>{items?.length ? <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-slate-ink/85">{items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul> : <p className="mt-1.5 text-[12.5px] text-slate-ink/75">{empty}</p>}</div>;
}

function NotProvided({ title, note }: { title: string; note?: string }) {
  return <div className="rounded-lg bg-white p-3 ring-1 ring-inset ring-[var(--hairline)]"><h4 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-ink">{title}</h4><p className="mt-1 text-[12px] leading-relaxed text-slate-ink/75">{note || "Not returned by the current assessment contract."}</p></div>;
}

