import { inflateRawSync } from "node:zlib";

export class ZipError extends Error {}

/**
 * Reads the files in a ZIP archive (stored or deflated entries, no encryption or
 * ZIP64), from its central directory. `want` picks which entries to extract, and
 * each one is capped at `maxBytes` uncompressed so a zip bomb can't exhaust memory.
 */
export function readZip(buf: Buffer, want: (name: string) => boolean, maxBytes: number): Map<string, Buffer> {
  // The end-of-central-directory record sits in the last 22 bytes plus an optional comment (≤ 64 KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("Not a ZIP file");

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new ZipError("Damaged ZIP file");
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const compressedSize = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString(flags & 0x800 ? "utf8" : "latin1", at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || !want(name)) continue;
    if (flags & 0x1) throw new ZipError("The ZIP file is password-protected");
    if (localAt + 30 > buf.length || buf.readUInt32LE(localAt) !== 0x04034b50) throw new ZipError("Damaged ZIP file");
    const dataAt = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const data = buf.subarray(dataAt, dataAt + compressedSize);
    if (data.length !== compressedSize) throw new ZipError("Damaged ZIP file");

    if (method === 0) {
      if (data.length > maxBytes) throw new ZipError(`${name} is too large`);
      out.set(name, data);
    } else if (method === 8) {
      try {
        out.set(name, inflateRawSync(data, { maxOutputLength: maxBytes }));
      } catch (err) {
        if ((err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw new ZipError(`${name} is too large`);
        throw new ZipError("Damaged ZIP file");
      }
    } else {
      throw new ZipError("Unsupported ZIP compression");
    }
  }
  return out;
}
