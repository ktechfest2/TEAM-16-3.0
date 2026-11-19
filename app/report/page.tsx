"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Camera, CheckCircle2, CloudUpload, ImagePlus, Loader2, MapPin, RefreshCw, Siren, Wifi, WifiOff,
} from "lucide-react";
import { categories, parseReport, type ReportPayload } from "@/lib/report-contract";
import { flushQueued, listQueuedForReporter, queueReport } from "@/lib/client/outbox";
import { flushQueuedEvidence, listEvidenceForReporter, queueEvidence, retryEvidence, type QueuedEvidence } from "@/lib/client/evidence-outbox";
import { bearerHeaders, citizenSupabase, getCitizenSession } from "@/lib/client/supabase";
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
import { MAX_EVIDENCE_BYTES } from "@/lib/evidence-contract";

type Unit = { id: string; code: string; name: string; is_simulated: boolean };
type SelectedPhoto = { evidenceId: string; file: File };
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);


export default function ReportPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSavedRef, setLastSavedRef] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [photosForReportId, setPhotosForReportId] = useState<string | null>(null);
  const [photosForReporterId, setPhotosForReporterId] = useState<string | null>(null);
  const [evidenceRecords, setEvidenceRecords] = useState<QueuedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const pendingGeneration = useRef(0);
  const syncGeneration = useRef(0);
  const submitting = useRef(false);

  const refreshPending = useCallback(async () => {
    const generation = ++pendingGeneration.current;
    try {
      const { data: { session } } = await getCitizenSession();
      const records = await listQueuedForReporter(session?.user.id ?? null);
      if (generation === pendingGeneration.current) setPending(records.length);
    } catch {
      if (generation === pendingGeneration.current) setPending(0);
    }
  }, []);

  const refreshEvidence = useCallback(async () => {
    try {
      const { data: { session } } = await getCitizenSession();
      setEvidenceRecords(await listEvidenceForReporter(session?.user.id ?? null));
    } catch {
      setEvidenceRecords([]);
      setEvidenceError("Local photo storage is unavailable in this browser.");
    }
  }, []);

  useEffect(() => {
    const lastUnit = localStorage.getItem("signa:last-polling-unit");
    if (lastUnit) setUnitId(lastUnit);
    const cached = localStorage.getItem("signa-units");
    if (cached) { try { setUnits(JSON.parse(cached)); } catch {} }
    void fetch("/api/polling-units").then(r=>r.json()).then(data=>{
      if (Array.isArray(data.units)) { setUnits(data.units); localStorage.setItem("signa-units", JSON.stringify(data.units)); }
    }).catch(()=>{});
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: { subscription } } = citizenSupabase().auth.onAuthStateChange(() => {
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
    void refreshEvidence();
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
  }, [refreshEvidence, refreshPending]);

  async function sync() {
    const generation = ++syncGeneration.current;
    try {
      const { data: { session: initialSession } } = await getCitizenSession();
      const result = await flushQueued();
      const { data: { session: currentSession } } = await getCitizenSession();
      if (generation !== syncGeneration.current || (currentSession?.user.id ?? null) !== (initialSession?.user.id ?? null)) {
        await refreshPending();
        return;
      }
      await refreshPending();
      if (currentSession?.user.id && currentSession.access_token) {
        const evidenceResult = await flushQueuedEvidence(currentSession.user.id, currentSession.access_token);
        if (evidenceResult.errors.length) setEvidenceError(evidenceResult.errors.join("; "));
        else if (evidenceResult.received.length) setEvidenceError("");
      }
      await refreshEvidence();
      if (result.delivered.length) setNotice(`${result.delivered.length} report(s) received by the server.`);
      if (result.errors.length) setError(result.errors.join("; "));
    } catch { setError("Could not check pending reports. They remain saved locally."); }
  }

  async function submit() {
    if (submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const payload: ReportPayload = parseReport({
        id: crypto.randomUUID(), pollingUnitId: unitId, category,
        description, clientCreatedAt: new Date().toISOString(), occurredAt: null,
        aiProcessingConsent: true, fictionalTestSubmission: true,
      });
      let reporterId: string | null = null;
      try {
        let { data: { session } } = await getCitizenSession();
        if (!session && navigator.onLine) {
          await bearerHeaders();
          ({ data: { session } } = await getCitizenSession());
        }
        reporterId = session?.user.id ?? null;
      } catch {
        // Offline reports without a session remain unassigned and are never shown to another reporter.
      }
      await queueReport(payload, reporterId);
      if (selectedPhotos.length && !photosForReportId) {
        setPhotosForReportId(payload.id);
        setPhotosForReporterId(reporterId);
        try {
          await queueEvidence(selectedPhotos.map(({ evidenceId, file }) => ({
            evidenceId,
            reportId: payload.id,
            reporterId,
            file,
            fileName: file.name || "photo",
            mimeType: file.type,
            byteSize: file.size,
            state: "waiting_for_report" as const,
          })));
          setSelectedPhotos([]);
          setPhotosForReportId(null);
          setPhotosForReporterId(null);
          setEvidenceError("");
        } catch {
          setEvidenceError("The alert was saved, but this browser could not save the selected photo for retry. Keep this page open and try again.");
        }
      }
      setDescription("");
      setLastSavedRef(shortRef(payload.id));
      setNotice(reporterId
        ? `Saved on this device (${payload.id.slice(0, 8)}). NOT delivered until the server confirms receipt.`
        : `Saved on this device (${payload.id.slice(0, 8)}), but no reporter session was available. This draft cannot be linked or synced automatically; keep this browser private and do not clear its data. NOT delivered.`);
      await refreshPending();
      await refreshEvidence();
      if (navigator.onLine) await sync();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save report locally"); }
    finally { submitting.current = false; setBusy(false); }
  }

  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const accepted: SelectedPhoto[] = [];
    const issues: string[] = [];
    for (const file of Array.from(files)) {
      if (!PHOTO_TYPES.has(file.type)) {
        issues.push(`${file.name}: choose a JPEG, PNG or WebP image.`);
      } else if (file.size < 1 || file.size > MAX_EVIDENCE_BYTES) {
        issues.push(`${file.name}: images must be no larger than 4 MiB.`);
      } else {
        accepted.push({ evidenceId: crypto.randomUUID(), file });
      }
    }
    setSelectedPhotos((current) => [...current, ...accepted]);
    setEvidenceError(issues.join(" "));
  }

  async function retryPhoto(evidenceId: string) {
    setEvidenceError("");
    try {
      const { data: { session } } = await getCitizenSession();
      if (!session) throw new Error("Sign in to the original reporter session to retry this photo.");
      await retryEvidence(evidenceId, session.user.id);
      await sync();
    } catch (e) {
      setEvidenceError(e instanceof Error ? e.message : "Could not retry this photo.");
    }
  }

  async function saveSelectedPhotosForRetry() {
    if (!photosForReportId) return;
    setEvidenceError("");
    try {
      const { data: { session } } = await getCitizenSession();
      const currentReporterId = session?.user.id ?? null;
      if (currentReporterId !== photosForReporterId)
        throw new Error("Sign back in to the reporter session that saved the alert before retrying these photos.");
      await queueEvidence(selectedPhotos.map(({ evidenceId, file }) => ({
        evidenceId,
        reportId: photosForReportId,
        reporterId: currentReporterId,
        file,
        fileName: file.name || "photo",
        mimeType: file.type,
        byteSize: file.size,
        state: "waiting_for_report" as const,
      })));
      setSelectedPhotos([]);
      setPhotosForReportId(null);
      setPhotosForReporterId(null);
      await refreshEvidence();
      if (navigator.onLine) await sync();
    } catch (e) {
      setEvidenceError(e instanceof Error ? e.message : "The selected photos could not be saved for retry.");
    }
  }

  const ready = !!unitId && categories.includes(category as (typeof categories)[number]);
  const selectedUnit = units.find((u) => u.id === unitId);
  const activeCategory = category ? categoryOf(category) : null;

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
              <Select id="unit" value={unitId} onChange={(e) => { setUnitId(e.target.value); if (e.target.value) localStorage.setItem("signa:last-polling-unit", e.target.value); else localStorage.removeItem("signa:last-polling-unit"); }}>
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
          {activeCategory && <p className="mt-3 text-[13px] text-slate-ink/75">{activeCategory.description}</p>}
        </Card>
      </Reveal>

      {/* ---------- Step 3 · Describe ---------- */}
      <Reveal delay={0.18} className="mt-4">
        <Card className="p-5 sm:p-6">
          <StepLabel index={3} title="Describe what you observed" />
          <div className="mt-4">
            <Field
              label="More details (optional)"
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
          <p className="mt-3 text-[12px] leading-relaxed text-slate-ink/80">Fictional test reports submitted here may be assessed by AI, including attached photos. A human reviewer decides what is supported. Do not include real personal information.</p>
        </Card>
      </Reveal>

      {/* ---------- Optional photo evidence ---------- */}
      <Reveal delay={0.2} className="mt-4">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-trust-soft text-trust"><Camera className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-tight">Optional photo evidence</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-ink/75">Photos upload separately after the server confirms this report. Each image must be JPEG, PNG or WebP and no larger than 4 MiB. Never put yourself at risk to collect evidence.</p>
              <input ref={cameraInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a photo" onChange={(event) => { addPhotos(event.target.files); event.currentTarget.value = ""; }} />
              <input ref={galleryInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose photos from gallery" onChange={(event) => { addPhotos(event.target.files); event.currentTarget.value = ""; }} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="md" disabled={!!photosForReportId} onClick={() => cameraInput.current?.click()}><Camera className="size-4" aria-hidden />Take photo</Button>
                <Button type="button" variant="secondary" size="md" disabled={!!photosForReportId} onClick={() => galleryInput.current?.click()}><ImagePlus className="size-4" aria-hidden />Choose from gallery</Button>
              </div>
              {selectedPhotos.length > 0 && (
                <div className="mt-4 space-y-2" aria-label="Selected photos">
                  {selectedPhotos.map(({ evidenceId, file }) => (
                    <div key={evidenceId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-inset ring-[var(--hairline)]">
                      <span className="min-w-0 truncate text-[13px] font-medium text-navy">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · selected on this device</span>
                      <button type="button" className="min-h-10 px-2 text-[13px] font-semibold text-alert underline underline-offset-2" onClick={() => { setSelectedPhotos((items) => items.filter((item) => item.evidenceId !== evidenceId)); if (photosForReportId && selectedPhotos.length === 1) { setPhotosForReportId(null); setPhotosForReporterId(null); } }}>Remove</button>
                    </div>
                  ))}
                  {photosForReportId && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] text-muted-ink">These photos belong to saved report {shortRef(photosForReportId)}.</span>
                      <Button type="button" variant="subtle" size="sm" onClick={() => void saveSelectedPhotosForRetry()}>Save photos for separate upload</Button>
                    </div>
                  )}
                </div>
              )}
              {evidenceRecords.length > 0 && (
                <div className="mt-4 border-t border-[var(--hairline)] pt-4">
                  <h3 className="text-[13px] font-semibold text-navy">Photo upload status</h3>
                  <ul className="mt-2 space-y-2" aria-live="polite">
                    {evidenceRecords.map((record) => (
                      <li key={record.evidenceId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-inset ring-[var(--hairline)]">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-navy">{record.fileName}</p>
                          <p className="text-[12px] text-slate-ink/75">
                            {record.state === "received" ? `Received by server${record.receivedAt ? ` · ${new Date(record.receivedAt).toLocaleString()}` : ""}` : record.state === "waiting_for_report" ? "Waiting for report receipt" : record.state === "uploading" ? "Uploading photo…" : record.state === "failed" ? `Upload failed: ${record.error || "retry available"}` : "Waiting to upload"}
                          </p>
                        </div>
                        {(record.state === "failed" || record.state === "pending") && record.file && (
                          <Button type="button" size="sm" variant="subtle" onClick={() => void retryPhoto(record.evidenceId)}>Retry photo</Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-[12px] leading-relaxed text-muted-ink">Pending photos stay in this browser and are scoped to the reporter session that saved them. A report or photo saved without a reporter session cannot sync automatically.</p>
              {evidenceError && <p role="alert" className="mt-3 text-[13px] text-alert">{evidenceError}</p>}
            </div>
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

            <Button
              type="button"
              variant="primary"
              size="lg"
              full
              className="mt-4"
              disabled={busy || !ready}
              onClick={() => void submit()}
            >
              {busy ? "Saving alert…" : "Submit alert"}
            </Button>

            {!ready && (
              <p className="mt-3 text-center text-[12.5px] text-muted-ink">
                Select a polling unit and incident category to continue.
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
