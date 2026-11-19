"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, FolderPlus, Inbox, LayoutDashboard, LogOut, RefreshCw, Search, ShieldAlert,
} from "lucide-react";
import { browserSupabase } from "@/lib/client/supabase";
import { ApiError, staffFetch } from "@/lib/client/api";
import { category as categoryOf, reviewMeta, type ResponseState, type ReviewState } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/signa/shell";
import { PageHeader } from "@/components/signa/page-header";
import { StaffGate } from "@/components/signa/staff-gate";
import { CategoryGlyph, ResponseChip, ReviewChip } from "@/components/signa/status-chip";
import { Reveal, Stagger, StaggerItem } from "@/components/signa/motion";
import { cn, formatRelative, shortRef } from "@/lib/utils";

type InboxReport = {
  id: string;
  polling_unit_id: string;
  category: string;
  description: string;
  received_at: string;
  polling_units: { code: string; name: string } | null;
  incident_reports: { incident_id: string }[] | { incident_id: string } | null;
  aiAssessment?: { status: string; provisional_summary: string | null } | null;
};

type CaseRow = {
  id: string;
  summary: string;
  review_state: ReviewState;
  response_state: ResponseState;
  updated_at: string;
  polling_units: { code: string; name: string; ward: string | null; lga: string | null } | null;
  incident_reports: { report_id: string; reports: { category: string } | null }[];
};

type Tab = "inbox" | "cases";

function linkedIncidentId(report: InboxReport): string | null {
  const link = report.incident_reports;
  if (!link) return null;
  if (Array.isArray(link)) return link[0]?.incident_id ?? null;
  return link.incident_id ?? null;
}

export default function MonitorPage() {
  const [access, setAccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<InboxReport[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("inbox");
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inbox, caseList] = await Promise.all([
        staffFetch<{ reports: InboxReport[] }>("/api/monitor/reports"),
        staffFetch<{ incidents: CaseRow[] }>("/api/monitor/incidents"),
      ]);
      setReports(inbox.reports || []);
      setCases(caseList.incidents || []);
      setAccess(true);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAccess(false);
        if (e.status === 403) setError("Only pre-approved monitors can open this workspace.");
      } else {
        setError(e instanceof Error ? e.message : "Unable to load the monitor workspace");
      }
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function signOut() {
    await browserSupabase().auth.signOut();
    setAccess(false);
    setReports([]);
    setCases([]);
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function createCase() {
    setSaving(true);
    setFormError("");
    try {
      const created = await staffFetch<{ id: string }>("/api/monitor/incidents", {
        method: "POST",
        body: JSON.stringify({ reportIds: selected, summary, linkReason: reason }),
      });
      setGrouping(false);
      setSelected([]);
      setSummary("");
      setReason("");
      await load();
      window.location.href = `/monitor/incidents/${created.id}`;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not group these reports");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <PageShell>
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </PageShell>
    );
  }

  if (!access) {
    return (
      <PageShell>
        <StaffGate
          title="Incident Review"
          description="Review incoming reports, group related observations into a case and record a written review outcome."
          onSignedIn={load}
        />
        {error && (
          <p role="alert" className="mx-auto mt-6 max-w-5xl text-[13.5px] text-alert">
            {error}
          </p>
        )}
      </PageShell>
    );
  }

  const unlinked = reports.filter((report) => !linkedIncidentId(report));
  const needle = query.trim().toLowerCase();
  const visibleReports = (tab === "inbox" ? reports : []).filter((report) => {
    if (unitFilter && report.polling_unit_id !== unitFilter) return false;
    if (!needle) return true;
    return (
      report.description.toLowerCase().includes(needle) ||
      categoryOf(report.category).label.toLowerCase().includes(needle) ||
      report.id.includes(needle) ||
      report.polling_units?.code.toLowerCase().includes(needle)
    );
  });
  const openCases = cases.filter((item) => item.review_state === "under_review").length;
  const awaitingResponse = cases.filter(
    (item) => item.review_state === "supported" && item.response_state === "unassigned",
  ).length;

  return (
    <PageShell width="wide" className="pb-16">
      <Reveal>
        <PageHeader
          eyebrow={<><LayoutDashboard className="size-3.5" aria-hidden /> Incident Review</>}
          title="Review inbox"
          description="Incoming reports are unverified allegations. A case exists only when a monitor groups reports and records a written review."
          actions={
            <>
              <Button variant="secondary" size="md" onClick={() => void load()} loading={loading}>
                <RefreshCw className="size-4" aria-hidden />
                Refresh
              </Button>
              <Button variant="ghost" size="md" onClick={() => void signOut()}>
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.06} className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Reports received" value={reports.length} help="Most recent 50." />
        <Metric label="Not yet grouped" value={unlinked.length} tone="warn" help="Awaiting a monitor decision." />
        <Metric label="Cases under review" value={openCases} tone="signal" help="A human review is still open." />
        <Metric label="Supported, unassigned" value={awaitingResponse} tone="alert" help="Ready for coordinator routing." />
      </Reveal>

      {/* ---------- Tabs + search ---------- */}
      <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Monitor views"
          className="inline-flex rounded-[12px] bg-[rgba(15,23,42,0.05)] p-1"
        >
          {([
            { id: "inbox" as const, label: "Report inbox", count: reports.length },
            { id: "cases" as const, label: "Cases", count: cases.length },
          ]).map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex min-h-[38px] items-center gap-2 rounded-[9px] px-4 text-[13.5px] font-semibold transition-all duration-200",
                tab === item.id
                  ? "bg-white text-midnight shadow-xs"
                  : "text-slate-ink/75 hover:text-midnight",
              )}
            >
              {item.label}
              <span className="rounded-full bg-[rgba(15,23,42,0.07)] px-1.5 py-0.5 text-[11px] font-bold">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        {tab === "inbox" && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-ink" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports" aria-label="Search reports" className="h-11 pl-10" />
            </div>
            <select aria-label="Filter by polling unit" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="h-11 rounded-xl border border-[var(--hairline)] bg-white px-3 text-sm text-navy">
              <option value="">All polling units</option>
              {[...new Map(reports.map((report) => [report.polling_unit_id, report.polling_units])).entries()].map(([id, unit]) => (
                <option key={id} value={id}>{unit?.code || "Unknown unit"}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13.5px] text-alert">{error}</p>
      )}

      {/* ---------- Inbox ---------- */}
      {tab === "inbox" && (
        <div className="mt-5">
          {loading && reports.length === 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : visibleReports.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={query ? "No reports match that search" : "The inbox is clear"}
              description={
                query
                  ? "Try a different category, reference or phrase."
                  : "New witness reports appear here the moment the server receives them."
              }
            />
          ) : (
            <Stagger className="grid gap-3 lg:grid-cols-2">
              {visibleReports.map((report) => {
                const incidentId = linkedIncidentId(report);
                const checked = selected.includes(report.id);
                return (
                  <StaggerItem key={report.id}>
                    <Card
                      className={cn(
                        "h-full p-5 transition-all duration-300",
                        checked && "ring-2 ring-signal",
                      )}
                    >
                      <div className="flex items-start gap-3.5">
                        {!incidentId ? (
                          <label className="mt-0.5 flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(report.id)}
                              className="size-5 cursor-pointer rounded-[6px] accent-[#2563EB]"
                              aria-label={`Select report ${shortRef(report.id)}`}
                            />
                          </label>
                        ) : (
                          <CategoryGlyph value={report.category} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[15px] font-semibold text-navy">
                              {categoryOf(report.category).label}
                            </p>
                            {incidentId ? (
                              <Badge tone="signal" size="sm">In a case</Badge>
                            ) : (
                              <Badge tone="warn" size="sm">Unverified · not grouped</Badge>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-slate-ink/85">
                            {report.description || "No additional witness context supplied."}
                          </p>
                          <p className="mt-2 text-[12px] leading-relaxed text-slate-ink/75">
                            {report.aiAssessment?.status === "completed"
                              ? `AI observation · provisional: ${report.aiAssessment.provisional_summary || "Summary unavailable"}`
                              : report.aiAssessment?.status === "retryable"
                                ? "AI observation unavailable · reviewer may retry"
                                : "AI observation pending or not requested · human review required"}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-ink">
                            <span className="font-mono tracking-wide">{shortRef(report.id)}</span>
                            <span aria-hidden>·</span>
                            <span>{formatRelative(report.received_at)}</span>
                            <span aria-hidden>·</span>
                            <span>{report.polling_units?.code || "Unknown polling unit"}</span>
                            {incidentId && (
                              <>
                                <span aria-hidden>·</span>
                                <Link
                                  href={`/monitor/incidents/${incidentId}`}
                                  className="font-semibold text-signal hover:underline"
                                >
                                  Open case
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </div>
      )}

      {/* ---------- Cases ---------- */}
      {tab === "cases" && (
        <div className="mt-5">
          {cases.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title="No cases opened yet"
              description="Select related reports in the inbox and group them into a case to start a review."
              action={
                <Button variant="primary" size="md" onClick={() => setTab("inbox")}>
                  Go to the report inbox
                </Button>
              }
            />
          ) : (
            <Stagger className="grid gap-3 lg:grid-cols-2">
              {cases.map((item) => (
                <StaggerItem key={item.id}>
                  <Link href={`/monitor/incidents/${item.id}`} className="block h-full">
                    <Card interactive className="h-full p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewChip state={item.review_state} size="sm" />
                        <ResponseChip state={item.response_state} size="sm" />
                      </div>
                      <p className="mt-3.5 line-clamp-2 text-[15.5px] font-semibold leading-snug text-navy">
                        {item.summary}
                      </p>
                      <p className="mt-2 text-[12.5px] text-slate-ink/75">
                        {item.polling_units
                          ? `${item.polling_units.code} · ${item.polling_units.name}`
                          : "Polling unit unavailable"}
                      </p>
                      <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3.5">
                        <span className="text-[12px] text-muted-ink">
                          {item.incident_reports?.length || 0} linked report
                          {(item.incident_reports?.length || 0) === 1 ? "" : "s"} ·{" "}
                          {formatRelative(item.updated_at)}
                        </span>
                        <span className="flex items-center gap-1 text-[12.5px] font-semibold text-signal">
                          Open <ArrowRight className="size-3.5" aria-hidden />
                        </span>
                      </div>
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      )}

      {/* ---------- Selection action bar ---------- */}
      {selected.length > 0 && tab === "inbox" && (
        <div className="fixed inset-x-0 bottom-[72px] z-40 px-4 md:bottom-6">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 rounded-[16px] bg-midnight px-4 py-3 text-white shadow-lg">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="size-4 text-[#93B4FF]" aria-hidden />
              <p className="text-[13.5px] font-semibold">
                {selected.length} report{selected.length === 1 ? "" : "s"} selected
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="onDark" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
              <Button variant="signal" size="sm" onClick={() => setGrouping(true)}>
                <FolderPlus className="size-4" aria-hidden />
                Group into a case
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={grouping}
        onOpenChange={setGrouping}
        title="Open a case"
        description="Grouping is a human judgement. Write what connects these reports — location, time and subject — in your own words."
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setGrouping(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={summary.trim().length < 8 || reason.trim().length < 12}
              onClick={() => void createCase()}
            >
              Open case with {selected.length} report{selected.length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Case summary"
            htmlFor="summary"
            hint={`${summary.length} / 1200`}
            help="Neutral description of what is alleged. Do not name individuals."
          >
            <Textarea
              id="summary"
              maxLength={1200}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[96px]"
              placeholder="Reports of a possible disruption at the same polling unit during accreditation."
            />
          </Field>
          <Field
            label="Why these reports belong together"
            htmlFor="reason"
            hint={`${reason.length} / 2000`}
            help="Stored on the case timeline and attributed to you."
          >
            <Textarea
              id="reason"
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[96px]"
              placeholder="Location, time window and described events appear consistent; manual review completed."
            />
          </Field>
          <p className="rounded-[12px] bg-canvas p-3.5 text-[12.5px] leading-relaxed text-slate-ink/80 ring-1 ring-inset ring-[var(--hairline)]">
            Reports must come from the same polling unit, and a report already linked to a case
            cannot be grouped again. The case opens as{" "}
            <span className="font-semibold text-navy">{reviewMeta.under_review.label.toLowerCase()}</span>.
          </p>
          {formError && <p role="alert" className="text-[13px] text-alert">{formError}</p>}
        </div>
      </Modal>
    </PageShell>
  );
}

function Metric({
  label, value, help, tone = "neutral",
}: {
  label: string;
  value: number;
  help: string;
  tone?: "neutral" | "signal" | "warn" | "alert";
}) {
  const accent = {
    neutral: "text-navy",
    signal: "text-signal",
    warn: "text-warn",
    alert: "text-alert",
  }[tone];
  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-ink">{label}</p>
      <p className={cn("mt-2 font-display text-[30px] font-semibold leading-none", accent)}>{value}</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-ink/70">{help}</p>
    </Card>
  );
}
