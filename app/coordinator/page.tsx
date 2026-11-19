"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ClipboardCheck, Handshake, Inbox, ListChecks, LogOut, MapPin, RefreshCw,
} from "lucide-react";
import { browserSupabase } from "@/lib/client/supabase";
import { ApiError, staffFetch } from "@/lib/client/api";
import { category as categoryOf, type ResponseState, type ReviewState } from "@/lib/taxonomy";
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
import { SafetyNotice } from "@/components/signa/safety-notice";
import { ResponseChip, ReviewChip } from "@/components/signa/status-chip";
import { Reveal, Stagger, StaggerItem } from "@/components/signa/motion";
import { cn, formatDateTime, formatRelative, shortRef } from "@/lib/utils";

type Assignment = {
  id: string;
  incident_id: string;
  assigned_at: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  incidents: {
    id: string;
    summary: string;
    review_state: ReviewState;
    response_state: ResponseState;
    updated_at: string;
    polling_units: { code: string; name: string; ward: string | null; lga: string | null } | null;
    incident_reports: { report_id: string; reports: { category: string } | null }[];
  } | null;
};

type Filter = "all" | "new" | "acknowledged";

export default function CoordinatorPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [access, setAccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [ackTarget, setAckTarget] = useState<Assignment | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [followTarget, setFollowTarget] = useState<Assignment | null>(null);
  const [action, setAction] = useState("");
  const [followNote, setFollowNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await staffFetch<{ assignments: Assignment[] }>("/api/coordinator/assignments");
      setAssignments(data.assignments || []);
      setAccess(true);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAccess(false);
        if (e.status === 403) setError("Only approved coordinators can open this queue.");
      } else {
        setError(e instanceof Error ? e.message : "Unable to load your queue");
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
    setAssignments([]);
  }

  async function acknowledge() {
    if (!ackTarget) return;
    setSaving(true);
    setFormError("");
    try {
      await staffFetch(`/api/coordinator/assignments/${ackTarget.id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ note: ackNote || null }),
      });
      setAckTarget(null);
      setAckNote("");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not acknowledge this assignment");
    } finally {
      setSaving(false);
    }
  }

  async function recordFollowUp() {
    if (!followTarget) return;
    setSaving(true);
    setFormError("");
    try {
      await staffFetch(`/api/coordinator/assignments/${followTarget.id}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({ action, note: followNote || null }),
      });
      setFollowTarget(null);
      setAction("");
      setFollowNote("");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not record this follow-up");
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
          title="Response Coordination"
          description="Acknowledge the cases routed to you and log internal follow-up. Coordinators cannot change a review outcome."
          onSignedIn={load}
        />
        {error && (
          <p role="alert" className="mx-auto mt-6 max-w-5xl text-[13.5px] text-alert">{error}</p>
        )}
      </PageShell>
    );
  }

  const pendingAck = assignments.filter((item) => !item.acknowledged_at);
  const acknowledged = assignments.filter((item) => item.acknowledged_at);
  const visible =
    filter === "new" ? pendingAck : filter === "acknowledged" ? acknowledged : assignments;

  return (
    <PageShell width="default" className="pb-16">
      <Reveal>
        <PageHeader
          eyebrow={<><ListChecks className="size-3.5" aria-hidden /> Coordination</>}
          title="My queue"
          description="Cases reviewed as supported and routed to you. Acknowledgement records internal receipt — it is not an emergency dispatch."
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

      <Reveal delay={0.06} className="mt-7">
        <SafetyNotice tone="info" title="What acknowledgement means">
          Confirming receipt tells the monitoring team that a human has the case. Signa never
          contacts police, emergency responders or INEC on your behalf.
        </SafetyNotice>
      </Reveal>

      <div className="mt-7 inline-flex rounded-[12px] bg-[rgba(15,23,42,0.05)] p-1">
        {([
          { id: "all" as const, label: "All", count: assignments.length },
          { id: "new" as const, label: "Needs acknowledgement", count: pendingAck.length },
          { id: "acknowledged" as const, label: "Acknowledged", count: acknowledged.length },
        ]).map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={cn(
              "flex min-h-[38px] items-center gap-2 rounded-[9px] px-3.5 text-[13px] font-semibold transition-all duration-200",
              filter === item.id ? "bg-white text-midnight shadow-xs" : "text-slate-ink/75 hover:text-midnight",
            )}
          >
            {item.label}
            <span className="rounded-full bg-[rgba(15,23,42,0.07)] px-1.5 py-0.5 text-[11px] font-bold">
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 text-[13.5px] text-alert">{error}</p>}

      <div className="mt-5">
        {loading && assignments.length === 0 ? (
          <div className="grid gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter === "new" ? "Nothing waiting on you" : "Your queue is empty"}
            description={
              filter === "new"
                ? "Every case routed to you has been acknowledged."
                : "When a monitor routes a supported case to you, it appears here with its full review history."
            }
          />
        ) : (
          <Stagger className="space-y-3">
            {visible.map((item) => {
              const incident = item.incidents;
              const unit = incident?.polling_units;
              const reportCount = incident?.incident_reports?.length || 0;
              const categories = Array.from(
                new Set(
                  (incident?.incident_reports || [])
                    .map((link) => link.reports?.category)
                    .filter((value): value is string => !!value),
                ),
              );
              return (
                <StaggerItem key={item.id}>
                  <Card
                    className={cn(
                      "p-5 sm:p-6",
                      !item.acknowledged_at && "border-l-4 border-l-signal",
                    )}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {incident && <ReviewChip state={incident.review_state} size="sm" />}
                          {incident && <ResponseChip state={incident.response_state} size="sm" />}
                          <Badge tone="neutral" size="sm" className="font-mono">
                            CASE {shortRef(item.incident_id)}
                          </Badge>
                        </div>
                        <p className="mt-3 text-[16px] font-semibold leading-snug text-navy">
                          {incident?.summary || "Case summary unavailable"}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-slate-ink/80">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5" aria-hidden />
                            {unit ? `${unit.code} · ${unit.name}` : "Polling unit unavailable"}
                          </span>
                          <span>{reportCount} linked report{reportCount === 1 ? "" : "s"}</span>
                          <span>Assigned {formatRelative(item.assigned_at)}</span>
                        </div>
                        {categories.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {categories.map((value) => (
                              <Badge key={value} tone="neutral" size="sm">
                                {categoryOf(value).short}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {item.acknowledgement_note && (
                          <p className="mt-3 rounded-[12px] bg-canvas p-3.5 text-[13px] leading-relaxed text-slate-ink ring-1 ring-inset ring-[var(--hairline)]">
                            <span className="font-semibold text-navy">Your note:</span>{" "}
                            {item.acknowledgement_note}
                          </p>
                        )}
                        {item.acknowledged_at && (
                          <p className="mt-2 text-[12px] text-muted-ink">
                            Acknowledged {formatDateTime(item.acknowledged_at)}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 lg:w-56">
                        {!item.acknowledged_at ? (
                          <Button
                            variant="primary"
                            size="md"
                            full
                            onClick={() => { setAckTarget(item); setFormError(""); }}
                          >
                            <Handshake className="size-4" aria-hidden />
                            Acknowledge
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="md"
                            full
                            onClick={() => { setFollowTarget(item); setFormError(""); }}
                          >
                            <ClipboardCheck className="size-4" aria-hidden />
                            Record follow-up
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="md" full>
                          <Link href={`/monitor/incidents/${item.incident_id}`}>
                            Open case file
                            <ArrowRight className="size-4" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </div>

      {/* ---------- Acknowledge ---------- */}
      <Modal
        open={!!ackTarget}
        onOpenChange={(open) => !open && setAckTarget(null)}
        title="Acknowledge this assignment"
        description="This records that you have received the case internally. It does not contact any external responder."
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setAckTarget(null)}>Cancel</Button>
            <Button variant="primary" size="md" loading={saving} onClick={() => void acknowledge()}>
              Confirm receipt
            </Button>
          </>
        }
      >
        <Field
          label="Note (optional)"
          htmlFor="ack-note"
          help="Shown to monitors on the case timeline."
        >
          <Textarea
            id="ack-note"
            maxLength={2000}
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            className="min-h-[96px]"
            placeholder="I have received this internal monitoring assignment."
          />
        </Field>
        {formError && <p role="alert" className="mt-3 text-[13px] text-alert">{formError}</p>}
      </Modal>

      {/* ---------- Follow-up ---------- */}
      <Modal
        open={!!followTarget}
        onOpenChange={(open) => !open && setFollowTarget(null)}
        title="Record internal follow-up"
        description="Log what was done inside the monitoring organisation. Do not describe actions taken by others."
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setFollowTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={action.trim().length < 4}
              onClick={() => void recordFollowUp()}
            >
              Save to case timeline
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Action taken" htmlFor="action" hint={`${action.length} / 400`}>
            <Input
              id="action"
              maxLength={400}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Referred internally to the authorised monitoring desk"
            />
          </Field>
          <Field label="Note (optional)" htmlFor="follow-note">
            <Textarea
              id="follow-note"
              maxLength={2000}
              value={followNote}
              onChange={(e) => setFollowNote(e.target.value)}
              className="min-h-[88px]"
              placeholder="No external responders were contacted by this application."
            />
          </Field>
          {formError && <p role="alert" className="text-[13px] text-alert">{formError}</p>}
        </div>
      </Modal>
    </PageShell>
  );
}
