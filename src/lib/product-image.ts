"use client";

import { supabaseBrowser } from "./supabase/client";

const BUCKET = "product-images";
const MAX_SIDE = 800;

export function productImageUrl(path: string | null | undefined) {
  if (!path) return null;
  return supabaseBrowser().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Mengecilkan foto (sisi terpanjang 800px) dan mengubahnya ke WebP.
 * Foto kamera HP beberapa MB jadi sekitar 50-100 KB: hemat kuota dan cepat tampil di kasir.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("File yang dipilih bukan gambar.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Gambar tidak bisa dibaca. Coba foto lain (JPG, PNG, atau WebP).");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak bisa mengolah gambar.");
  ctx.fillStyle = "#fff"; // latar putih untuk PNG transparan
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/webp", 0.82);
  // Browser tanpa encoder WebP (Safari lama) diam-diam memberi PNG besar: pakai JPEG.
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", 0.85);
  if (!blob) throw new Error("Gagal mengecilkan gambar.");
  return blob;
}

/**
 * Unggah ke nama file acak yang baru (bukan menimpa): foto lama di cache browser tidak tertukar,
 * dan foto bisa diunggah sebelum barangnya disimpan.
 */
export async function uploadProductImage(blob: Blob) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${id}.${blob.type === "image/jpeg" ? "jpg" : "webp"}`;
  const { error } = await supabaseBrowser()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/webp", cacheControl: "31536000", upsert: false });
  if (error) {
    throw new Error(
      /bucket not found/i.test(error.message)
        ? "Penyimpanan foto belum disiapkan. Jalankan supabase/update-003-foto-barang.sql di SQL Editor."
        : `Gagal mengunggah foto: ${error.message}`,
    );
  }
  return path;
}

/** Menghapus file foto. Gagal hapus tidak menggagalkan proses lain (hanya sisa file). */
export async function removeProductImage(path: string | null | undefined) {
  if (!path) return;
  await supabaseBrowser().storage.from(BUCKET).remove([path]);
}
