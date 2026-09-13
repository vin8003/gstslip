import type { ComponentProps } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LINE_AMOUNT_FIELDS,
  LINE_MONEY_FIELDS,
  LINE_QTY_FIELDS,
  LINE_ITEM_LABELS,
  emptyLineItem,
  formatAmountInput,
  formatInr,
  formatQtyInput,
  pruneLineItems,
  sumLineField,
  type LineItem,
  type LineItemField,
} from "@/lib/gst";
import { cn } from "@/lib/utils";

const CORE: LineItemField[] = [
  "quantity",
  "unit",
  "rate",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "line_total",
];

const EXTRA: LineItemField[] = [
  "mrp",
  "cases",
  "pieces",
  "free_qty",
  "gst_rate",
  "scheme_percent",
  "discount_percent",
  "gross_amount",
];

export function LineItemsEditor({
  items,
  onChange,
  onFillHeader,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  onFillHeader: () => void;
}) {
  const filled = pruneLineItems(items);
  const taxable = sumLineField(filled, "taxable_value");
  const tax = sumLineField(filled, "cgst") + sumLineField(filled, "sgst") + sumLineField(filled, "igst");

  function setItem(id: string, field: LineItemField, value: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function blurAmount(id: string, field: LineItemField, value: string) {
    if (LINE_MONEY_FIELDS.includes(field)) {
      const next = formatAmountInput(value);
      if (next !== value) setItem(id, field, next);
      return;
    }
    if (LINE_QTY_FIELDS.includes(field)) {
      const next = formatQtyInput(value);
      if (next !== value) setItem(id, field, next);
    }
  }

  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <legend className="text-xs font-medium uppercase tracking-[0.14em] text-sage">
          Line items
        </legend>
        {filled.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {filled.length} line{filled.length === 1 ? "" : "s"} · taxable{" "}
            <span className="font-mono tabular-nums text-foreground">{formatInr(taxable)}</span>
            {tax ? (
              <>
                {" "}
                · tax <span className="font-mono tabular-nums text-foreground">{formatInr(tax)}</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Optional. Add rows from the tax invoice.</p>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-3 md:hidden">
          {items.map((item, index) => (
            <LineCard
              key={item.id}
              item={item}
              index={index}
              onChange={setItem}
              onBlur={blurAmount}
              onRemove={() => onChange(items.filter((row) => row.id !== item.id))}
            />
          ))}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-2">#</th>
                <th className="min-w-[10rem] px-2 py-2">Description</th>
                <th className="w-24 px-2 py-2">HSN</th>
                {CORE.map((field) => (
                  <th
                    key={field}
                    className={cn(
                      "whitespace-nowrap px-2 py-2",
                      field === "unit" ? "w-16" : "w-[4.5rem] text-right",
                      field === "quantity" && "w-16",
                    )}
                  >
                    {LINE_ITEM_LABELS[field]}
                  </th>
                ))}
                <th className="sticky right-0 z-10 w-11 bg-muted/95 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <LineTableBlock
                  key={item.id}
                  item={item}
                  index={index}
                  onChange={setItem}
                  onBlur={blurAmount}
                  onRemove={() => onChange(items.filter((row) => row.id !== item.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, emptyLineItem()])}
        >
          <Plus className="size-4" />
          Add line
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!filled.length}
          onClick={onFillHeader}
        >
          Fill totals from lines
        </Button>
      </div>
    </fieldset>
  );
}

function LineTableBlock({
  item,
  index,
  onChange,
  onBlur,
  onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (id: string, field: LineItemField, value: string) => void;
  onBlur: (id: string, field: LineItemField, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-2 py-1.5 align-middle font-mono text-xs text-muted-foreground">{index + 1}</td>
        <td className="px-1 py-1.5 align-middle">
          <LineInput
            aria-label={`Line ${index + 1} description`}
            value={item.description}
            onChange={(value) => onChange(item.id, "description", value)}
          />
        </td>
        <td className="px-1 py-1.5 align-middle">
          <LineInput
            aria-label={`Line ${index + 1} HSN`}
            value={item.hsn_sac}
            className="font-mono"
            onChange={(value) => onChange(item.id, "hsn_sac", value)}
          />
        </td>
        {CORE.map((field) => (
          <td key={field} className="px-1 py-1.5 align-middle">
            <LineInput
              aria-label={`Line ${index + 1} ${LINE_ITEM_LABELS[field]}`}
              value={item[field]}
              inputMode={field === "unit" ? "text" : "decimal"}
              className={cn(field !== "unit" && "text-right font-mono")}
              onChange={(value) => onChange(item.id, field, value)}
              onBlur={() => onBlur(item.id, field, item[field])}
            />
          </td>
        ))}
        <td className="sticky right-0 z-10 bg-card px-1 py-1.5 align-middle shadow-[-6px_0_8px_-6px_rgba(15,28,26,0.12)]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-destructive"
            onClick={onRemove}
            aria-label={`Remove line ${index + 1}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </td>
      </tr>
      <tr className="border-b border-border bg-muted/20 last:border-b-0">
        <td className="px-2 py-2" />
        <td colSpan={CORE.length + 2} className="px-2 py-2">
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
            {EXTRA.map((field) => (
              <div key={field} className="min-w-0 space-y-1">
                <Label
                  htmlFor={`${item.id}-${field}`}
                  className="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
                >
                  {LINE_ITEM_LABELS[field]}
                </Label>
                <LineInput
                  id={`${item.id}-${field}`}
                  aria-label={`Line ${index + 1} ${LINE_ITEM_LABELS[field]}`}
                  value={item[field]}
                  inputMode="decimal"
                  className="text-right font-mono"
                  onChange={(value) => onChange(item.id, field, value)}
                  onBlur={() => onBlur(item.id, field, item[field])}
                />
              </div>
            ))}
          </div>
        </td>
        <td className="sticky right-0 bg-muted/20" />
      </tr>
    </>
  );
}

function LineCard({
  item,
  index,
  onChange,
  onBlur,
  onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (id: string, field: LineItemField, value: string) => void;
  onBlur: (id: string, field: LineItemField, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Line {index + 1}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${item.id}-description`}>{LINE_ITEM_LABELS.description}</Label>
        <Input
          id={`${item.id}-description`}
          value={item.description}
          onChange={(event) => onChange(item.id, "description", event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field
          item={item}
          field="hsn_sac"
          className="col-span-2"
          onChange={onChange}
          onBlur={onBlur}
        />
        {CORE.map((field) => (
          <Field key={field} item={item} field={field} onChange={onChange} onBlur={onBlur} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
        {EXTRA.map((field) => (
          <Field key={field} item={item} field={field} onChange={onChange} onBlur={onBlur} />
        ))}
      </div>
    </div>
  );
}

function Field({
  item,
  field,
  className,
  onChange,
  onBlur,
}: {
  item: LineItem;
  field: LineItemField;
  className?: string;
  onChange: (id: string, field: LineItemField, value: string) => void;
  onBlur: (id: string, field: LineItemField, value: string) => void;
}) {
  const numeric = LINE_AMOUNT_FIELDS.includes(field);
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={`${item.id}-${field}`}>{LINE_ITEM_LABELS[field]}</Label>
      <Input
        id={`${item.id}-${field}`}
        value={item[field]}
        inputMode={numeric ? "decimal" : "text"}
        className={cn(numeric && "font-mono")}
        onChange={(event) => onChange(item.id, field, event.target.value)}
        onBlur={() => onBlur(item.id, field, item[field])}
      />
    </div>
  );
}

function LineInput({
  className,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange"> & {
  onChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      className={cn("h-9 min-w-0 px-2 text-sm", className)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
