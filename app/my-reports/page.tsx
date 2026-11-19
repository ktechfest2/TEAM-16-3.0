"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Inbox, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { browserSupabase } from "@/lib/client/supabase";
import { listQueuedForReporter, type QueuedReport } from "@/lib/client/outbox";
import { category as categoryOf } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/signa/shell";
import { PageHeader, SectionHeading } from "@/components/signa/page-header";
import { SafetyNotice } from "@/components/signa/safety-notice";
import { CategoryGlyph, DeliveryChip, ResponseChip, ReviewChip } from "@/components/signa/status-chip";
import { Reveal, Stagger, StaggerItem } from "@/components/signa/motion";
import { formatDateTime, formatRelative, shortRef } from "@/lib/utils";
import type { ResponseState, ReviewState } from "@/lib/taxonomy";

type ServerReport = {
  id: string;
  category: string;
  description: string;
  received_at: string;
  caseStatus: { reviewState: ReviewState; responseState: ResponseState } | null;
};

const NO_SESSION_NOTICE = "No active online session. Drafts saved without a reporter session stay hidden on shared devices and cannot be linked or delivered automatically. Keep this browser private; clearing its data deletes them. No recovery is available yet.";

export default function MyReports() {
  const [reports, setReports] = useState<ServerReport[]>([]);
  const [queued, setQueued] = useState<QueuedReport[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const requestGeneration = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setReports([]);
    setQueued([]);
    setNotice("");
    try {
      const supabase = browserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (generation !== requestGeneration.current) return;
      const reporterId = session?.user.id ?? null;
      const queuedReports = await listQueuedForReporter(reporterId);
      if (generation !== requestGeneration.current) return;
      setQueued(queuedReports);
      if (!session) {
        setNotice(NO_SESSION_NOTICE);
        return;
      }
      const r = await fetch("/api/reports/mine", {
        headers: { authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error("Unable to load server reports");
      const payload = await r.json() as { reports?: ServerReport[] };
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (generation !== requestGeneration.current) return;
      if ((currentSession?.user.id ?? null) !== reporterId) {
        requestGeneration.current += 1;
        setReports([]);
        setQueued([]);
        setNotice(currentSession ? "" : NO_SESSION_NOTICE);
        setLoading(false);
        if (currentSession) window.setTimeout(() => void loadRef.current(), 0);
        return;
      }
      setReports(Array.isArray(payload.reports) ? payload.reports : []);
      setNotice("");
    } catch (e) {
      if (generation === requestGeneration.current) {
        setReports([]);
        setNotice(e instanceof Error ? e.message : "Unable to load reports");
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, []);
  loadRef.current = load;

  useEffect(() => {
    let observedReporterId: string | null | undefined;
    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = browserSupabase();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const nextReporterId = session?.user.id ?? null;
        if (observedReporterId === undefined) {
          observedReporterId = nextReporterId;
          return;
        }
        if (nextReporterId === observedReporterId && _event !== "SIGNED_OUT") return;

        observedReporterId = nextReporterId;
        requestGeneration.current += 1;
        setReports([]);
        setQueued([]);
        setLoading(false);
        if (nextReporterId) {
          setNotice("");
          // Supabase auth callbacks should stay synchronous; start the read after it returns.
          window.setTimeout(() => void loadRef.current(), 0);
        } else {
          setNotice(NO_SESSION_NOTICE);
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // `load` reports incomplete browser configuration without leaking stale rows.
    }

    void load();
    return () => unsubscribe?.();
  }, [load]);

  const total = reports.length + queued.length;

  return (
    <PageShell width="default" className="pb-16">
      <Reveal>
        <PageHeader
          eyebrow={<><FileText className="size-3.5" aria-hidden /> Reporter tracking</>}
          title="My reports"
          description="Only reports linked to your current reporter session can be retrieved. Clearing browser data may end a temporary session."
          actions={
            <>
              <Button variant="secondary" size="md" onClick={() => void load()} loading={loading}>
                <RefreshCw className="size-4" aria-hidden />
                Refresh
              </Button>
              <Button asChild variant="primary" size="md">
                <Link href="/report">
                  <Plus className="size-4" aria-hidden />
                  New report
                </Link>
              </Button>
            </>
          }
        />
      </Reveal>

      <Reveal delay={0.06} className="mt-7 grid gap-3 sm:grid-cols-3">
        <StatTile label="Total reports" value={total} help="Across this device and your session." />
        <StatTile label="Waiting on this device" value={queued.length} tone="warn" help="Saved locally, not yet confirmed." />
        <StatTile label="Received by server" value={reports.length} tone="ok" help="Receipt confirmed. Review may not have started." />
      </Reveal>

      {notice && (
        <Reveal delay={0.1} className="mt-5">
          <SafetyNotice tone="info" title="Session notice">
            <span role="status">{notice}</span>
          </SafetyNotice>
        </Reveal>
      )}

      {/* ---------- Locally pending ---------- */}
      {queued.length > 0 && (
        <section className="mt-10">
          <SectionHeading
            title="Waiting on this device"
            description="These stay on your phone until the server confirms receipt. Use Sync on the report screen when you are online."
          />
          <Stagger className="mt-5 grid gap-3 md:grid-cols-2">
            {queued.map((item) => (
              <StaggerItem key={item.payload.id}>
                <Card interactive className="h-full border-l-4 border-l-warn p-5">
                  <div className="flex items-start gap-3.5">
                    <CategoryGlyph value={item.payload.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold text-navy">
                          {categoryOf(item.payload.category).label}
                        </p>
                        <DeliveryChip state={item.state === "failed" ? "failed" : "saved"} size="sm" />
                      </div>
                      <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-slate-ink/85">
                        {item.payload.description}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-ink">
                        <span className="font-mono tracking-wide">{shortRef(item.payload.id)}</span>
                        <span aria-hidden>·</span>
                        <span>Saved {formatRelative(item.queuedAt)}</span>
                      </div>
                      {item.error && (
                        <p className="mt-2 text-[12.5px] text-alert">{item.error}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* ---------- Received ---------- */}
      <section className="mt-10">
        <SectionHeading
          title="Received by the server"
          description="Receipt is not a verdict. A monitor decides whether a report becomes a reviewed case."
        />

        {loading ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            className="mt-5"
            icon={Inbox}
            title="No delivered reports yet"
            description="When a report reaches the server, it appears here with its reference and the time it was received."
            action={
              <Button asChild variant="primary" size="md">
                <Link href="/report">Create your first report</Link>
              </Button>
            }
          />
        ) : (
          <Stagger className="mt-5 grid gap-3 md:grid-cols-2">
            {reports.map((report) => (
              <StaggerItem key={report.id}>
                <Card interactive className="h-full p-5">
                  <div className="flex items-start gap-3.5">
                    <CategoryGlyph value={report.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold text-navy">
                          {categoryOf(report.category).label}
                        </p>
                      </div>
                      <p className="mt-2 line-clamp-4 text-[13.5px] leading-relaxed text-slate-ink/85">
                        {report.description}
                      </p>
                      <div className="mt-4 grid gap-3 border-t border-[var(--hairline)] pt-3 sm:grid-cols-3">
                        <div className="min-w-0">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-ink">
                            Delivery
                          </p>
                          <DeliveryChip state="received" size="sm" />
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-ink">
                            Verification
                          </p>
                          {report.caseStatus ? (
                            <ReviewChip state={report.caseStatus.reviewState} size="sm" />
                          ) : (
                            <span className="text-[12px] text-muted-ink">Not in a case yet</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-ink">
                            Response
                          </p>
                          {report.caseStatus ? (
                            <ResponseChip state={report.caseStatus.responseState} size="sm" />
                          ) : (
                            <span className="text-[12px] text-muted-ink">No case response status</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-ink sm:col-span-3">
                          Response updates reflect internal coordination only; they do not mean emergency responders were dispatched.
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-ink">
                        <span className="font-mono tracking-wide">{shortRef(report.id)}</span>
                        <span aria-hidden>·</span>
                        <span>Received {formatDateTime(report.received_at)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      <Reveal delay={0.1} className="mt-10">
        <Card className="flex flex-col gap-3 bg-midnight p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#93B4FF]" aria-hidden />
            <div>
              <p className="text-[14.5px] font-semibold text-white">Your report stays private</p>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#AEBDD4]">
                Reports are visible only to you and to approved monitors. There is no public feed,
                and no one is named or accused inside Signa.
              </p>
            </div>
          </div>
        </Card>
      </Reveal>
    </PageShell>
  );
}

function StatTile({
  label, value, help, tone = "neutral",
}: {
  label: string;
  value: number;
  help: string;
  tone?: "neutral" | "warn" | "ok";
}) {
  const accent = {
    neutral: "text-navy",
    warn: "text-warn",
    ok: "text-ok",
  }[tone];
  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-ink">{label}</p>
      <p className={`mt-2 font-display text-[32px] font-semibold leading-none ${accent}`}>{value}</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-ink/70">{help}</p>
    </Card>
  );
}
