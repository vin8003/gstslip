import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { FieldControl } from "@/components/field-control";
import { LineItemsEditor } from "@/components/line-items-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EMPTY_FIELDS,
  FIELD_GROUPS,
  FIELD_LABELS,
  MAX_INVOICE_PAGES,
  applyLineTotalsToFields,
  displayDate,
  isInvoiceAnalyzing,
  issuesByField,
  pruneLineItems,
  remainingDefaultFills,
  remainingInvoicePages,
  type FieldIssue,
  type GstInvoice,
  type InvoiceField,
  type InvoiceFields,
  type LineItem,
  validateInvoice,
} from "@/lib/gst";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function InvoiceEditor({
  invoice,
  open,
  busy,
  onOpenChange,
  onSave,
  onDelete,
  onAddPages,
}: {
  invoice: GstInvoice | null;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    fields: InvoiceFields,
    filledFromDefaults: InvoiceField[] | undefined,
    lineItems: LineItem[],
  ) => void;
  onDelete: () => void;
  onAddPages: (files: File[], draft: { fields: InvoiceFields; lineItems: LineItem[] }) => void;
}) {
  const [draft, setDraft] = useState<InvoiceFields>(EMPTY_FIELDS);
  const [lines, setLines] = useState<LineItem[]>([]);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (invoice && open) {
      setDraft(invoice.fields);
      setLines(invoice.lineItems.length ? invoice.lineItems : []);
    }
  }, [invoice, open]);

  const issues: FieldIssue[] = useMemo(() => validateInvoice(draft, lines), [draft, lines]);
  const byField = issuesByField(issues);
  const stillDefaulted = useMemo(
    () => (invoice ? remainingDefaultFills(invoice, draft) : []),
    [invoice, draft],
  );
  const defaultSet = useMemo(() => new Set(stillDefaulted), [stillDefaulted]);
  const lineCount = pruneLineItems(lines).length;

  function setField(field: InvoiceField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(52rem,92dvh)] max-w-5xl overflow-x-hidden p-0">
        <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
          <DialogHeader>
            <DialogTitle>Edit invoice</DialogTitle>
            <DialogDescription>
              {invoice.sourceName}
              {invoice.pageCount && invoice.pageCount > 1 ? ` · ${invoice.pageCount} pages` : ""}
              {" · "}
              {displayDate(draft.invoice_date) !== "—"
                ? displayDate(draft.invoice_date)
                : "No date"}
              {lineCount ? ` · ${lineCount} line${lineCount === 1 ? "" : "s"}` : ""}
            </DialogDescription>
          </DialogHeader>
          {invoice.notes ? (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {invoice.notes}
            </p>
          ) : null}
          {stillDefaulted.length > 0 ? (
            <p className="mt-3 text-xs text-sage">
              Filled from defaults:{" "}
              {stillDefaulted.map((field) => FIELD_LABELS[field]).join(", ")}
            </p>
          ) : null}
          {busy || isInvoiceAnalyzing(invoice) ? (
            <p className="mt-3 text-xs text-sage">
              {invoice.analysis?.label || "Reading extra pages into this invoice…"}
            </p>
          ) : null}
          {issues.length > 0 ? (
            <p className="mt-3 text-xs text-warn">
              {issues.length} field{issues.length === 1 ? "" : "s"} need a look
              before this row is filing-ready.
            </p>
          ) : (
            <p className="mt-3 text-xs text-ok">All GST fields look consistent.</p>
          )}
        </div>

        <form
          className="min-w-0 space-y-6 px-5 py-4"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft, stillDefaulted, pruneLineItems(lines));
          }}
        >
          {renderGroups(
            FIELD_GROUPS.filter(
              (group) =>
                group.title !== "Tax heads" &&
                group.title !== "Supply" &&
                group.title !== "Transport" &&
                group.title !== "e-Invoice",
            ),
            draft,
            byField,
            defaultSet,
            setField,
          )}

          <LineItemsEditor
            items={lines}
            onChange={setLines}
            onFillHeader={() => setDraft((prev) => applyLineTotalsToFields(prev, lines))}
          />

          {renderGroups(
            FIELD_GROUPS.filter((group) =>
              group.title === "Tax heads" || group.title === "Supply" || group.title === "Transport",
            ),
            draft,
            byField,
            defaultSet,
            setField,
          )}

          {renderGroups(
            FIELD_GROUPS.filter((group) => group.title === "e-Invoice"),
            draft,
            byField,
            defaultSet,
            setField,
          )}

          <DialogFooter className="sticky bottom-0 -mx-5 mt-2 flex-col gap-2 border-t border-border bg-card px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full sm:mr-auto sm:w-auto"
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </Button>
            <input
              ref={addInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length) onAddPages(files, { fields: draft, lineItems: lines });
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              disabled={busy || isInvoiceAnalyzing(invoice) || remainingInvoicePages(invoice) <= 0}
              onClick={() => addInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              Add pages
              {remainingInvoicePages(invoice) < MAX_INVOICE_PAGES
                ? ` · ${remainingInvoicePages(invoice)} left`
                : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="w-full sm:w-auto" disabled={busy}>
              Save row
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function renderGroups(
  groups: typeof FIELD_GROUPS,
  draft: InvoiceFields,
  byField: Partial<Record<InvoiceField, string>>,
  defaultSet: Set<InvoiceField>,
  setField: (field: InvoiceField, value: string) => void,
) {
  return groups.map((group) => (
    <fieldset key={group.title} className="space-y-3">
      <legend className="text-xs font-medium uppercase tracking-[0.14em] text-sage">
        {group.title}
      </legend>
      <div
        className={cn(
          "grid gap-3",
          group.fields.length > 2 ? "sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
        )}
      >
        {group.fields.map((field) => (
          <FieldControl
            key={field}
            idPrefix="edit"
            field={field}
            value={draft[field]}
            error={byField[field]}
            fromDefault={defaultSet.has(field)}
            onChange={(value) => setField(field, value)}
            wide={field === "place_of_supply" || field === "hsn_sac"}
          />
        ))}
      </div>
    </fieldset>
  ));
}
