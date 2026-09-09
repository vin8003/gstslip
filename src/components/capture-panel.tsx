import { Camera, FileUp, ImagePlus, Keyboard, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_INVOICE_PAGES } from "@/lib/gst";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function CapturePanel({
  compact,
  remaining,
  isPro,
  busy,
  onFiles,
  onSample,
  onManual,
  onPaywall,
  onIrn,
}: {
  compact: boolean;
  remaining: number;
  isPro: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onManual: () => void;
  onPaywall: () => void;
  onIrn: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const busyRef = useRef(busy);
  const remainingRef = useRef(remaining);
  const isProRef = useRef(isPro);
  const onFilesRef = useRef(onFiles);
  const onPaywallRef = useRef(onPaywall);
  busyRef.current = busy;
  remainingRef.current = remaining;
  isProRef.current = isPro;
  onFilesRef.current = onFiles;
  onPaywallRef.current = onPaywall;

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const files = [...(event.clipboardData?.files ?? [])].filter(
        (item) => item.type.startsWith("image/") || item.type === "application/pdf",
      );
      if (files.length) gated(() => onFilesRef.current(files));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function gated(action: () => void) {
    if (busyRef.current) return;
    if (!isProRef.current && remainingRef.current <= 0) {
      onPaywallRef.current();
      return;
    }
    action();
  }

  function warmCapture() {
    void import("@/lib/document");
    void import("@/lib/extract");
  }

  function takeFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (files.some((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      void import("@/lib/document").then((m) => m.warmDocumentPipeline());
    }
    if (files.length) gated(() => onFilesRef.current(files));
  }

  return (
    <section
      className={cn(
        "enter-up enter-up-delay-1 rounded-xl bg-card shadow-border",
        compact ? "p-3 sm:p-4" : "p-5 sm:p-8",
        busy && "opacity-80",
      )}
      onPointerDown={warmCapture}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        takeFiles(event.dataTransfer.files);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          takeFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          takeFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {compact ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Capture another invoice</p>
              <p className="text-sm text-muted-foreground">
                Photo, JPEG, PNG, or PDF — up to {MAX_INVOICE_PAGES} pages of one invoice
                {isPro
                  ? " · unlimited"
                  : remaining > 0
                    ? ` · ${remaining} free left`
                    : " · free limit reached"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => gated(() => cameraRef.current?.click())}
              >
                <Camera className="size-4" />
                Photograph
              </Button>
              <Button disabled={busy} onClick={() => gated(() => fileRef.current?.click())}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                Upload pages
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm">
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() => gated(onSample)}
            >
              Insert sample invoice
            </button>
            <span className="text-rule">·</span>
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() => gated(onIrn)}
            >
              e-Invoice QR
            </button>
            <span className="text-rule">·</span>
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() => gated(onManual)}
            >
              Enter manually
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg border border-dashed px-4 py-10 text-center transition-[border-color,background-color] duration-150",
            dragging ? "border-primary bg-accent" : "border-rule bg-muted/40",
          )}
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
            {busy ? (
              <LoaderCircle className="size-6 animate-spin" />
            ) : (
              <ImagePlus className="size-6" />
            )}
          </div>
          <h2 className="mt-4 font-display text-2xl font-medium tracking-tight">
            Drop a GST invoice here
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Photograph a tax invoice, or upload several JPEGs, PNGs, or PDF pages of
            the same invoice (up to {MAX_INVOICE_PAGES} pages). Line items are read from
            the table.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => gated(() => cameraRef.current?.click())}
            >
              <Camera className="size-4" />
              Photograph
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => gated(() => fileRef.current?.click())}
            >
              <FileUp className="size-4" />
              Upload pages
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() => gated(onSample)}
            >
              Insert sample invoice
            </button>
            <span className="text-rule">·</span>
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() => gated(onIrn)}
            >
              e-Invoice QR
            </button>
            <span className="text-rule">·</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() => gated(onManual)}
            >
              <Keyboard className="size-3.5" />
              Enter manually
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
