export {
  decodeBase64Url,
  decodeSignedQr,
  encodeSandboxQr,
  fieldsFromSignedQr,
  mergeQrFields,
  type SignedQrPayload,
} from "./irn-decode";

export async function decodeQrFromImage(file: File): Promise<string> {
  const [jsqrMod, bitmap] = await Promise.all([
    import("jsqr"),
    createImageBitmap(file),
  ]);
  const jsQR = jsqrMod.default;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not read the QR image.");
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(image.data, image.width, image.height);
    if (!result?.data) throw new Error("No QR code found in that image.");
    return result.data;
  } finally {
    bitmap.close();
  }
}
