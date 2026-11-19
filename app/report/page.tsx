"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, CloudUpload, Loader2, MapPin, RefreshCw, Siren, Wifi, WifiOff,
} from "lucide-react";
import { categories, parseReport, type ReportPayload } from "@/lib/report-contract";
import { flushQueued, listQueuedForReporter, queueReport } from "@/lib/client/outbox";
import { bearerHeaders, browserSupabase } from "@/lib/client/supabase";
import { categoryMeta, category as categoryOf } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Textarea } from "@/components/ui/field";
import { PageShell } from "@/components/signa/shell";
import { PageHeader } from "@/components/signa/page-header";
import { SafetyNotice } from "@/components/signa/safety-notice";
import { DeliveryChip } from "@/components/signa/status-chip";
import { AnimatePresence, Reveal, motion } from "@/components/signa/motion";
import { cn, shortRef } from "@/lib/utils";

type Unit = { id: string; code: string; name: string; is_simulated: boolean };

const HOLD_MS = 3000;

export default function ReportPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [category, setCategory] = useState<string>("disruption");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [holding, setHolding] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSavedRef, setLastSavedRef] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGeneration = useRef(0);
  const syncGeneration = useRef(0);

  const refreshPending = useCallback(async () => {
    const generation = ++pendingGeneration.current;
    try {
      const { data: { session } } = await browserSupabase().auth.getSession();
      const records = await listQueuedForReporter(session?.user.id ?? null);
      if (generation === pendingGeneration.current) setPending(records.length);
    } catch {
      if (generation === pendingGeneration.current) setPending(0);
    }
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem("signa-units");
    if (cached) { try { setUnits(JSON.parse(cached)); } catch {} }
    void fetch("/api/polling-units").then(r=>r.json()).then(data=>{
      if (Array.isArray(data.units)) { setUnits(data.units); localStorage.setItem("signa-units", JSON.stringify(data.units)); }
    }).catch(()=>{});
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: { subscription } } = browserSupabase().auth.onAuthStateChange(() => {
        pendingGeneration.current += 1;
        syncGeneration.current += 1;
        setPending(0);
        window.setTimeout(() => void refreshPending(), 0);
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // Pending local records still remain durable if auth is not configured.
    }
    void refreshPending();
    setOnline(navigator.onLine);
    const onOnline = () => { setOnline(true); void sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsubscribe?.();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshPending]);

  async function sync() {
    const generation = ++syncGeneration.current;
    try {
      const supabase = browserSupabase();
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      const result = await flushQueued();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (generation !== syncGeneration.current || (currentSession?.user.id ?? null) !== (initialSession?.user.id ?? null)) {
        await refreshPending();
        return;
      }
      await refreshPending();
      if (result.delivered.length) setNotice(`${result.delivered.length} report(s) received by the server.`);
      if (result.errors.length) setError(result.errors.join("; "));
    } catch { setError("Could not check pending reports. They remain saved locally."); }
  }

  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const payload: ReportPayload = parseReport({
        id: crypto.randomUUID(), pollingUnitId: unitId, category,
        description, clientCreatedAt: new Date().toISOString(), occurredAt: null,
      });
      let reporterId: string | null = null;
      try {
        const supabase = browserSupabase();
        let { data: { session } } = await supabase.auth.getSession();
        if (!session && navigator.onLine) {
          await bearerHeaders();
          ({ data: { session } } = await supabase.auth.getSession());
        }
        reporterId = session?.user.id ?? null;
      } catch {
        // Offline reports without a session remain unassigned and are never shown to another reporter.
      }
      await queueReport(payload, reporterId);
      setDescription("");
      setLastSavedRef(shortRef(payload.id));
      setNotice(reporterId
        ? `Saved on this device (${payload.id.slice(0, 8)}). NOT delivered until the server confirms receipt.`
        : `Saved on this device (${payload.id.slice(0, 8)}), but no reporter session was available. This draft cannot be linked or synced automatically; keep this browser private and do not clear its data. NOT delivered.`);
      await refreshPending();
      if (navigator.onLine) await sync();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save report locally"); }
    finally { setBusy(false); }
  }

  function startHold() { if(busy) return; setHolding(true); timer.current = setTimeout(()=>{ setHolding(false); void submit(); }, HOLD_MS); }
  function stopHold() { setHolding(false); if(timer.current) {clearTimeout(timer.current);timer.current=null;} }

  const ready = !!unitId && description.trim().length >= 3;
  const selectedUnit = units.find((u) => u.id === unitId);
  const activeCategory = categoryOf(category);

  return (
    <PageShell width="narrow" className="pb-16">
      <Reveal>
        <PageHeader
          eyebrow={
            <>
              <Siren className="size-3.5" aria-hidden /> Witness portal
            </>
          }
          title="Report an incident"
          description="Three short steps. Your report is saved on this device first, then delivered when a connection is available."
          actions={
            <Badge tone={online ? "ok" : "warn"} size="lg">
              {online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
              {online ? "Online" : "Offline — reports still save"}
            </Badge>
          }
        />
      </Reveal>

      <Reveal delay={0.06} className="mt-7">
        <SafetyNotice title="This button does not call emergency services.">
          In immediate danger, move to safety and contact authorised emergency responders. Never put
          yourself at risk to collect evidence.
        </SafetyNotice>
      </Reveal>

      {/* ---------- Step 1 · Where ---------- */}
      <Reveal delay={0.1} className="mt-6">
        <Card className="p-5 sm:p-6">
          <StepLabel index={1} title="Where did it happen?" />
          <div className="mt-4">
            <Field
              label="Polling unit"
              htmlFor="unit"
              help="This build uses fictional polling units. If the list is empty, connect once to load it."
            >
              <Select id="unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select simulated polling unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <AnimatePresence>
              {selectedUnit && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-trust"
                >
                  <MapPin className="size-3.5" aria-hidden />
                  {selectedUnit.code} · {selectedUnit.name}
                  {selectedUnit.is_simulated ? " · simulated" : ""}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </Reveal>

      {/* ---------- Step 2 · What ---------- */}
      <Reveal delay={0.14} className="mt-4">
        <Card className="p-5 sm:p-6">
          <StepLabel index={2} title="What did you see?" />
          <fieldset className="mt-4">
            <legend className="sr-only">Issue type</legend>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {categories.map((key) => {
                const meta = categoryMeta[key];
                const Icon = meta.icon;
                const active = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(key)}
                    className={cn(
                      "flex min-h-[86px] flex-col items-start gap-2 rounded-[14px] p-3.5 text-left transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      active
                        ? "bg-midnight text-white shadow-[0_8px_24px_rgba(11,18,32,0.18)]"
                        : "bg-canvas text-navy ring-1 ring-inset ring-[var(--hairline)] hover:bg-white hover:shadow-sm",
                    )}
                  >
                    <Icon className={cn("size-[18px]", active ? "text-white" : "text-slate-ink")} aria-hidden />
                    <span className="text-[13.5px] font-semibold leading-tight">{meta.short}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-3.5 text-[13px] leading-relaxed text-slate-ink/75">{activeCategory.description}</p>
        </Card>
      </Reveal>

      {/* ---------- Step 3 · Describe ---------- */}
      <Reveal delay={0.18} className="mt-4">
        <Card className="p-5 sm:p-6">
          <StepLabel index={3} title="Describe what you observed" />
          <div className="mt-4">
            <Field
              label="Your account"
              htmlFor="description"
              hint={`${description.length} / 1600`}
              help="Describe only what you saw or heard. Do not share a person's private details, and do not accuse anyone by name."
            >
              <Textarea
                id="description"
                maxLength={1600}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="For example: accreditation stopped for about 40 minutes and voters were asked to leave the queue."
              />
            </Field>
          </div>
        </Card>
      </Reveal>

      {/* ---------- Submit ---------- */}
      <Reveal delay={0.22} className="mt-4">
        <Card className="overflow-hidden">
          <div className="p-5 sm:p-6">
            <p className="text-[13px] leading-relaxed text-slate-ink/80">
              Your report will be reviewed by a human monitor. Submitting an allegation does not
              prove that it occurred.
            </p>

            <HoldButton
              holding={holding}
              busy={busy}
              disabled={busy || !ready}
              onStart={startHold}
              onStop={stopHold}
            />

            <Button
              type="button"
              variant="secondary"
              size="lg"
              full
              className="mt-2.5"
              disabled={busy || !ready}
              onClick={() => void submit()}
            >
              Accessible option — save alert now
            </Button>

            {!ready && (
              <p className="mt-3 text-center text-[12.5px] text-muted-ink">
                Select a polling unit and describe what you saw to continue.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] bg-canvas px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <CloudUpload className="size-4 text-slate-ink" aria-hidden />
              <div>
                <p className="text-[13.5px] font-semibold text-navy">
                  {pending} report{pending === 1 ? "" : "s"} waiting on this device
                </p>
                <p className="text-[12px] text-slate-ink/70">
                  Waiting means saved locally, not yet confirmed by the server.
                </p>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-slate-ink/70">
                  Drafts saved before a reporter session exists are hidden when signed out and cannot be linked or delivered automatically. Keep this browser private; clearing its data deletes them. No recovery is available yet.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              disabled={busy}
              onClick={() => void sync()}
            >
              <RefreshCw className="size-4" aria-hidden />
              Sync now
            </Button>
          </div>
        </Card>
      </Reveal>

      {/* ---------- Confirmation / error ---------- */}
      <div aria-live="polite" className="mt-4 space-y-3">
        <AnimatePresence mode="popLayout">
          {notice && (
            <motion.div
              key={notice}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="border-l-4 border-l-ok p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-navy">Alert recorded</p>
                      <DeliveryChip state={busy ? "sending" : "saved"} size="sm" />
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-ink/85" role="status">
                      {notice}
                    </p>
                    {lastSavedRef && (
                      <p className="mt-2 font-mono text-[12px] tracking-wide text-muted-ink">
                        Reference {lastSavedRef}
                      </p>
                    )}
                    <Button asChild variant="link" size="sm" className="mt-2.5">
                      <Link href="/my-reports">
                        Track this report
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {error && (
            <motion.div
              key={error}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <Card className="border-l-4 border-l-alert p-5">
                <p className="text-[13.5px] leading-relaxed text-alert" role="alert">{error}</p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageShell>
  );
}

function StepLabel({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-midnight text-[12px] font-bold text-white">
        {index}
      </span>
      <h2 className="text-[17px] font-semibold leading-tight">{title}</h2>
    </div>
  );
}

/**
 * Hold-to-send guard. A deliberate 3-second press prevents accidental alerts
 * on a phone in a pocket or a shaking hand, and the fill makes the wait legible.
 */
function HoldButton({
  holding, busy, disabled, onStart, onStop,
}: {
  holding: boolean;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onStart}
      onPointerUp={onStop}
      onPointerLeave={onStop}
      onPointerCancel={onStop}
      className={cn(
        "relative mt-5 flex min-h-[64px] w-full items-center justify-center overflow-hidden rounded-[16px] bg-alert px-6 text-[16px] font-semibold text-white shadow-[0_10px_30px_rgba(220,38,38,0.26)] transition-all duration-200 select-none",
        "disabled:bg-[rgba(15,23,42,0.08)] disabled:text-muted-ink disabled:shadow-none",
        holding && "scale-[0.99]",
      )}
      aria-busy={busy || undefined}
    >
      {holding && (
        <motion.span
          className="absolute inset-y-0 left-0 bg-white/22"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: HOLD_MS / 1000, ease: "linear" }}
          aria-hidden
        />
      )}
      <span className="relative flex items-center gap-2.5">
        {busy ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Saving…
          </>
        ) : holding ? (
          "Keep holding…"
        ) : (
          <>
            <Siren className="size-5" aria-hidden />
            Hold 3 seconds to send alert
          </>
        )}
      </span>
    </button>
  );
}
