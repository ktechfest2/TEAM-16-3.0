import "server-only";
import type { VerifySource } from "@/lib/verify-contract";
import { normalizeFactCheckQuery } from "@/lib/fact-check-query";
import { logProviderFailure, providerHttpFailure } from "./provider-diagnostics";

const publishers = [
  { name: "INEC", domain: "inecnigeria.org" },
  { name: "DUBAWA", domain: "dubawa.org" },
  { name: "FactCheckHub", domain: "factcheckhub.com" },
  { name: "Africa Check", domain: "africacheck.org" },
] as const;

export type SearchCoverage = { publisher: string; domain: string; searched: boolean };

export async function searchPublishedEvidence(query: string, key: string): Promise<{ sources: VerifySource[]; coverage: SearchCoverage[] }> {
  const normalized = normalizeFactCheckQuery(query);
  const settled = await Promise.allSettled(publishers.map((publisher) => searchPublisher(normalized, key, publisher)));
  const coverage = settled.map((result, index) => ({ publisher: publishers[index].name, domain: publishers[index].domain, searched: result.status === "fulfilled" }));
  settled.forEach((result, index) => { if (result.status === "rejected") logProviderFailure({ provider: "google_fact_check", operation: `publisher_search_${publishers[index].name}`, error: result.reason }); });
  const global = await searchPublisher(normalized, key, null).catch((error) => {
    logProviderFailure({ provider: "google_fact_check", operation: "approved_global_search", error });
    return [];
  });
  const reviews = [...settled.flatMap((result) => result.status === "fulfilled" ? result.value : []), ...global];
  const unique = new Map<string, Omit<VerifySource, "id">>();
  for (const review of reviews) if (!unique.has(review.url)) unique.set(review.url, review);
  const sources = [...unique.values()].sort((a, b) => relevanceScore(b, normalized) - relevanceScore(a, normalized)).slice(0, 12).map((source, index) => ({ ...source, id: `source-${index + 1}` }));
  return { sources, coverage };
}

async function searchPublisher(query: string, key: string, publisher: (typeof publishers)[number] | null): Promise<Array<Omit<VerifySource, "id">>> {
  const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  url.searchParams.set("query", query);
  url.searchParams.set("languageCode", "en");
  url.searchParams.set("pageSize", "5");
  if (publisher) url.searchParams.set("reviewPublisherSiteFilter", publisher.domain);
  url.searchParams.set("key", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(7_000), headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null) as { error?: unknown; claims?: Array<{ text?: unknown; claimDate?: unknown; claimReview?: Array<{ publisher?: { name?: unknown; site?: unknown }; url?: unknown; title?: unknown; reviewDate?: unknown; textualRating?: unknown }> }> } | null;
  if (!response.ok) throw providerHttpFailure(response.status, body);
  const results: Array<Omit<VerifySource, "id">> = [];
  for (const claim of body?.claims || []) for (const review of claim.claimReview || []) {
    const approvedPublisher = typeof review.url === "string" ? publisherForUrl(review.url) : null;
    if (typeof review.url !== "string" || !approvedPublisher || (publisher && approvedPublisher.domain !== publisher.domain)) continue;
    results.push({
      title: typeof review.title === "string" ? review.title.slice(0, 300) : "Published fact check",
      url: review.url,
      publisher: typeof review.publisher?.name === "string" ? review.publisher.name.slice(0, 120) : approvedPublisher.name,
      publishedAt: typeof review.reviewDate === "string" ? review.reviewDate : typeof claim.claimDate === "string" ? claim.claimDate : null,
      claim: typeof claim.text === "string" ? claim.text.slice(0, 1_000) : "",
      rating: typeof review.textualRating === "string" ? review.textualRating.slice(0, 200) : null,
    });
  }
  return results;
}

function publisherForUrl(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:" ? publishers.find((publisher) => host === publisher.domain || host.endsWith(`.${publisher.domain}`)) || null : null;
  } catch { return null; }
}

function relevanceScore(source: Omit<VerifySource, "id">, query: string) {
  const terms = new Set(query.toLowerCase().split(/\s+/).filter((term) => term.length > 2));
  const haystack = `${source.title} ${source.claim}`.toLowerCase();
  return [...terms].reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
