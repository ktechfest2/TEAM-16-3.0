import { NextResponse } from "next/server";
import { AccessError } from "@/lib/server/auth";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";
import { mediaIntegrityConfiguration } from "@/lib/server/media-integrity-config";
import { observePublicImage } from "@/lib/server/media-observation";
import { inspectImageBytes, MAX_MEDIA_BYTES } from "@/lib/media-integrity";
import { DependencyUnavailableError, errorResponse, noStore } from "@/lib/server/responses";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const config = mediaIntegrityConfiguration();
    if (!config.externalEnabled) return NextResponse.json({ error: { code: "NOT_FOUND", message: "External image observations are unavailable" } }, { status: 404, headers: noStore });
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(req.url).origin) throw new AccessError(403, "Invalid media integrity request origin");
    await enforceAbuseLimit(req, null, { scope: "media_integrity", reporterMax: 1, ipMax: 4, windowSeconds: 600 });
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return NextResponse.json({ error: { code: "CONTENT_TYPE", message: "Use multipart/form-data" } }, { status: 415, headers: noStore });
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES + 64 * 1024) return NextResponse.json({ error: { code: "TOO_LARGE", message: "Images cannot exceed 4 MB" } }, { status: 413, headers: noStore });
    const form = await req.formData().catch(() => null);
    if (form?.get("externalProcessingConsent") !== "true") return NextResponse.json({ error: { code: "CONSENT", message: "Explicit external image-processing consent is required" } }, { status: 400, headers: noStore });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: { code: "INPUT", message: "Attach one JPEG, PNG or WebP image" } }, { status: 400, headers: noStore });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspection = await inspectImageBytes(file.type, bytes);
    let observation;
    try { observation = await observePublicImage({ bytes, mimeType: inspection.mimeType, key: config.key, model: config.model }); }
    catch { throw new DependencyUnavailableError("External image observations are unavailable"); }
    return NextResponse.json({ observation, notice: "Visual observations and extracted text are provisional. They do not authenticate the image or detect synthetic media." }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
