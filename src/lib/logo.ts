export const LOGO_BUCKET = "logos";
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Gibt die Logo-Adresse nur zurück, wenn sie aus dem eigenen Logo-Speicher stammt.
 * So kann niemand über das Feld logo_url fremde Adressen (z. B. Tracking-Bilder) einschleusen.
 */
export function safeLogoUrl(url: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !base) return null;
  const prefix = `${base.replace(/\/+$/, "")}/storage/v1/object/public/${LOGO_BUCKET}/`;
  return url.startsWith(prefix) ? url : null;
}

/** Verkleinert ein Bild auf höchstens max Pixel und gibt es als PNG zurück (entfernt Metadaten). */
export async function resizeLogo(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Das Bild konnte nicht verarbeitet werden.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Das Bild konnte nicht verarbeitet werden."))),
      "image/png"
    )
  );
}
