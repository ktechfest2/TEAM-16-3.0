"use client";

import { useEffect, useState } from "react";
import { ImageIcon, ScanSearch, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hashDistance, type ImageInspection } from "@/lib/media-integrity";
import { inspectLocalImage } from "@/lib/client/media-integrity";

type LocalResult = ImageInspection & { perceptualHash: string };
type Observation = { summary: string; visibleText: string; observations: string[]; uncertainty: string[]; mayBeNonPhotographic: boolean | null };

export function MediaIntegrityPanel({ externalEnabled, onUseText }: { externalEnabled: boolean; onUseText: (text: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [reference, setReference] = useState<File | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null); const [referenceResult, setReferenceResult] = useState<LocalResult | null>(null);
  const [preview, setPreview] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false); const [observation, setObservation] = useState<Observation | null>(null); const [providerError, setProviderError] = useState("");
  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);

  async function inspect() {
    if (!file) return; setBusy(true); setError(""); setResult(null); setReferenceResult(null); setObservation(null);
    try {
      const primary = await inspectLocalImage(file); setResult(primary);
      if (reference) setReferenceResult(await inspectLocalImage(reference));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Image inspection failed"); }
    finally { setBusy(false); }
  }

  async function requestObservation() {
    if (!file || !consent || !externalEnabled) return; setBusy(true); setProviderError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("externalProcessingConsent", "true");
      const response = await fetch("/api/media-integrity/observe", { method: "POST", body: form, cache: "no-store" });
      const body = await response.json().catch(() => null) as { observation?: Observation; error?: { message?: string } } | null;
      if (!response.ok || !body?.observation) throw new Error(body?.error?.message || "External image observations are unavailable");
      setObservation(body.observation);
    } catch (caught) { setProviderError(caught instanceof Error ? caught.message : "External image observations are unavailable"); }
    finally { setBusy(false); }
  }

  const exact = result && referenceResult ? result.sha256 === referenceResult.sha256 : false;
  const distance = result && referenceResult ? hashDistance(result.perceptualHash, referenceResult.perceptualHash) : null;
  return <Card className="mt-6 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal/10 text-signal"><ScanSearch className="size-5" aria-hidden /></span><div><h2 className="text-xl font-semibold">Media Integrity</h2><p className="mt-1 text-sm leading-relaxed text-slate-ink/75">Inspect a public image locally, compare an optional reference, and request limited visual observations. This does not prove authenticity or detect AI generation.</p></div></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="rounded-xl border border-dashed border-[var(--hairline-strong)] p-4 text-sm font-semibold text-navy">Choose image<input aria-label="Image to inspect" type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-xs font-normal" onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); setReferenceResult(null); setObservation(null); setProviderError(""); setError(""); }} /></label><label className="rounded-xl border border-dashed border-[var(--hairline-strong)] p-4 text-sm font-semibold text-navy">Compare another image <span className="font-normal text-muted-ink">(optional)</span><input aria-label="Authorized reference image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-xs font-normal" onChange={(event) => { setReference(event.target.files?.[0] || null); setReferenceResult(null); setError(""); }} /><span className="mt-2 block text-xs font-normal text-muted-ink">Comparison stays in this browser. Private evidence is not searched.</span></label></div>
    {preview && <img src={preview} alt="Selected image preview" className="mt-4 max-h-72 w-full rounded-xl bg-canvas object-contain" />}
    <Button className="mt-4" type="button" variant="secondary" loading={busy} disabled={!file} onClick={() => void inspect()}><ImageIcon className="size-4" aria-hidden />Check image</Button>
    {error && <p role="alert" className="mt-3 rounded-xl bg-alert/5 p-3 text-sm text-alert">{error}</p>}
    {result && <div className="mt-5 space-y-4" aria-live="polite"><div className="rounded-xl bg-trust-soft p-4"><h3 className="font-semibold text-trust">Image checked locally</h3><p className="mt-1 text-sm text-slate-ink">The file decoded as {result.mimeType.replace("image/", "").toUpperCase()} at {result.width}×{result.height}. Provenance remains unknown.</p></div>
      {referenceResult && <div className="rounded-xl bg-canvas p-4"><h3 className="text-sm font-semibold">Comparison result</h3><p className="mt-2 text-sm text-slate-ink">{exact ? "These files are exact byte-for-byte duplicates." : distance !== null && distance <= 8 ? "The images may be visually similar. Human comparison is required." : "No strong similarity was found by this local comparison."}</p><p className="mt-1 text-xs text-muted-ink">Similarity does not prove reuse, authorship or manipulation.</p></div>}
      <details className="rounded-xl border border-[var(--hairline)] p-4"><summary className="cursor-pointer text-sm font-semibold text-navy">Technical details</summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Signal title="SHA-256" text={result.sha256} /><Signal title="Decoded file" text={`${result.mimeType} · ${result.width}×${result.height} · ${(result.byteSize / 1024).toFixed(1)} KB`} />{referenceResult && <Signal title="Similarity distance" text={`${distance}/64${exact ? " · exact SHA-256 match" : ""}`} />}<Signal title="Content credentials" text="C2PA verification is not available in this build. Unknown provenance is not evidence of manipulation." /></div><div className="mt-4"><h3 className="text-sm font-semibold">Available metadata</h3>{Object.keys(result.metadata).length ? <dl className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(result.metadata).map(([key, value]) => <div key={key}><dt className="text-xs font-semibold text-muted-ink">{key}</dt><dd className="text-sm text-slate-ink">{value}</dd></div>)}</dl> : <p className="mt-2 text-sm text-slate-ink/75">No supported metadata was found. Missing metadata is not evidence of editing or manipulation.</p>}{result.metadata.Software && <p className="mt-2 text-xs text-warn">A software tag records processing history, but does not establish deceptive manipulation.</p>}</div></details>
    </div>}
    <div className="mt-5 border-t border-[var(--hairline)] pt-5"><label className="flex items-start gap-3 text-sm leading-relaxed text-slate-ink"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 accent-signal" /><span>I agree to send this public image to Gemini for visible-content observations and optional text extraction. I confirm it contains no private incident evidence or personal information.</span></label><Button className="mt-3" type="button" loading={busy} disabled={!file || !consent || !externalEnabled} onClick={() => void requestObservation()}><ShieldQuestion className="size-4" aria-hidden />Request visual observations</Button>{!externalEnabled && <p className="mt-2 text-xs text-muted-ink">External visual observations are disabled. Local integrity checks remain available.</p>}{providerError && <p role="alert" className="mt-3 text-sm text-alert">{providerError}</p>}
      {observation && <div className="mt-4 rounded-xl bg-canvas p-4"><h3 className="font-semibold">Provisional visual observations</h3><p className="mt-2 text-sm leading-relaxed text-slate-ink">{observation.summary}</p>{observation.observations.length > 0 && <ul className="mt-3 space-y-1 text-sm text-slate-ink">{observation.observations.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul>}<p className="mt-3 text-xs text-muted-ink">Content type: {observation.mayBeNonPhotographic === true ? "may be a screenshot, graphic, cartoon or document" : observation.mayBeNonPhotographic === false ? "appears photographic, without authenticity verification" : "unclear"}.</p>{observation.visibleText && <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-ink">Extracted visible text</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-ink">{observation.visibleText}</p><Button className="mt-2" type="button" size="sm" variant="secondary" onClick={() => onUseText(observation.visibleText)}>Use as claim text</Button></div>}<p className="mt-3 text-xs text-muted-ink">{observation.uncertainty.join(" ") || "Treat all observations as uncertain."} Gemini is not used as a synthetic-image detector.</p></div>}
    </div>
  </Card>;
}

function Signal({ title, text }: { title: string; text: string }) { return <div className="min-w-0 rounded-xl bg-canvas p-3"><p className="text-xs font-bold uppercase tracking-wider text-muted-ink">{title}</p><p className="mt-1 break-all text-xs leading-relaxed text-slate-ink">{text}</p></div>; }
