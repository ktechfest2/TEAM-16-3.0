import { InputError } from "./report-contract.ts";

export type EvidenceItem = {
  id: string;
  reportId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  sha256: string;
  receivedAt: string;
};

export type EvidenceUploadResponse = {
  evidence: EvidenceItem;
  duplicate: boolean;
  integrityNote: "SHA-256 identifies received bytes; it does not prove authenticity.";
};
export type EvidenceListResponse = { evidence: EvidenceItem[] };
export type EvidenceAccessResponse = { signedUrl: string; expiresAt: string };

// Vercel Functions cap the complete request body at 4.5 MiB. Reserve room for
// multipart headers and boundaries so a maximum-size image remains deployable.
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
export type EvidenceMime = EvidenceItem["mimeType"];
const allowedTypes = new Set<EvidenceMime>(["image/jpeg", "image/png", "image/webp"]);

export function validateEvidenceBytes(declaredType: string, bytes: Uint8Array): EvidenceMime {
  if (!Number.isSafeInteger(bytes.byteLength) || bytes.byteLength < 1 || bytes.byteLength > MAX_EVIDENCE_BYTES)
    throw new InputError("Evidence file must be between 1 byte and 4 MB");

  const detected = detectEvidenceMime(bytes);
  if (!allowedTypes.has(declaredType as EvidenceMime) || detected !== declaredType)
    throw new InputError("Evidence must be a valid JPEG, PNG, or WebP image");
  return detected;
}

function detectEvidenceMime(bytes: Uint8Array): EvidenceMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
    return "image/webp";
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
