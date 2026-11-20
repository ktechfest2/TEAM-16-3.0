import "server-only";

export type ModelObservation = {
  summary: string;
  observations: string[];
  uncertainty: string[];
  image_observations: string[];
};

const outputSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    observations: { type: "ARRAY", items: { type: "STRING" } },
    uncertainty: { type: "ARRAY", items: { type: "STRING" } },
    image_observations: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "observations", "uncertainty", "image_observations"],
};

export async function observeWithGemini(description: string, images: Array<{ mimeType: string; bytes: Uint8Array }>): Promise<ModelObservation> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const parts: Array<Record<string, unknown>> = [{ text: `You are assisting human incident reviewers. Summarize only directly observable claims. Never decide truth, verify allegations, infer perpetrators, or recommend enforcement. Distinguish user claims from image observations; note uncertainty. Report text: ${description}` }];
  for (const image of images) parts.push({ inline_data: { mime_type: image.mimeType, data: Buffer.from(image.bytes).toString("base64") } });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash")}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", responseSchema: outputSchema, temperature: 0.1, maxOutputTokens: 1024 } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
  const payload = await response.json();
  const value = payload?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
  if (typeof value !== "string") throw new Error("Gemini returned no structured observation");
  const parsed = JSON.parse(value);
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.observations) || !Array.isArray(parsed.uncertainty) || !Array.isArray(parsed.image_observations)) throw new Error("Gemini response did not match the observation contract");
  return parsed as ModelObservation;
}
