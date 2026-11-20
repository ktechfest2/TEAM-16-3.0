"use client";

import { useState } from "react";
import { ExternalLink, SearchCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/signa/page-header";
import type { VerifyAnalysis, VerifyOutcome, VerifySource } from "@/lib/verify-contract";
import { MediaIntegrityPanel } from "@/components/signa/media-integrity-panel";

type Result = {
  analysisStatus: "completed" | "provider_unavailable";
  analysis: VerifyAnalysis;
  sources: VerifySource[];
  coverage: { publisher: string; domain: string; searched: boolean }[];
  inputSource: { url: string; title: string; publishedAt: string | null } | null;
  linkWarning: string | null;
  notice: string;
};

const labels: Record<VerifyOutcome, string> = {
  supported: "Supported by available evidence",
  contradicted: "Contradicted by available evidence",
  misleading: "Misleading or missing context",
  conflicting: "Conflicting evidence",
  insufficient_evidence: "Insufficient evidence",
};

export function VerifyExperience({ enabled, linksEnabled, mediaExternalEnabled }: { enabled: boolean; linksEnabled: boolean; mediaExternalEnabled: boolean }) {
  const [claim, setClaim] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!enabled || loading) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claim, articleUrl, externalProcessingConsent: consent }), cache: "no-store" });
      const body = await response.json().catch(() => null) as Result & { error?: { message?: string } } | null;
      if (!response.ok || !body?.analysis) throw new Error(body?.error?.message || "Verification could not be completed");
      setResult(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Verification could not be completed"); }
    finally { setLoading(false); }
  }

  const cited = new Set(result?.analysis.citedSourceIds || []);
  return <>
    <PageHeader eyebrow={<><SearchCheck className="size-4" aria-hidden /> Public fact-checking</>} title="Verify an election claim" description="Compare a pasted claim with published fact-check evidence. Signa shows its sources and uncertainty; it does not certify election results." />
    <Card className="mt-7 p-5 sm:p-6">
      {!enabled && <p role="status" className="mb-5 rounded-xl bg-warn-soft p-3 text-sm text-slate-ink">Signa Verify is currently unavailable while provider access and abuse controls are being configured.</p>}
      <form onSubmit={submit} className="space-y-5">
        <div><label htmlFor="verify-claim" className="text-sm font-semibold text-navy">Claim or message</label><textarea id="verify-claim" value={claim} onChange={(event) => setClaim(event.target.value)} maxLength={5000} rows={6} placeholder="Paste the exact election-related claim here" className="mt-2 w-full rounded-xl border border-[var(--hairline-strong)] bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-signal/30" /><p className="mt-1 text-xs text-muted-ink">Include the original wording. Remove phone numbers, private names and other personal information.</p></div>
        <div><label htmlFor="verify-url" className="text-sm font-semibold text-navy">Article link <span className="font-normal text-muted-ink">(optional)</span></label><input id="verify-url" type="url" inputMode="url" value={articleUrl} onChange={(event) => setArticleUrl(event.target.value)} maxLength={2048} placeholder="https://…" className="mt-2 h-11 w-full rounded-xl border border-[var(--hairline-strong)] bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-signal/30" /><p className="mt-1 text-xs text-muted-ink">{linksEnabled ? "Safe extraction is limited to INEC, DUBAWA, FactCheckHub and Africa Check links." : "Link extraction is not enabled; paste the relevant claim text."}</p></div>
        <p className="rounded-xl bg-canvas p-3 text-xs leading-relaxed text-slate-ink">Screenshot extraction is not enabled in this release. Paste the visible claim text so you can review exactly what is sent.</p>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-ink"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 accent-signal" /><span>I agree that the text I submit may be sent to Google Fact Check Tools and Gemini for this verification request. I have removed private information.</span></label>
        <Button type="submit" size="lg" loading={loading} disabled={!enabled || !consent || (!claim.trim() && !articleUrl.trim())}><SearchCheck className="size-4" aria-hidden />Check available evidence</Button>
        {error && <p role="alert" className="rounded-xl bg-alert/5 p-3 text-sm text-alert">{error}</p>}
      </form>
    </Card>
    <MediaIntegrityPanel externalEnabled={mediaExternalEnabled} onUseText={(text) => { setClaim(text); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
    {result && <section className="mt-6 space-y-5" aria-live="polite">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-signal/10 px-3 py-1 text-sm font-semibold text-signal">{labels[result.analysis.outcome]}</span>{result.analysisStatus !== "completed" && <span className="rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-slate-ink">Analysis unavailable</span>}</div>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-ink">{result.analysis.explanation}</p>
        <div className="mt-4 rounded-xl bg-canvas p-3"><p className="text-xs font-bold uppercase tracking-wider text-muted-ink">Uncertainty</p><p className="mt-1 text-sm text-slate-ink">{result.analysis.uncertainty}</p></div>
        {result.linkWarning && <p className="mt-3 text-sm text-warn">{result.linkWarning}</p>}
      </Card>
      <Card className="p-5 sm:p-6"><h2 className="text-xl font-semibold">Published sources</h2><p className="mt-1 text-sm text-muted-ink">Only sources returned by the configured searches are listed. A link is not an endorsement.</p>
        <div className="mt-4 space-y-3">{result.sources.length ? result.sources.map((source) => <article key={source.id} className="rounded-xl border border-[var(--hairline)] p-4"><div className="flex flex-wrap gap-2 text-xs text-muted-ink"><span>{source.publisher}</span><span>·</span><time>{source.publishedAt ? new Date(source.publishedAt).toLocaleDateString() : "Date unavailable"}</time>{cited.has(source.id) && <span className="rounded-full bg-trust-soft px-2 text-trust">Cited in explanation</span>}</div><a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-start gap-1.5 font-semibold text-signal underline underline-offset-2">{source.title}<ExternalLink className="mt-0.5 size-4 shrink-0" aria-hidden /></a>{source.rating && <p className="mt-2 text-sm text-slate-ink">Published rating: {source.rating}</p>}<p className="mt-2 text-sm leading-relaxed text-slate-ink/80">{source.claim}</p></article>) : <p className="rounded-xl bg-canvas p-4 text-sm text-slate-ink">No matching published evidence was returned. This is not evidence that the claim is true.</p>}</div>
        <div className="mt-4 flex flex-wrap gap-2">{result.coverage.map((item) => <span key={item.domain} className={`rounded-full px-2.5 py-1 text-xs ${item.searched ? "bg-trust-soft text-trust" : "bg-alert/5 text-alert"}`}>{item.publisher}: {item.searched ? "searched" : "unavailable"}</span>)}</div>
      </Card>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-ink"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{result.notice}</p>
    </section>}
  </>;
}
