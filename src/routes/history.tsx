import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, History, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AccountBar } from "@/components/account-bar";
import { SlipMark } from "@/components/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayDate, formatInr, parseAmount } from "@/lib/gst";
import { isAnalysisLive } from "@/lib/analyze";
import { invoiceBucket, type StoredInvoiceSummary } from "@/lib/invoices/payload";
import { pullStoredInvoices, removeStoredInvoice, downloadOriginalFiles } from "@/lib/invoices/client";
import { hydrateGstStore, useGstStore } from "@/lib/store";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  head: () => ({
    meta: [{ title: "History · GSTSlip" }],
  }),
});

function statusLabel(row: StoredInvoiceSummary, live: boolean): { text: string; variant: "muted" | "warn" | "default" } {
  if (live) return { text: "Running", variant: "warn" };
  if (row.analysisStatus === "running") return { text: "Interrupted", variant: "warn" };
  if (row.analysisStatus === "error") return { text: "Needs review", variant: "warn" };
  if (row.pendingQuota) return { text: "Draft", variant: "muted" };
  return { text: "Saved", variant: "muted" };
}

function HistoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StoredInvoiceSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pullStoredInvoices().then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) => {
      const hay = `${row.invoiceNumber} ${row.supplierName} ${row.sourceName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  const background = filtered.filter((row) => invoiceBucket(row.analysisStatus, isAnalysisLive(row.id)) === "background");
  const historical = filtered.filter((row) => invoiceBucket(row.analysisStatus, isAnalysisLive(row.id)) === "historical");

  function openInRegister(row: StoredInvoiceSummary) {
    hydrateGstStore();
    useGstStore.getState().mergeInvoice(row.invoice);
    toast.success("Opened in the register.");
    void navigate({ to: "/" });
  }

  async function downloadRow(row: StoredInvoiceSummary) {
    if (!row.fileCount) {
      toast.message("No original file is stored for this invoice.");
      return;
    }
    setDownloadingId(row.id);
    try {
      const ok = await downloadOriginalFiles(row.id);
      if (!ok) toast.message("No original file is stored for this invoice.");
      else toast.success("Original file downloaded.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function removeRow(row: StoredInvoiceSummary) {
    setBusyId(row.id);
    try {
      removeStoredInvoice(row.id);
      hydrateGstStore();
      useGstStore.getState().removeInvoice(row.id);
      setRows((current) => (current ?? []).filter((item) => item.id !== row.id));
      toast.message("Removed from history.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5">
          <SlipMark />
          <div>
            <p className="font-display text-lg font-medium leading-tight">GSTSlip</p>
            <p className="text-xs text-muted-foreground">History</p>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">Register</Link>
          </Button>
          <AccountBar />
        </div>
      </header>

      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Invoice history</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
          Uploaded invoices are stored for reuse. Background covers analysis that is still running
          or stopped. Historical is the saved register.
        </p>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search invoice number, supplier, or file"
        aria-label="Search history"
      />

      {rows === null ? (
        <div className="grid place-items-center rounded-xl bg-card px-4 py-16 shadow-border">
          <LoaderCircle className="size-6 animate-spin text-sage" aria-label="Loading history" />
        </div>
      ) : rows.length === 0 ? (
        <section className="rounded-xl bg-card px-5 py-10 shadow-border">
          <History className="size-6 text-sage" />
          <p className="mt-3 font-display text-xl font-medium tracking-tight">No stored invoices yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Capture or save an invoice and it appears here, signed in on this account or signed out
            on this network address.
          </p>
          <Button className="mt-4" asChild>
            <Link to="/">Capture an invoice</Link>
          </Button>
        </section>
      ) : (
        <div className="space-y-8">
          <HistorySection
            title="Background"
            empty="No analysis running or interrupted."
            rows={background}
            busyId={busyId}
            downloadingId={downloadingId}
            onOpen={openInRegister}
            onDownload={(row) => void downloadRow(row)}
            onRemove={(row) => void removeRow(row)}
          />
          <HistorySection
            title="Historical"
            empty="No saved invoices yet."
            rows={historical}
            busyId={busyId}
            downloadingId={downloadingId}
            onOpen={openInRegister}
            onDownload={(row) => void downloadRow(row)}
            onRemove={(row) => void removeRow(row)}
          />
        </div>
      )}
    </main>
  );
}

function HistorySection({
  title,
  empty,
  rows,
  busyId,
  downloadingId,
  onOpen,
  onDownload,
  onRemove,
}: {
  title: string;
  empty: string;
  rows: StoredInvoiceSummary[];
  busyId: string | null;
  downloadingId: string | null;
  onOpen: (row: StoredInvoiceSummary) => void;
  onDownload: (row: StoredInvoiceSummary) => void;
  onRemove: (row: StoredInvoiceSummary) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-medium tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{rows.length}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-5 text-sm text-muted-foreground shadow-border">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const live = isAnalysisLive(row.id);
            const badge = statusLabel(row, live);
            const amount = parseAmount(row.taxableValue);
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl bg-card px-4 py-3 shadow-border sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">
                      {row.invoiceNumber || row.sourceName || "Invoice"}
                    </p>
                    <Badge variant={badge.variant}>{badge.text}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {row.supplierName || "No supplier"} · {displayDate(row.invoice.fields.invoice_date) || displayDate(row.capturedAt.slice(0, 10))}
                    {amount != null ? ` · ${formatInr(amount)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => onOpen(row)}>
                    <RotateCcw className="size-4" />
                    Open
                  </Button>
                  {row.fileCount ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloadingId === row.id}
                      onClick={() => onDownload(row)}
                    >
                      {downloadingId === row.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Original
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === row.id}
                    onClick={() => onRemove(row)}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
