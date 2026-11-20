import "server-only";

export function mediaIntegrityConfiguration() {
  return {
    externalEnabled: process.env.SIGNA_MEDIA_GEMINI_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY),
    key: process.env.GEMINI_API_KEY || "",
    model: process.env.SIGNA_MEDIA_GEMINI_MODEL || "gemini-2.5-flash",
  };
}
