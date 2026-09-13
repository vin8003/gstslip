import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bytesToBase64, base64ToBytes, safeFileName, zipStore } from "./files.ts";

describe("original files", () => {
  it("sanitizes download names", () => {
    assert.equal(safeFileName("../../secret.pdf"), "secret.pdf");
    assert.equal(safeFileName("GST INV 1.PDF"), "GST_INV_1.PDF");
  });

  it("round-trips base64", () => {
    const bytes = new Uint8Array([1, 2, 250, 255]);
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  });

  it("writes a zip that starts with PK", () => {
    const zip = zipStore([{ name: "a.jpg", bytes: new Uint8Array([1, 2, 3]) }]);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.ok(zip.length > 30);
  });
});
