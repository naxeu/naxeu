import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { sniffImageMime } from "@naxeu/core";

const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Builds a small JPEG preview for raster images. Returns null if the buffer is not
 * a supported image or sharp cannot decode it.
 */
export async function buildAttachmentThumbnailJpeg(buffer: Buffer, maxEdge: number): Promise<Buffer | null> {
  if (buffer.byteLength > MAX_SOURCE_BYTES) return null;
  const mime = sniffImageMime(buffer);
  if (!mime?.startsWith("image/")) return null;
  const edge = Math.min(Math.max(64, Math.floor(maxEdge)), 1024);
  try {
    return await sharp(buffer)
      .rotate()
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function readFileLimited(absolutePath: string): Promise<Buffer | null> {
  const s = await stat(absolutePath);
  if (s.size > MAX_SOURCE_BYTES) return null;
  return readFile(absolutePath);
}
