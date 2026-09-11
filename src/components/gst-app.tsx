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
  isInvoiceAnalyzing,
  lineItemsFromExtract,
  newId,
  parseAmount,
  pruneLineItems,
  remainingCaptures,
  remainingInvoicePages,
  hasMeaningfulInvoiceData,
  type GstInvoice,
  type InvoiceField,
  type InvoiceFields,
  type LineItem,
} from "@/lib/gst";
import { type GspIrnRecord } from "@/lib/gsp";
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

  useEffect(() => {
    hydrateGstStore();
    const store = useGstStore.getState();
    for (const invoice of store.invoices) {
      if (
        invoice.pendingQuota === true &&
        invoice.sourceName === "Manual entry" &&
        !hasMeaningfulInvoiceData(invoice.fields, invoice.lineItems, invoice.filledFromDefaults)
      ) {
        store.removeInvoice(invoice.id);
      }
    }
  }, []);

  const [capture, setCapture] = useState<CaptureUi>({ phase: "idle" });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [irnOpen, setIrnOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<GstInvoice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pendingDeleteRef = useRef<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const saveLock = useRef(false);
  const manualDraftRef = useRef<GstInvoice | null>(null);
  manualDraftRef.current = manualDraft;

  const remaining = remainingCaptures(capturesUsed, isPro);
  const editing =
    invoices.find((invoice) => invoice.id === editingId) ??
    (manualDraft && manualDraft.id === editingId ? manualDraft : null);
  const busy = capture.phase === "working";
  const defaultCount = useMemo(() => countFilledFields(defaults), [defaults]);
  const taxableSum = useMemo(
    () =>
      invoices.reduce((sum, invoice) => sum + (parseAmount(invoice.fields.taxable_value) ?? 0), 0),
    [invoices],
  );
  const pendingDeleteInvoice =
    invoices.find((invoice) => invoice.id === pendingDelete) ??
    (manualDraft && manualDraft.id === pendingDelete ? manualDraft : undefined);
  const pendingDeleteCharged =
    pendingDeleteInvoice != null && pendingDeleteInvoice.pendingQuota !== true;

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

  const insertInvoice = useCallback((invoice: GstInvoice, openEditor: boolean, consume = true) => {
    hydrateGstStore();
    const store = useGstStore.getState();
    if (consume && !canCapture(store.capturesUsed, store.isPro)) {
      setPaywallOpen(true);
      return false;
    }
    if (!store.addInvoice(invoice, consume)) {
      setPaywallOpen(true);
      return false;
    }
    if (openEditor) {
      void import("@/components/invoice-editor");
      setEditingId(invoice.id);
    }
    return true;
  }, []);

  const preparePages = useCallback(
    async (files: File[], maxPages: number, label: string) => {
      const { filesToInvoicePages } = await import("@/lib/document");
      previewUrlsRef.current = [];
      return filesToInvoicePages(
        files,
        (page, index, total) => {
          previewUrlsRef.current[index] = page.previewUrl;
          setCapture({
            phase: "working",
            label:
              total > 1 ? `${label} ${index + 1} of ${total}…` : `${label}…`,
            previews: previewUrlsRef.current.filter(Boolean),
          });
        },
        maxPages,
      );
    },
    [],
  );

  const handleFiles = useCallback(
    async (incoming: File[]) => {
      const files = incoming.filter(isAllowedFile).slice(0, MAX_INVOICE_PAGES);
      if (!files.length) {
        setCapture({
          phase: "error",
          message: "Use a JPEG, PNG, WebP, or PDF of a GST tax invoice. Nothing was captured.",
        });
        return;
      }
      if (files.some((file) => file.size === 0)) {
        setCapture({
          phase: "error",
          message: "That file is empty. Photograph or upload a GST tax invoice.",
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

      setCapture({
        phase: "working",
        label: files.length > 1 ? `Uploading ${files.length} files…` : "Uploading document…",
        previews: [],
      });
      try {
        hydrateGstStore();
        if (!canCapture(useGstStore.getState().capturesUsed, useGstStore.getState().isPro)) {
          setCapture({ phase: "idle" });
          setPaywallOpen(true);
          return;
        }
        const pages = await preparePages(files, MAX_INVOICE_PAGES, "Uploading page");
        const filled = applyFieldDefaults({ ...EMPTY_FIELDS }, useGstStore.getState().defaults);
        const invoice: GstInvoice = {
          id: newId(),
          sourceName: sourceLabel(files, pages.length),
          capturedAt: new Date().toISOString(),
          fields: filled.fields,
          filledFromDefaults: filled.applied.length ? filled.applied : undefined,
          lineItems: [],
          pageCount: pages.length > 1 ? pages.length : undefined,
          analysis: {
            status: "running",
            done: 0,
            total: pages.length,
            failed: 0,
            label: `Queued — ${pages.length} page${pages.length === 1 ? "" : "s"}`,
          },
        };
        previewUrlsRef.current = [];
        if (!insertInvoice(invoice, false)) {
          for (const page of pages) URL.revokeObjectURL(page.previewUrl);
          setCapture({ phase: "idle" });
          return;
        }
        setCapture({ phase: "idle" });
        toast.message("Uploaded. Analysis is running in the background.");
        const { startAnalysis } = await import("@/lib/analyze");
        void startAnalysis({
          invoiceId: invoice.id,
          pages,
          mode: "new",
          pageIndexOffset: 0,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not read this document.";
        setCapture({ phase: "error", message });
      }
    },
    [insertInvoice, preparePages],
  );

  const handleAddPages = useCallback(
    async (invoiceId: string, incoming: File[], live?: { fields: InvoiceFields; lineItems: LineItem[] }) => {
      const store = useGstStore.getState();
      const current =
        store.invoices.find((invoice) => invoice.id === invoiceId) ??
        (manualDraftRef.current?.id === invoiceId ? manualDraftRef.current : undefined);
      if (!current) return;
      if (isInvoiceAnalyzing(current)) {
        toast.message("Wait for the current analysis to finish, then add more pages.");
        return;
      }
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

      setCapture({
        phase: "working",
        label: `Uploading pages to ${base.fields.invoice_number || "this invoice"}…`,
        previews: [],
      });
      try {
        const pages = await preparePages(files, slots, "Uploading page");
        const inStore = useGstStore.getState().invoices.some((invoice) => invoice.id === invoiceId);
        if (!inStore) {
          toast.message("Save this invoice first, then add extra pages.");
          for (const page of pages) URL.revokeObjectURL(page.previewUrl);
          setCapture({ phase: "idle" });
          return;
        }
        const saved = updateInvoice(invoiceId, {
          pageCount: invoicePageCount(base) + pages.length,
          sourceName: `${base.sourceName} + ${sourceLabel(files, pages.length)}`,
          analysis: {
            status: "running",
            done: 0,
            total: pages.length,
            failed: 0,
            label: `Queued — ${pages.length} extra page${pages.length === 1 ? "" : "s"}`,
          },
        });
        if (!saved) {
          for (const page of pages) URL.revokeObjectURL(page.previewUrl);
          setCapture({ phase: "idle" });
          setPaywallOpen(true);
          return;
        }
        previewUrlsRef.current = [];
        setCapture({ phase: "idle" });
        toast.message("Extra pages uploaded. Analysis is running in the background.");
        const { startAnalysis } = await import("@/lib/analyze");
        void startAnalysis({
          invoiceId,
          pages,
          mode: "append",
          pageIndexOffset: invoicePageCount(base),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not read those pages.";
        setCapture({ phase: "error", message });
      }
    },
    [preparePages, updateInvoice],
  );

  const handleRetryAnalysis = useCallback(async (invoiceId: string) => {
    const { retryAnalysis } = await import("@/lib/analyze");
    if (await retryAnalysis(invoiceId)) return;
    toast.message("The uploaded files are no longer in memory. Upload the pages again.");
  }, []);

  const handleSample = useCallback(async () => {
    hydrateGstStore();
    const [{ makeSampleInvoice }] = await Promise.all([
      import("@/lib/samples"),
      import("@/components/invoice-editor"),
    ]);
    const invoice = makeSampleInvoice(useGstStore.getState().invoices.length);
    if (!insertInvoice(invoice, true)) return;
    toast.success("Sample invoice added to the register.");
  }, [insertInvoice]);

  const handleManual = useCallback(() => {
    hydrateGstStore();
    const store = useGstStore.getState();
    if (!canCapture(store.capturesUsed, store.isPro)) {
      setPaywallOpen(true);
      return;
    }
    void import("@/components/invoice-editor");
    const filled = applyFieldDefaults({ ...EMPTY_FIELDS }, store.defaults);
    const invoice: GstInvoice = {
      id: newId(),
      sourceName: "Manual entry",
      capturedAt: new Date().toISOString(),
      fields: filled.fields,
      filledFromDefaults: filled.applied.length ? filled.applied : undefined,
      lineItems: [],
      pendingQuota: true,
    };
    setManualDraft(invoice);
    setEditingId(invoice.id);
    toast.message(
      filled.applied.length
        ? "Fill the GST fields. Defaults are in place."
        : "Fill the GST fields.",
    );
  }, []);

  const closeEditor = useCallback(
    (opts?: { saved?: boolean }) => {
      const id = editingId;
      setEditingId(null);
      if (!id) return;
      if (opts?.saved) {
        setManualDraft((current) => (current?.id === id ? null : current));
        return;
      }
      if (manualDraftRef.current?.id === id) setManualDraft(null);
      hydrateGstStore();
      const stored = useGstStore.getState().invoices.find((row) => row.id === id);
      if (
        stored?.pendingQuota === true &&
        !hasMeaningfulInvoiceData(stored.fields, stored.lineItems, stored.filledFromDefaults)
      ) {
        useGstStore.getState().removeInvoice(id);
      }
    },
    [editingId],
  );

  const handleSave = useCallback(
    (fields: InvoiceFields, filledFromDefaults: InvoiceField[] | undefined, lineItems: LineItem[]) => {
      if (saveLock.current) return;
      saveLock.current = true;
      try {
        const id = editingId;
        if (!id) return;
        const lines = pruneLineItems(lineItems);
        const meaningful = hasMeaningfulInvoiceData(fields, lines, filledFromDefaults);
        const inStore = useGstStore.getState().invoices.some((invoice) => invoice.id === id);
        const draft = manualDraftRef.current?.id === id ? manualDraftRef.current : null;

        if (!meaningful) {
          if (!inStore) {
            toast.message("Add an invoice number, supplier, amount, or line item to save.");
            return;
          }
          const saved = updateInvoice(id, { fields, filledFromDefaults, lineItems: lines });
          if (!saved) {
            setPaywallOpen(true);
            return;
          }
          closeEditor({ saved: true });
          toast.success("Row saved.");
          return;
        }

        if (!inStore && draft) {
          const invoice: GstInvoice = {
            ...draft,
            fields,
            filledFromDefaults,
            lineItems: lines,
          };
          if (!insertInvoice(invoice, false, true)) return;
          closeEditor({ saved: true });
          toast.success("Row saved.");
          return;
        }

        const saved = updateInvoice(id, { fields, filledFromDefaults, lineItems: lines });
        if (!saved) {
          setPaywallOpen(true);
          return;
        }
        closeEditor({ saved: true });
        toast.success("Row saved.");
      } finally {
        saveLock.current = false;
      }
    },
    [editingId, closeEditor, insertInvoice, updateInvoice],
  );

  const requestDelete = useCallback((id: string) => {
    pendingDeleteRef.current = id;
    setPendingDelete(id);
  }, []);

  const confirmDelete = useCallback(() => {
    const id = pendingDeleteRef.current;
    if (!id) return;
    const inStore = useGstStore.getState().invoices.some((invoice) => invoice.id === id);
    if (inStore) {
      void import("@/lib/analyze").then((mod) => mod.abortAnalysis(id));
      removeInvoice(id);
    }
    setManualDraft((current) => (current?.id === id ? null : current));
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
      toast.message("Select at least one purchase invoice, then download Tally XML.");
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
          onRetry={handleRetryAnalysis}
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
              if (!open && !busy) closeEditor();
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
              {isPro
                ? "The row leaves the register."
                : pendingDeleteCharged
                  ? "The row leaves the register. One free capture is returned."
                  : "A free capture is used only when this invoice is saved. Removing it now leaves your quota unchanged."}
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
