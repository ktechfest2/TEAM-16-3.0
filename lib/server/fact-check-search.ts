import "server-only";
import type { VerifySource } from "@/lib/verify-contract";

const publishers = [
  { name: "INEC", domain: "inecnigeria.org" },
  { name: "DUBAWA", domain: "dubawa.org" },
  { name: "FactCheckHub", domain: "factcheckhub.com" },
  { name: "Africa Check", domain: "africacheck.org" },
] as const;

export type SearchCoverage = { publisher: string; domain: string; searched: boolean };

export async function searchPublishedEvidence(query: string, key: string): Promise<{ sources: VerifySource[]; coverage: SearchCoverage[] }> {
  const settled = await Promise.allSettled(publishers.map((publisher) => searchPublisher(query.slice(0, 350), key, publisher)));
  const coverage = settled.map((result, index) => ({ publisher: publishers[index].name, domain: publishers[index].domain, searched: result.status === "fulfilled" }));
  const reviews = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = new Map<string, Omit<VerifySource, "id">>();
  for (const review of reviews) if (!unique.has(review.url)) unique.set(review.url, review);
  const sources = [...unique.values()].slice(0, 12).map((source, index) => ({ ...source, id: `source-${index + 1}` }));
  return { sources, coverage };
}

async function searchPublisher(query: string, key: string, publisher: (typeof publishers)[number]): Promise<Array<Omit<VerifySource, "id">>> {
  const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  url.searchParams.set("query", query);
  url.searchParams.set("languageCode", "en");
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("reviewPublisherSiteFilter", publisher.domain);
  url.searchParams.set("key", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(7_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Fact-check search unavailable");
  const body = await response.json() as { claims?: Array<{ text?: unknown; claimDate?: unknown; claimReview?: Array<{ publisher?: { name?: unknown; site?: unknown }; url?: unknown; title?: unknown; reviewDate?: unknown; textualRating?: unknown }> }> };
  const results: Array<Omit<VerifySource, "id">> = [];
  for (const claim of body.claims || []) for (const review of claim.claimReview || []) {
    if (typeof review.url !== "string" || !isApprovedSource(review.url, publisher.domain)) continue;
    results.push({
      title: typeof review.title === "string" ? review.title.slice(0, 300) : "Published fact check",
      url: review.url,
      publisher: typeof review.publisher?.name === "string" ? review.publisher.name.slice(0, 120) : publisher.name,
      publishedAt: typeof review.reviewDate === "string" ? review.reviewDate : typeof claim.claimDate === "string" ? claim.claimDate : null,
      claim: typeof claim.text === "string" ? claim.text.slice(0, 1_000) : "",
      rating: typeof review.textualRating === "string" ? review.textualRating.slice(0, 200) : null,
    });
  }
  return results;
}

function isApprovedSource(raw: string, expectedDomain: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:" && (host === expectedDomain || host.endsWith(`.${expectedDomain}`));
  } catch { return false; }
}
