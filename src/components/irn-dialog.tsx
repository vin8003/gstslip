import { useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getIrnSandbox, type GspIrnRecord } from "@/lib/gsp";
import { decodeSignedQr } from "@/lib/irn-decode";
import { SAMPLE_IRNS, SAMPLE_SIGNED_QR } from "@/lib/gsp-sandbox";

export function IrnDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (record: GspIrnRecord) => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState<"decode" | "get" | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<GspIrnRecord | null>(null);

  async function decode() {
    setBusy("decode");
    setError("");
    try {
      const payload = decodeSignedQr(raw);
      if (!payload) {
        setError("Paste a signed QR JWT, JSON, or a 64-character IRN.");
        setPreview(null);
        return;
      }
      const result = await getIrnSandbox({
        data: payload.irn ? { irn: payload.irn, signedQr: raw } : { signedQr: raw },
      });
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decode that QR.");
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function lookup() {
    setBusy("get");
    setError("");
    try {
      const result = await getIrnSandbox({ data: { irn: raw.trim() } });
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GSP sandbox lookup failed.");
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setBusy("decode");
    setError("");
    try {
      const { decodeQrFromImage } = await import("@/lib/irn");
      const text = await decodeQrFromImage(file);
      setRaw(text);
      const result = await getIrnSandbox({ data: { signedQr: text } });
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read a QR from that image.");
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
          <DialogHeader>
            <DialogTitle>e-Invoice QR / IRN</DialogTitle>
            <DialogDescription>
              Decode a signed QR or look up an IRN in the GSP sandbox. This does not call the live
              NIC IRP unless sandbox credentials are configured.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="irn-raw">Signed QR or IRN</Label>
            <Textarea
              id="irn-raw"
              value={raw}
              rows={4}
              className="font-mono text-sm"
              placeholder="Paste JWT, JSON, or 64-character IRN"
              onChange={(event) => setRaw(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={Boolean(busy) || !raw.trim()} onClick={decode}>
              Decode QR
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy) || !raw.trim()}
              onClick={lookup}
            >
              Get IRN
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => setRaw(SAMPLE_SIGNED_QR.navkaar)}
            >
              Sample QR
            </Button>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-muted">
              <QrCode className="size-4" />
              QR image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  onImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Sandbox sample IRN starts {SAMPLE_IRNS.navkaar.slice(0, 8)}…
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {preview ? (
            <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-3 text-sm">
              <p className="font-medium">
                {preview.fields.invoice_number || "IRN found"} · {preview.source}
              </p>
              <p className="font-mono text-xs break-all text-muted-foreground">{preview.irn}</p>
              {preview.ackNo ? (
                <p className="text-xs text-muted-foreground">
                  Ack {preview.ackNo} · {preview.ackDt}
                </p>
              ) : null}
              {preview.fields.supplier_name ? (
                <p className="text-xs text-muted-foreground">{preview.fields.supplier_name}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!preview}
            onClick={() => {
              if (!preview) return;
              onApply(preview);
              onOpenChange(false);
              setPreview(null);
              setRaw("");
            }}
          >
            Add to register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
