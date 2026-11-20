import { NextResponse } from "next/server";
import { parseVerifyRequest, type VerifyAnalysis } from "@/lib/verify-contract";
import { verifyConfiguration } from "@/lib/server/verify-config";
import { extractVerificationLink } from "@/lib/server/verify-link";
import { searchPublishedEvidence } from "@/lib/server/fact-check-search";
import { analyseClaimWithEvidence } from "@/lib/server/verify-analysis";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";
import { AccessError } from "@/lib/server/auth";
import { DependencyUnavailableError, errorResponse, noStore } from "@/lib/server/responses";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const config = verifyConfiguration();
    if (!config.enabled) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Signa Verify is unavailable" } }, { status: 404, headers: noStore });
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(req.url).origin) throw new AccessError(403, "Invalid verification request origin");
    await enforceAbuseLimit(req, null, { scope: "verify", reporterMax: 1, ipMax: 6, windowSeconds: 600 });
    const parsed = parseVerifyRequest(await req.json().catch(() => null));
    let extracted: Awaited<ReturnType<typeof extractVerificationLink>> | null = null;
    let linkWarning: string | null = null;
    if (parsed.articleUrl) {
      if (!config.linksEnabled) linkWarning = "Safe link extraction is not enabled. Pasted claim text was used instead.";
      else {
        try { extracted = await extractVerificationLink(parsed.articleUrl); }
        catch (error) {
          if (!parsed.claim) throw error;
          linkWarning = error instanceof Error ? error.message : "The article could not be extracted safely. Pasted claim text was used instead.";
        }
      }
    }
    const claim = parsed.claim || extracted?.text || "";
    if (!claim) return NextResponse.json({ error: { code: "INPUT", message: "Paste the claim text because this article could not be extracted safely" } }, { status: 400, headers: noStore });
    const evidence = await searchPublishedEvidence(claim, config.factCheckKey);
    if (!evidence.coverage.some((item) => item.searched)) throw new DependencyUnavailableError("Published evidence search is unavailable");
    let analysis: VerifyAnalysis;
    let analysisStatus: "completed" | "provider_unavailable" = "completed";
    try { analysis = await analyseClaimWithEvidence({ claim, sources: evidence.sources, key: config.geminiKey, model: config.geminiModel }); }
    catch {
      analysisStatus = "provider_unavailable";
      analysis = {
        outcome: "insufficient_evidence",
        explanation: "Published sources were retrieved, but the evidence comparison service was unavailable. Review the source links directly; no verdict has been inferred.",
        citedSourceIds: [],
        uncertainty: "Automated analysis did not complete.",
      };
    }
    return NextResponse.json({
      analysisStatus,
      analysis,
      sources: evidence.sources,
      coverage: evidence.coverage,
      inputSource: extracted ? { url: extracted.url, title: extracted.title, publishedAt: extracted.publishedAt } : null,
      linkWarning,
      notice: "Signa Verify summarizes available published evidence. It does not certify truth, official results or personal allegations.",
    }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
