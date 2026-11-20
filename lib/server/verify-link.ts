import "server-only";
import { InputError } from "@/lib/report-contract";
import { validateSupportedVerifyUrl } from "@/lib/verify-contract";
const MAX_HTML_BYTES = 512 * 1024;

export async function extractVerificationLink(raw: string) {
  let current = validateSupportedVerifyUrl(raw);
  for (let redirect = 0; redirect <= 2; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { accept: "text/html, text/plain;q=0.8", "user-agent": "SignaVerify/1.0" },
      signal: AbortSignal.timeout(6_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 2) throw new InputError("The article redirected outside the supported extraction limit. Paste its claim text instead.");
      current = validateSupportedVerifyUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new InputError("The article could not be accessed safely. Paste its claim text instead.");
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new InputError("The link is not a supported text article. Paste its claim text instead.");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) throw new InputError("The article is too large to extract safely. Paste the relevant claim text instead.");
    const bytes = await readBounded(response, MAX_HTML_BYTES);
    const html = new TextDecoder().decode(bytes);
    const title = decodeEntities(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || "Linked article").replace(/\s+/g, " ").trim().slice(0, 240);
    const publishedAt = firstMatch(html, /<meta[^>]+(?:property|name)=["'](?:article:published_time|date|datePublished)["'][^>]+content=["']([^"']+)["']/i) || null;
    const text = decodeEntities(html
      .replace(/<(script|style|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()).slice(0, 5_000);
    if (text.length < 40) throw new InputError("The article did not expose enough readable text. Paste the claim text instead.");
    return { url: current.toString(), title, publishedAt, text };
  }
  throw new InputError("The article could not be extracted safely. Paste its claim text instead.");
}

async function readBounded(response: Response, maximum: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) { await reader.cancel(); throw new InputError("The article is too large to extract safely. Paste the relevant claim text instead."); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function firstMatch(value: string, expression: RegExp) { return expression.exec(value)?.[1]?.trim() || ""; }
function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}
