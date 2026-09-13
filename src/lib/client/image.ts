"use client";

/**
 * Resize a photo in the browser (max 800px, WebP ~80%) and upload it.
 * Keeps menu images small for guests on mobile data.
 */
export async function uploadResizedImage(file: File, maxSize = 800): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const encode = (type: string, quality: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), type, quality),
    );
  let blob = await encode("image/webp", 0.8);
  // Safari can't encode WebP and silently returns PNG — use JPEG there instead.
  if (blob.type !== "image/webp") blob = await encode("image/jpeg", 0.85);
  const res = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": blob.type || "image/webp" }, body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Upload failed");
  return data.id as string;
}
