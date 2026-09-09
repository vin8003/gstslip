import { memo, useMemo, useRef } from "react";
import { FileCode2, FileSpreadsheet, ImagePlus, Pencil, Rows3, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AMOUNT_FIELDS,
  FIELD_LABELS,
  INVOICE_FIELDS,
  MAX_INVOICE_PAGES,
  REGISTER_FIELDS,
  displayDate,
  formatInr,
  pruneLineItems,
  remainingInvoicePages,
  type FieldIssue,
  type GstInvoice,
  type InvoiceField,
  issuesByField,
  validateInvoice,
} from "@/lib/gst";
import { cn } from "@/lib/utils";

type Analyzed = {
  invoice: GstInvoice;
  issues: FieldIssue[];
  lineCount: number;
};

export function InvoiceRegister({
  invoices,
  selectedIds,
  busy,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
  onAddPages,
  onExport,
  onExportLines,
  onTally,
}: {
  invoices: GstInvoice[];
  selectedIds: string[];
  busy?: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddPages: (id: string, files: File[]) => void;
  onExport: () => void;
  onExportLines: () => void;
  onTally: () => void;
}) {
  const analyzed = useMemo<Analyzed[]>(
    () =>
      invoices.map((invoice) => ({
        invoice,
        issues: validateInvoice(invoice.fields, invoice.lineItems),
        lineCount: pruneLineItems(invoice.lineItems).length,
      })),
    [invoices],
  );
  const lineTotal = analyzed.reduce((sum, row) => sum + row.lineCount, 0);
  const selected = new Set(selectedIds);
  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const addInputRef = useRef<HTMLInputElement>(null);
  const addTargetRef = useRef<string | null>(null);

  function requestAddPages(id: string) {
    if (busy) return;
    addTargetRef.current = id;
    addInputRef.current?.click();
  }

  if (invoices.length === 0) {
    return (
      <section className="enter-up enter-up-delay-2 rounded-xl bg-card px-5 py-10 text-center shadow-border">
        <FileSpreadsheet className="mx-auto size-8 text-sage" />
        <h2 className="mt-3 font-display text-xl font-medium tracking-tight">
          Register is empty
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Captured invoices appear here as one row each, with line items,
          addresses, and IRN on the invoice. Export CSV or Tally XML when ready.
        </p>
      </section>
    );
  }

  return (
    <section className="enter-up enter-up-delay-2 space-y-3">
      <input
        ref={addInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          const id = addTargetRef.current;
          event.target.value = "";
          addTargetRef.current = null;
          if (id && files.length) onAddPages(id, files);
        }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-medium tracking-tight">Register</h2>
          <p className="text-sm text-muted-foreground">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            {lineTotal
              ? ` · ${lineTotal} line${lineTotal === 1 ? "" : "s"}`
              : " · one row per document"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onTally} disabled={!selectedIds.length}>
            <FileCode2 className="size-4" />
            Tally XML{selectedIds.length ? ` · ${selectedIds.length}` : ""}
          </Button>
          <Button variant="outline" onClick={onExport}>
            <FileSpreadsheet className="size-4" />
            Invoices CSV
          </Button>
          <Button variant="outline" onClick={onExportLines} disabled={!lineTotal}>
            <Rows3 className="size-4" />
            Line items CSV
          </Button>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {analyzed.map((row) => (
          <InvoiceCard
            key={row.invoice.id}
            row={row}
            selected={selected.has(row.invoice.id)}
            onToggle={() => onToggle(row.invoice.id)}
            onEdit={() => onEdit(row.invoice.id)}
            onAddPages={() => requestAddPages(row.invoice.id)}
            onDelete={() => onDelete(row.invoice.id)}
            busy={busy}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl bg-card shadow-border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[90rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="w-12 px-3 py-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={allSelected}
                    onChange={onToggleAll}
                    aria-label="Select all invoices"
                  />
                </th>
                {REGISTER_FIELDS.map((field) => (
                  <th
                    key={field}
                    className={cn(
                      "whitespace-nowrap px-3 py-3 font-medium",
                      AMOUNT_FIELDS.includes(field) && "text-right",
                      field === "invoice_number" && "sticky left-12 z-10 bg-muted/95",
                    )}
                  >
                    {shortLabel(field)}
                  </th>
                ))}
                <th className="px-3 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {analyzed.map((row) => (
                <InvoiceTableRow
                  key={row.invoice.id}
                  row={row}
                  selected={selected.has(row.invoice.id)}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onAddPages={requestAddPages}
                  onDelete={onDelete}
                  busy={busy}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const InvoiceTableRow = memo(function InvoiceTableRow({
  row,
  selected,
  onToggle,
  onEdit,
  onAddPages,
  onDelete,
  busy,
}: {
  row: Analyzed;
  selected: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onAddPages: (id: string) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}) {
  const { invoice, issues, lineCount } = row;
  const byField = issuesByField(issues);
  return (
    <tr
      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40"
      onClick={() => onEdit(invoice.id)}
    >
      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={selected}
          onChange={() => onToggle(invoice.id)}
          aria-label={`Select ${invoice.fields.invoice_number || "invoice"}`}
        />
      </td>
      {REGISTER_FIELDS.map((field) => (
        <td
          key={field}
          title={byField[field]}
          className={cn(
            "max-w-52 truncate whitespace-nowrap px-3 py-3 align-middle",
            AMOUNT_FIELDS.includes(field) && "text-right font-mono tabular-nums",
            (field === "supplier_gstin" || field === "buyer_gstin") &&
              "font-mono text-xs tracking-wide",
            field === "invoice_number" && "sticky left-12 bg-card font-medium",
            byField[field] && "text-warn",
          )}
        >
          {cellValue(field, invoice)}
        </td>
      ))}
      <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {invoice.fields.irn ? <Badge variant="muted">IRN</Badge> : null}
          {lineCount ? (
            <Badge variant="muted">
              {lineCount} line{lineCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {invoice.filledFromDefaults?.length ? (
            <Badge variant="muted">Defaults</Badge>
          ) : null}
          {issues.length > 0 ? (
            <Badge variant="warn">{issues.length}</Badge>
          ) : (
            <Badge variant="ok">OK</Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => onAddPages(invoice.id)}
            disabled={busy || remainingInvoicePages(invoice) <= 0}
            aria-label={`Add pages (${remainingInvoicePages(invoice)} of ${MAX_INVOICE_PAGES} remaining)`}
          >
            <ImagePlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => onEdit(invoice.id)}
            aria-label="Edit invoice"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-destructive"
            onClick={() => onDelete(invoice.id)}
            aria-label="Delete invoice"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
});

const InvoiceCard = memo(function InvoiceCard({
  row,
  selected,
  onToggle,
  onEdit,
  onAddPages,
  onDelete,
  busy,
}: {
  row: Analyzed;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddPages: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const { invoice, issues, lineCount } = row;
  const byField = issuesByField(issues);
  const previewLines = pruneLineItems(invoice.lineItems).slice(0, 2);

  return (
    <article className="rounded-xl bg-card p-4 shadow-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${invoice.fields.invoice_number || "invoice"}`}
          />
          <div>
            <p className="font-medium">{invoice.fields.invoice_number || "No invoice number"}</p>
            <p className="text-sm text-muted-foreground">
              {displayDate(invoice.fields.invoice_date)}
              {invoice.pageCount && invoice.pageCount > 1 ? ` · ${invoice.pageCount} pages` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {invoice.fields.irn ? <Badge variant="muted">IRN</Badge> : null}
          {lineCount ? (
            <Badge variant="muted">
              {lineCount} line{lineCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {invoice.filledFromDefaults?.length ? <Badge variant="muted">Defaults</Badge> : null}
          {issues.length > 0 ? (
            <Badge variant="warn">{issues.length} to review</Badge>
          ) : (
            <Badge variant="ok">Ready</Badge>
          )}
        </div>
      </div>
      {previewLines.length ? (
        <ul className="mt-3 space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
          {previewLines.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{item.description || item.hsn_sac || "Line"}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {item.line_total ? formatInr(item.line_total) : item.taxable_value ? formatInr(item.taxable_value) : ""}
              </span>
            </li>
          ))}
          {lineCount > previewLines.length ? (
            <li className="text-xs text-muted-foreground">
              +{lineCount - previewLines.length} more
            </li>
          ) : null}
        </ul>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        {INVOICE_FIELDS.filter(
          (field) =>
            field !== "invoice_number" &&
            field !== "invoice_date" &&
            field !== "signed_qr",
        ).map((field) => (
          <div
            key={field}
            className={cn(
              (field === "place_of_supply" ||
                field === "hsn_sac" ||
                field === "supplier_address" ||
                field === "buyer_address" ||
                field === "irn") &&
                "col-span-2",
            )}
          >
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {shortLabel(field)}
            </dt>
            <dd
              className={cn(
                "mt-0.5 break-words",
                AMOUNT_FIELDS.includes(field) && "font-mono tabular-nums",
                (field === "supplier_gstin" || field === "buyer_gstin") &&
                  "font-mono text-xs tracking-wide",
                byField[field] && "text-warn",
              )}
            >
              {cellValue(field, invoice)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onEdit}>
          <Pencil className="size-4" />
          Edit
        </Button>
        <Button
          variant="outline"
          onClick={onAddPages}
          disabled={busy || remainingInvoicePages(invoice) <= 0}
        >
          <ImagePlus className="size-4" />
          Pages
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </article>
  );
});

function shortLabel(field: InvoiceField): string {
  const map: Partial<Record<InvoiceField, string>> = {
    invoice_number: "Invoice #",
    invoice_date: "Date",
    supplier_name: "Supplier",
    supplier_gstin: "Supplier GSTIN",
    buyer_name: "Buyer",
    buyer_gstin: "Buyer GSTIN",
    hsn_sac: "HSN / SAC",
    taxable_value: "Taxable",
    total_invoice_value: "Total",
    place_of_supply: "Place of supply",
  };
  return map[field] ?? FIELD_LABELS[field];
}

function cellValue(field: InvoiceField, invoice: GstInvoice): string {
  const value = invoice.fields[field];
  if (!value) return "—";
  if (field === "invoice_date") return displayDate(value);
  if (AMOUNT_FIELDS.includes(field)) return formatInr(value);
  return value;
}
