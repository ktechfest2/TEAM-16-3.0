import { InputError } from "./report-contract.ts";

export const verifyOutcomes = [
  "supported",
  "contradicted",
  "misleading",
  "conflicting",
  "insufficient_evidence",
] as const;

export type VerifyOutcome = (typeof verifyOutcomes)[number];

export type VerifySource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  claim: string;
  rating: string | null;
};

export type VerifyAnalysis = {
  outcome: VerifyOutcome;
  explanation: string;
  citedSourceIds: string[];
  uncertainty: string;
};

const supportedVerifyDomains = ["inecnigeria.org", "dubawa.org", "factcheckhub.com", "africacheck.org"];

export function validateSupportedVerifyUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new InputError("Enter a valid HTTPS article link or paste the claim text"); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.port || !supportedVerifyDomains.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)))
    throw new InputError("For safety, link extraction currently supports INEC, DUBAWA, FactCheckHub and Africa Check. Paste text from other links.");
  return url;
}

export function parseVerifyRequest(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Enter a claim or supported article link");
  const value = input as Record<string, unknown>;
  if (value.externalProcessingConsent !== true) throw new InputError("Consent is required before external verification services are used");
  const claim = typeof value.claim === "string" ? value.claim.trim() : "";
  const articleUrl = typeof value.articleUrl === "string" ? value.articleUrl.trim() : "";
  if (!claim && !articleUrl) throw new InputError("Enter a claim or supported article link");
  if (claim.length > 5_000) throw new InputError("Claims cannot exceed 5,000 characters");
  if (articleUrl.length > 2_048) throw new InputError("Article links cannot exceed 2,048 characters");
  return { claim, articleUrl };
}

export function validateVerifyAnalysis(input: unknown, sources: VerifySource[]): VerifyAnalysis {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid verification analysis");
  const value = input as Record<string, unknown>;
  if (typeof value.outcome !== "string" || !verifyOutcomes.includes(value.outcome as VerifyOutcome)) throw new Error("Invalid verification outcome");
  if (typeof value.explanation !== "string" || value.explanation.trim().length < 20 || value.explanation.length > 2_000) throw new Error("Invalid verification explanation");
  if (typeof value.uncertainty !== "string" || value.uncertainty.length > 1_000) throw new Error("Invalid verification uncertainty");
  if (!Array.isArray(value.citedSourceIds) || value.citedSourceIds.some((id) => typeof id !== "string")) throw new Error("Invalid verification citations");
  const available = new Set(sources.map((source) => source.id));
  const citedSourceIds = [...new Set(value.citedSourceIds as string[])];
  if (citedSourceIds.some((id) => !available.has(id))) throw new Error("Verification analysis cited an unavailable source");
  if (value.outcome !== "insufficient_evidence" && citedSourceIds.length === 0) throw new Error("Verification analysis omitted its evidence citations");
  if (value.outcome === "conflicting" && citedSourceIds.length < 2) throw new Error("Conflicting evidence requires at least two cited sources");
  if (/https?:\/\//i.test(value.explanation)) throw new Error("Verification analysis invented an inline URL");
  return {
    outcome: value.outcome as VerifyOutcome,
    explanation: value.explanation.trim(),
    citedSourceIds,
    uncertainty: value.uncertainty.trim(),
  };
}
