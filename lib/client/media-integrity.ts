"use client";
import { differenceHashFromLuma, inspectImageBytes } from "@/lib/media-integrity";

export async function inspectLocalImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = await inspectImageBytes(file.type, bytes);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("The image signature was recognized, but the file could not be decoded"); }
  try {
    if (bitmap.width !== inspection.width || bitmap.height !== inspection.height) throw new Error("Decoded dimensions do not match the image header");
    const canvas = document.createElement("canvas"); canvas.width = 9; canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Local image inspection is unavailable in this browser");
    context.drawImage(bitmap, 0, 0, 9, 8);
    const pixels = context.getImageData(0, 0, 9, 8).data;
    const luma = Array.from({ length: 72 }, (_, index) => 0.299 * pixels[index * 4] + 0.587 * pixels[index * 4 + 1] + 0.114 * pixels[index * 4 + 2]);
    return { ...inspection, perceptualHash: differenceHashFromLuma(luma) };
  } finally { bitmap.close(); }
}
