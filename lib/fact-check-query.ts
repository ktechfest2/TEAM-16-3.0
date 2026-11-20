const boilerplate = new Set([
  "forwarded", "message", "breaking", "urgent", "please", "share", "verify", "fact", "check", "is", "this", "true",
]);

/** Produces one bounded, content-focused query without changing the claim shown to providers or users. */
export function normalizeFactCheckQuery(input: string): string {
  const cleaned = input
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  const focused = words
    .filter((word, index) => index < 4 || !boilerplate.has(word.toLowerCase()))
    .slice(0, 28)
    .join(" ");
  return (focused || cleaned).slice(0, 280);
}
