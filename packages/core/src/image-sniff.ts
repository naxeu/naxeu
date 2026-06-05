/**
 * Detects common raster image formats from magic bytes. Used so receipt
 * uploads that arrive as `application/octet-stream` (common from mobile
 * cameras) still go through the vision extraction path.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 3) return null;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // BMP (BM) — must run before the `length < 8` guard used for PNG
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
  if (buffer.length < 8) return null;
  // PNG
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.subarray(0, 8).equals(pngSig)) return "image/png";
  // GIF
  if (buffer.length >= 6) {
    const g = buffer.toString("ascii", 0, 6);
    if (g === "GIF87a" || g === "GIF89a") return "image/gif";
  }
  // WebP (RIFF....WEBP)
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  // TIFF (classic magic)
  if (buffer.length >= 4) {
    const le = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const be = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    if (le || be) return "image/tiff";
  }
  // HEIC / HEIF / AVIF (ISO BMFF: box size, then "ftyp", then brand)
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    const heicBrands = new Set(["heic", "heix", "heim", "heis", "mif1", "msf1"]);
    if (heicBrands.has(brand)) return "image/heic";
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}
