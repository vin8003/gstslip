import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { CapturePanel } from "@/components/capture-panel";
import { InvoiceRegister } from "@/components/invoice-register";
import { SlipMark } from "@/components/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EMPTY_FIELDS,
  FREE_CAPTURES,
  MAX_INVOICE_PAGES,
  appendExtractedPages,
  applyFieldDefaults,
  canCapture,
  countFilledFields,
  downloadCsv,
  downloadLineItemsCsv,
  fieldsFromExtract,
  fillMissingHeaderFromLines,
  formatInr,
  invoicePageCount,
  lineItemsFromExtract,
  newId,
  parseAmount,
  pruneLineItems,
  remainingCaptures,
  remainingInvoicePages,
  type GstInvoice,
  type InvoiceField,
  type InvoiceFields,
  type LineItem,
} from "@/lib/gst";
import { type GspIrnRecord } from "@/lib/gsp";
import type { ExtractResult } from "@/lib/extract";
import { hydrateGstStore, useGstStore, useGstStoreRestore } from "@/lib/store";

const InvoiceEditor = lazy(() =>
  import("@/components/invoice-editor").then((m) => ({ default: m.InvoiceEditor })),
);
const IrnDialog = lazy(() =>
  import("@/components/irn-dialog").then((m) => ({ default: m.IrnDialog })),
);
const DefaultsDialog = lazy(() =>
  import("@/components/defaults-dialog").then((m) => ({ default: m.DefaultsDialog })),
);
const Paywall = lazy(() =>
  import("@/components/paywall").then((m) => ({ default: m.Paywall })),
);

type CaptureUi =
  | { phase: "idle" }
  | { phase: "working"; label: string; previews: string[] }
  | { phase: "error"; message: string };

const MAX_FILE_BYTES = 12 * 1024 * 1024;

function isAllowedFile(file: File): boolean {
  return (
    /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type) ||
    /\.(jpe?g|png|webp|pdf)$/i.test(file.name)
  );
}

function sourceLabel(files: File[], pageCount: number): string {
  if (files.length === 1 && pageCount <= 1) return files[0].name || "capture.jpg";
  if (files.length === 1) return `${files[0].name} · ${pageCount} pages`;
  return `${files[0].name} + ${files.length - 1} more · ${pageCount} pages`;
}

export function GstApp() {
  useGstStoreRestore();
  const invoices = useGstStore((s) => s.invoices);
  const capturesUsed = useGstStore((s) => s.capturesUsed);
  const isPro = useGstStore((s) => s.isPro);
  const defaults = useGstStore((s) => s.defaults);
  const updateInvoice = useGstStore((s) => s.updateInvoice);
  const removeInvoice = useGstStore((s) => s.removeInvoice);
  const unlockPro = useGstStore((s) => s.unlockPro);
  const setDefaults = useGstStore((s) => s.setDefaults);

  const [capture, setCapture] = useState<CaptureUi>({ phase: "idle" });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [irnOpen, setIrnOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pendingDeleteRef = useRef<string | null>(null);
  const extractGen = useRef(0);
  const previewUrlsRef = useRef<string[]>([]);

  const remaining = remainingCaptures(capturesUsed, isPro);
  const editing = invoices.find((invoice) => invoice.id === editingId) ?? null;
  const busy = capture.phase === "working";
  const defaultCount = useMemo(() => countFilledFields(defaults), [defaults]);
  const taxableSum = useMemo(
    () =>
      invoices.reduce((sum, invoice) => sum + (parseAmount(invoice.fields.taxable_value) ?? 0), 0),
    [invoices],
  );

  const clearPreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  }, []);

  useEffect(() => {
    if (capture.phase !== "working") clearPreviews();
  }, [capture.phase, clearPreviews]);

  useEffect(() => () => clearPreviews(), [clearPreviews]);

  useEffect(() => {
    if (capture.phase === "working") {
      void import("@/components/invoice-editor");
    }
  }, [capture.phase]);

  const insertInvoice = useCallback((invoice: GstInvoice, openEditor: boolean) => {
    hydrateGstStore();
    const store = useGstStore.getState();
    if (!canCapture(store.capturesUsed, store.isPro) || !store.addInvoice(invoice)) {
      setPaywallOpen(true);
      return false;
    }
    if (openEditor) {
      void import("@/components/invoice-editor");
      setEditingId(invoice.id);
    }
    return true;
  }, []);

  const extractDocuments = useCallback(
    async (files: File[], gen: number, maxPages: number, pageIndexOffset: number) => {
      const documentMod = import("@/lib/document");
      const extractMod = import("@/lib/extract");
      const { filesToInvoicePages } = await documentMod;
      const reads: Promise<ExtractResult>[] = [];
      let finished = 0;
      const pages = await filesToInvoicePages(
        files,
        (page, index, total) => {
          if (gen !== extractGen.current) return;
          previewUrlsRef.current[index] = page.previewUrl;
          const pageCount = pageIndexOffset + total;
          setCapture({
            phase: "working",
            label:
              pageCount > 1
                ? `Reading page ${pageIndexOffset + index + 1} of ${pageCount}…`
                : "Reading GST fields and line items…",
            previews: previewUrlsRef.current.filter(Boolean),
          });
          reads[index] = extractMod
            .then(({ extractInvoice }) =>
              extractInvoice({
                data: {
                  pages: [{ imageBase64: page.base64, mimeType: page.mimeType }],
                  pageIndex: pageIndexOffset + index,
                  pageCount,
                },
              }),
            )
            .catch((error) => ({
              ok: false as const,
              error: error instanceof Error ? error.message : "This page could not be read.",
            }))
            .finally(() => {
              finished += 1;
              if (gen === extractGen.current && pageCount > 1) {
                setCapture((current) =>
                  current.phase === "working"
                    ? { ...current, label: `Read ${finished} of ${pageCount} pages…` }
                    : current,
                );
              }
            });
        },
        maxPages,
      );
      if (gen !== extractGen.current) {
        for (const page of pages) URL.revokeObjectURL(page.previewUrl);
        return null;
      }
      previewUrlsRef.current = pages.map((page) => page.previewUrl);
      const { mergeExtractResults } = await extractMod;
      const parts = await Promise.all(reads);
      if (gen !== extractGen.current) return null;
      return {
        result: pages.length === 1 ? parts[0] : mergeExtractResults(parts),
        pageCount: pages.length,
        sourceName: sourceLabel(files, pages.length),
      };
    },
    [],
  );

  const handleFiles = useCallback(
    async (incoming: File[]) => {
      const files = incoming.filter(isAllowedFile).slice(0, MAX_INVOICE_PAGES);
      if (!files.length) {
        setCapture({
          phase: "error",
          message: "Use JPEG, PNG, WebP, or PDF pages of a tax invoice.",
        });
        return;
      }
      if (files.some((file) => file.size > MAX_FILE_BYTES)) {
        setCapture({
          phase: "error",
          message: "A file is over 12 MB. Photograph a single page instead.",
        });
        return;
      }
      if (incoming.length > MAX_INVOICE_PAGES) {
        toast.message(`Using the first ${MAX_INVOICE_PAGES} pages of this invoice.`);
      }

      const gen = ++extractGen.current;
      clearPreviews();
      setCapture({
        phase: "working",
        label:
          files.length > 1 ? `Preparing ${files.length} files…` : "Preparing document…",
        previews: [],
      });
      try {
        hydrateGstStore();
        if (!canCapture(useGstStore.getState().capturesUsed, useGstStore.getState().isPro)) {
          setCapture({ phase: "idle" });
          setPaywallOpen(true);
          return;
        }
        const extracted = await extractDocuments(files, gen, MAX_INVOICE_PAGES, 0);
        if (!extracted || gen !== extractGen.current) return;
        const { result, pageCount, sourceName } = extracted;
        if (!result.ok) {
          setCapture({ phase: "error", message: result.error });
          return;
        }
        if (!result.isInvoice) {
          setCapture({
            phase: "error",
            message:
              result.notes ||
              "That file does not look like a GST tax invoice. Try a clearer photo of the original.",
          });
          return;
        }
        hydrateGstStore();
        const lineItems = lineItemsFromExtract(result.lineItems);
        const filled = applyFieldDefaults(
          fillMissingHeaderFromLines(fieldsFromExtract(result.fields), lineItems),
          useGstStore.getState().defaults,
        );
        const invoice: GstInvoice = {
          id: newId(),
          sourceName,
          capturedAt: new Date().toISOString(),
          fields: filled.fields,
          notes: result.notes || undefined,
          filledFromDefaults: filled.applied.length ? filled.applied : undefined,
          lineItems,
          pageCount: pageCount > 1 ? pageCount : undefined,
        };
        if (!insertInvoice(invoice, true)) {
          setCapture({ phase: "idle" });
          return;
        }
        setCapture({ phase: "idle" });
        const extra = [
          lineItems.length
            ? `${lineItems.length} line${lineItems.length === 1 ? "" : "s"}`
            : null,
          filled.applied.length
            ? `${filled.applied.length} default${filled.applied.length === 1 ? "" : "s"}`
            : null,
        ].filter(Boolean);
        toast.success(
          extra.length
            ? `Invoice captured — ${extra.join(", ")}.`
            : "Invoice captured — review the extracted fields.",
        );
      } catch (error) {
        if (gen !== extractGen.current) return;
        const message =
          error instanceof Error ? error.message : "Could not read this document.";
        setCapture({ phase: "error", message });
      }
    },
    [clearPreviews, extractDocuments, insertInvoice],
  );

  const handleAddPages = useCallback(
    async (invoiceId: string, incoming: File[], live?: { fields: InvoiceFields; lineItems: LineItem[] }) => {
      const store = useGstStore.getState();
      const current = store.invoices.find((invoice) => invoice.id === invoiceId);
      if (!current) return;
      const base: GstInvoice = live
        ? { ...current, fields: live.fields, lineItems: pruneLineItems(live.lineItems) }
        : current;
      const slots = remainingInvoicePages(base);
      if (slots <= 0) {
        toast.message(`This invoice already has ${MAX_INVOICE_PAGES} pages.`);
        return;
      }
      const files = incoming.filter(isAllowedFile).slice(0, slots);
      if (!files.length) {
        setCapture({
          phase: "error",
          message: "Use JPEG, PNG, WebP, or PDF pages of a tax invoice.",
        });
        return;
      }
      if (files.some((file) => file.size > MAX_FILE_BYTES)) {
        setCapture({
          phase: "error",
          message: "A file is over 12 MB. Photograph a single page instead.",
        });
        return;
      }
      if (incoming.filter(isAllowedFile).length > slots) {
        toast.message(`Adding ${slots} more page${slots === 1 ? "" : "s"} (max ${MAX_INVOICE_PAGES} per invoice).`);
      }

      const gen = ++extractGen.current;
      clearPreviews();
      setCapture({
        phase: "working",
        label: `Adding pages to ${base.fields.invoice_number || "this invoice"}…`,
        previews: [],
      });
      try {
        const extracted = await extractDocuments(files, gen, slots, invoicePageCount(base));
        if (!extracted || gen !== extractGen.current) return;
        const { result, pageCount, sourceName } = extracted;
        if (!result.ok) {
          setCapture({ phase: "error", message: result.error });
          return;
        }
        if (!result.isInvoice) {
          setCapture({
            phase: "error",
            message:
              result.notes ||
              "Those files do not look like GST invoice pages. Try a clearer photo.",
          });
          return;
        }
        const merged = appendExtractedPages(
          base,
          result,
          pageCount,
          sourceName,
          useGstStore.getState().defaults,
        );
        updateInvoice(invoiceId, {
          fields: merged.fields,
          filledFromDefaults: merged.filledFromDefaults,
          lineItems: merged.lineItems,
          notes: merged.notes,
          pageCount: merged.pageCount,
          sourceName: merged.sourceName,
        });
        setEditingId(invoiceId);
        setCapture({ phase: "idle" });
        toast.success(
          `Added ${pageCount} page${pageCount === 1 ? "" : "s"} — ${merged.lineItems.length} line${
            merged.lineItems.length === 1 ? "" : "s"
          }.`,
        );
      } catch (error) {
        if (gen !== extractGen.current) return;
        const message =
          error instanceof Error ? error.message : "Could not read those pages.";
        setCapture({ phase: "error", message });
      }
    },
    [clearPreviews, extractDocuments, updateInvoice],
  );

  const handleSample = useCallback(async () => {
    hydrateGstStore();
    const { makeSampleInvoice } = await import("@/lib/samples");
    const invoice = makeSampleInvoice(useGstStore.getState().invoices.length);
    if (!insertInvoice(invoice, true)) return;
    toast.success("Sample invoice added to the register.");
  }, [insertInvoice]);

  const handleManual = useCallback(() => {
    hydrateGstStore();
    const filled = applyFieldDefaults({ ...EMPTY_FIELDS }, useGstStore.getState().defaults);
    const invoice: GstInvoice = {
      id: newId(),
      sourceName: "Manual entry",
      capturedAt: new Date().toISOString(),
      fields: filled.fields,
      filledFromDefaults: filled.applied.length ? filled.applied : undefined,
      lineItems: [],
    };
    if (!insertInvoice(invoice, true)) return;
    toast.message(
      filled.applied.length
        ? "Blank row added with your field defaults."
        : "Blank row added. Fill the GST fields.",
    );
  }, [insertInvoice]);

  const handleSave = useCallback(
    (fields: InvoiceFields, filledFromDefaults: InvoiceField[] | undefined, lineItems: LineItem[]) => {
      if (editingId) {
        updateInvoice(editingId, {
          fields,
          filledFromDefaults,
          lineItems: pruneLineItems(lineItems),
        });
      }
      setEditingId(null);
      toast.success("Row saved.");
    },
    [editingId, updateInvoice],
  );

  const requestDelete = useCallback((id: string) => {
    pendingDeleteRef.current = id;
    setPendingDelete(id);
  }, []);

  const confirmDelete = useCallback(() => {
    const id = pendingDeleteRef.current;
    if (!id) return;
    removeInvoice(id);
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    if (editingId === id) setEditingId(null);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    toast.message("Invoice removed from the register.");
  }, [editingId, removeInvoice]);

  const handleExport = useCallback(() => {
    downloadCsv(useGstStore.getState().invoices);
    toast.success("Invoice CSV downloaded.");
  }, []);

  const handleExportLines = useCallback(() => {
    const rows = useGstStore.getState().invoices;
    if (!rows.some((invoice) => pruneLineItems(invoice.lineItems).length)) {
      toast.message("No line items in the register yet.");
      return;
    }
    downloadLineItemsCsv(rows);
    toast.success("Line items CSV downloaded.");
  }, []);

  const handleTally = useCallback(async () => {
    const rows = useGstStore.getState().invoices.filter((invoice) => selectedIds.includes(invoice.id));
    if (!rows.length) {
      toast.message("Select purchase invoices first.");
      return;
    }
    const { downloadTallyXml } = await import("@/lib/tally");
    downloadTallyXml(rows);
    toast.success(`Tally XML downloaded for ${rows.length} purchase voucher${rows.length === 1 ? "" : "s"}.`);
  }, [selectedIds]);

  const handleIrnApply = useCallback(
    (record: GspIrnRecord) => {
      hydrateGstStore();
      const store = useGstStore.getState();
      const filled = applyFieldDefaults(
        fieldsFromExtract({
          ...record.fields,
          irn: record.irn,
          ack_no: record.ackNo,
          ack_date: record.ackDt,
          signed_qr: record.signedQr ?? record.fields.signed_qr,
        }),
        store.defaults,
      );
      const invoice: GstInvoice = {
        id: newId(),
        sourceName: record.source === "signed-qr" ? "Signed QR" : "GSP sandbox",
        capturedAt: new Date().toISOString(),
        fields: filled.fields,
        notes: `IRN ${record.status === "CNL" ? "cancelled" : "active"} via ${record.source}.`,
        filledFromDefaults: filled.applied.length ? filled.applied : undefined,
        lineItems: lineItemsFromExtract(record.lineItems),
      };
      if (!insertInvoice(invoice, true)) return;
      toast.success("e-Invoice added from QR / IRN.");
    },
    [insertInvoice],
  );

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleAllSelected() {
    const ids = useGstStore.getState().invoices.map((invoice) => invoice.id);
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <SlipMark />
            <div>
              <p className="font-display text-lg font-medium leading-tight tracking-tight">
                GSTSlip
              </p>
              <p className="text-xs text-muted-foreground">India GST invoice capture</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDefaultsOpen(true)}
              aria-label="Field defaults"
            >
              <SlidersHorizontal className="size-4" />
              <span>
                Defaults{defaultCount ? ` · ${defaultCount}` : ""}
              </span>
            </Button>
            {isPro ? (
              <Badge>Pro</Badge>
            ) : (
              <button type="button" onClick={() => remaining <= 0 && setPaywallOpen(true)}>
                <Badge variant={remaining <= 0 ? "warn" : "muted"}>
                  {`${Math.min(capturesUsed, FREE_CAPTURES)} of ${FREE_CAPTURES} free`}
                </Badge>
              </button>
            )}
            {!isPro ? (
              <Button variant="ghost" size="sm" onClick={() => setPaywallOpen(true)}>
                Upgrade
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 pb-16">
        <div className="enter-up">
          <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Photograph a GST invoice. Get a clean register row.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Extract invoice fields, line items, addresses, and IRN. Missing
            header fields use your defaults. Download CSV or Tally purchase XML.
            IRN lookup uses a GSP sandbox — not the live NIC IRP.
          </p>
        </div>

        {capture.phase === "working" ? (
          <ExtractingCard label={capture.label} previews={capture.previews} />
        ) : null}

        {capture.phase === "error" ? (
          <div className="rounded-xl bg-card px-4 py-3 text-sm shadow-border">
            <p className="font-medium text-destructive">Could not capture</p>
            <p className="mt-1 text-muted-foreground">{capture.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setCapture({ phase: "idle" })}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        <CapturePanel
          compact={invoices.length > 0}
          remaining={remaining}
          isPro={isPro}
          busy={busy}
          onFiles={handleFiles}
          onSample={handleSample}
          onManual={handleManual}
          onPaywall={() => setPaywallOpen(true)}
          onIrn={() => setIrnOpen(true)}
        />

        {invoices.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Taxable in register{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatInr(taxableSum)}
            </span>
          </p>
        ) : null}

        <InvoiceRegister
          invoices={invoices}
          selectedIds={selectedIds}
          busy={busy}
          onToggle={toggleSelected}
          onToggleAll={toggleAllSelected}
          onEdit={setEditingId}
          onDelete={requestDelete}
          onAddPages={handleAddPages}
          onExport={handleExport}
          onExportLines={handleExportLines}
          onTally={handleTally}
        />
      </main>

      <footer className="mt-auto border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>GSTSlip does not connect to Tally or the live NIC IRP. Tally XML is a file you import. IRN lookup uses a GSP sandbox.</p>
          <p>Fields stay on this device until you export CSV.</p>
        </div>
      </footer>

      <Suspense fallback={null}>
        {editing ? (
          <InvoiceEditor
            invoice={editing}
            open={Boolean(editing)}
            busy={busy}
            onOpenChange={(open) => {
              if (!open && !busy) setEditingId(null);
            }}
            onSave={handleSave}
            onDelete={() => editingId && requestDelete(editingId)}
            onAddPages={(files, draft) => {
              if (editingId) void handleAddPages(editingId, files, draft);
            }}
          />
        ) : null}

        {irnOpen ? (
          <IrnDialog open={irnOpen} onOpenChange={setIrnOpen} onApply={handleIrnApply} />
        ) : null}

        {defaultsOpen ? (
          <DefaultsDialog
            open={defaultsOpen}
            onOpenChange={setDefaultsOpen}
            value={defaults}
            onSave={(next) => {
              setDefaults(next);
              toast.success("Field defaults saved on this device.");
            }}
          />
        ) : null}

        {paywallOpen ? (
          <Paywall
            open={paywallOpen}
            onOpenChange={setPaywallOpen}
            onUnlock={() => {
              unlockPro();
              toast.success("GSTSlip Pro unlocked on this device.");
            }}
          />
        ) : null}
      </Suspense>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            pendingDeleteRef.current = null;
            setPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              The row leaves the register. This does not restore a free capture.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExtractingCard({ label, previews }: { label: string; previews: string[] }) {
  return (
    <div className="rounded-xl bg-card px-4 py-4 shadow-border sm:px-5">
      <div className="flex items-center gap-2.5">
        <LoaderCircle className="size-4 shrink-0 animate-spin text-sage" />
        <p className="text-sm font-medium">{label}</p>
      </div>
      {previews.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {previews.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              className="h-20 w-auto rounded-md border border-border object-cover"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
