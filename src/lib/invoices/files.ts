export type OriginalFile = {
  name: string;
  mimeType: string;
  base64: string;
};

const MAX_NAME = 80;

export function safeFileName(name: string, fallback = "invoice.jpg"): string {
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() || fallback;
  const cleaned = base.replace(/[^\w.+-]+/g, "_").replace(/_+/g, "_");
  const trimmed = cleaned.replace(/^[._]+|[._]+$/g, "");
  if (!trimmed) return fallback;
  return trimmed.length > MAX_NAME ? trimmed.slice(0, MAX_NAME) : trimmed;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function fileToOriginal(file: File): Promise<OriginalFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = safeFileName(file.name || "invoice.jpg");
  return {
    name,
    mimeType: file.type || mimeFromName(name),
    base64: bytesToBase64(bytes),
  };
}

export function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function downloadOriginals(files: OriginalFile[], zipName: string): void {
  if (!files.length) return;
  if (files.length === 1) {
    triggerBlob(base64ToBytes(files[0].base64), files[0].name, files[0].mimeType);
    return;
  }
  const used = new Set<string>();
  const entries = files.map((file, index) => {
    let name = safeFileName(file.name, `page-${index + 1}.jpg`);
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      name = `${stem}-${index + 1}${ext}`;
    }
    used.add(name.toLowerCase());
    return { name, bytes: base64ToBytes(file.base64) };
  });
  triggerBlob(zipStore(entries), safeFileName(zipName, "gstslip-originals.zip"), "application/zip");
}

export function zipStore(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encodeUtf8(file.name);
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, file.bytes.length, true);
    view.setUint32(24, file.bytes.length, true);
    view.setUint16(28, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, file.bytes);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.bytes.length, true);
    cv.setUint32(24, file.bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...chunks, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function triggerBlob(bytes: Uint8Array, filename: string, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
