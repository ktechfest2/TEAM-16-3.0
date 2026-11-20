import "server-only";

export function verifyConfiguration() {
  return {
    enabled: process.env.SIGNA_VERIFY_ENABLED === "true" && Boolean(process.env.GOOGLE_FACT_CHECK_API_KEY) && Boolean(process.env.GEMINI_API_KEY),
    linksEnabled: process.env.SIGNA_VERIFY_LINKS_ENABLED === "true",
    factCheckKey: process.env.GOOGLE_FACT_CHECK_API_KEY || "",
    geminiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.SIGNA_VERIFY_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}
