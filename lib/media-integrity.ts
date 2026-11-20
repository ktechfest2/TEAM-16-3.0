import { MAX_EVIDENCE_BYTES, validateEvidenceBytes, type EvidenceMime } from "./evidence-contract.ts";
import { InputError } from "./report-contract.ts";

export type ImageInspection = {
  mimeType: EvidenceMime;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  metadata: Record<string, string>;
};

export async function inspectImageBytes(declaredType: string, bytes: Uint8Array): Promise<ImageInspection> {
  const mimeType = validateEvidenceBytes(declaredType, bytes);
  const dimensions = mimeType === "image/png" ? pngDimensions(bytes) : mimeType === "image/jpeg" ? jpegDimensions(bytes) : webpDimensions(bytes);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width * dimensions.height > 40_000_000)
    throw new InputError("Image dimensions are invalid or exceed 40 megapixels");
  const digestInput = new Uint8Array(bytes.byteLength); digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return {
    mimeType,
    ...dimensions,
    byteSize: bytes.byteLength,
    sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    metadata: mimeType === "image/jpeg" ? jpegMetadata(bytes) : {},
  };
}

export function differenceHashFromLuma(values: ArrayLike<number>): string {
  if (values.length !== 72) throw new InputError("Perceptual hash requires a 9 by 8 sample");
  let bits = "";
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += values[y * 9 + x] > values[y * 9 + x + 1] ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function hashDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) throw new InputError("Invalid perceptual hash");
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & BigInt(1)); value = value >> BigInt(1); }
  return count;
}

export { MAX_EVIDENCE_BYTES as MAX_MEDIA_BYTES };

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24 || ascii(bytes, 12, 16) !== "IHDR") return null;
  return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = u16be(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) return null;
  const kind = ascii(bytes, 12, 16);
  if (kind === "VP8X") return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    const packed = bytes[21] | bytes[22] << 8 | bytes[23] << 16 | bytes[24] << 24;
    return { width: (packed & 0x3fff) + 1, height: (packed >>> 14 & 0x3fff) + 1 };
  }
  if (kind === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
    return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  return null;
}

function jpegMetadata(bytes: Uint8Array): Record<string, string> {
  let offset = 2;
  while (offset + 10 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = u16be(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && ascii(bytes, offset + 4, offset + 10) === "Exif\0\0") return readTiff(bytes, offset + 10, length - 8);
    offset += 2 + length;
  }
  return {};
}

function readTiff(bytes: Uint8Array, start: number, length: number): Record<string, string> {
  if (length < 8 || start + length > bytes.length) return {};
  const little = ascii(bytes, start, start + 2) === "II";
  if (!little && ascii(bytes, start, start + 2) !== "MM") return {};
  const u16 = (at: number) => little ? u16le(bytes, at) : u16be(bytes, at);
  const u32 = (at: number) => little ? u32le(bytes, at) : u32be(bytes, at);
  const ifd = start + u32(start + 4);
  if (ifd < start || ifd + 2 > start + length) return {};
  const count = Math.min(u16(ifd), 128);
  const tags: Record<number, string> = { 0x010f: "Camera make", 0x0110: "Camera model", 0x0131: "Software", 0x0132: "Captured/modified time", 0x0112: "Orientation" };
  const result: Record<string, string> = {};
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > start + length) break;
    const tag = u16(entry); const label = tags[tag];
    if (!label) continue;
    const type = u16(entry + 2); const amount = u32(entry + 4);
    if (tag === 0x0112 && type === 3 && amount === 1) result[label] = String(u16(entry + 8));
    else if (type === 2 && amount > 0 && amount <= 256) {
      const dataAt = amount <= 4 ? entry + 8 : start + u32(entry + 8);
      if (dataAt >= start && dataAt + amount <= start + length) result[label] = ascii(bytes, dataAt, dataAt + amount).replace(/\0+$/, "").trim().slice(0, 200);
    }
  }
  return result;
}

function ascii(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.subarray(start, end)); }
function u16be(bytes: Uint8Array, at: number) { return (bytes[at] << 8) | bytes[at + 1]; }
function u16le(bytes: Uint8Array, at: number) { return bytes[at] | bytes[at + 1] << 8; }
function u24le(bytes: Uint8Array, at: number) { return bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16; }
function u32be(bytes: Uint8Array, at: number) { return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0; }
function u32le(bytes: Uint8Array, at: number) { return (bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16 | bytes[at + 3] << 24) >>> 0; }
