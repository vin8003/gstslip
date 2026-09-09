import type { ComponentProps } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LINE_AMOUNT_FIELDS,
  LINE_ITEM_FIELDS,
  LINE_ITEM_LABELS,
  emptyLineItem,
  formatAmountInput,
  formatInr,
  pruneLineItems,
  sumLineField,
  type LineItem,
  type LineItemField,
} from "@/lib/gst";
import { cn } from "@/lib/utils";

const COMPACT: LineItemField[] = [
  "quantity",
  "unit",
  "rate",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "line_total",
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
    if (!LINE_AMOUNT_FIELDS.includes(field)) return;
    const next = formatAmountInput(value);
    if (next !== value) setItem(id, field, next);
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
      <div className="hidden max-w-full overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[46rem] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-16" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/60 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-2 py-2">#</th>
              <th className="px-2 py-2">Description</th>
              <th className="w-24 px-2 py-2">HSN</th>
              {COMPACT.map((field) => (
                <th
                  key={field}
                  className={cn(
                    "px-2 py-2",
                    field !== "unit" && "text-right",
                    field === "unit" && "w-16",
                    field === "quantity" && "w-20",
                  )}
                >
                  {LINE_ITEM_LABELS[field]}
                </th>
              ))}
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="border-b border-border last:border-b-0">
                <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{index + 1}</td>
                <td className="px-1 py-1.5">
                  <LineInput
                    aria-label={`Line ${index + 1} description`}
                    value={item.description}
                    onChange={(value) => setItem(item.id, "description", value)}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <LineInput
                    aria-label={`Line ${index + 1} HSN`}
                    value={item.hsn_sac}
                    className="font-mono"
                    onChange={(value) => setItem(item.id, "hsn_sac", value)}
                  />
                </td>
                {COMPACT.map((field) => (
                  <td key={field} className="px-1 py-1.5">
                    <LineInput
                      aria-label={`Line ${index + 1} ${LINE_ITEM_LABELS[field]}`}
                      value={item[field]}
                      inputMode={field === "unit" ? "text" : "decimal"}
                      className={cn(field !== "unit" && "text-right font-mono")}
                      onChange={(value) => setItem(item.id, field, value)}
                      onBlur={() => blurAmount(item.id, field, item[field])}
                    />
                  </td>
                ))}
                <td className="px-1 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 text-destructive"
                    onClick={() => onChange(items.filter((row) => row.id !== item.id))}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
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
          className="h-9 text-destructive"
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
        {LINE_ITEM_FIELDS.filter((field) => field !== "description").map((field) => (
          <div key={field} className={cn("space-y-1.5", field === "hsn_sac" && "col-span-2")}>
            <Label htmlFor={`${item.id}-${field}`}>{LINE_ITEM_LABELS[field]}</Label>
            <Input
              id={`${item.id}-${field}`}
              value={item[field]}
              inputMode={LINE_AMOUNT_FIELDS.includes(field) ? "decimal" : "text"}
              className={cn(LINE_AMOUNT_FIELDS.includes(field) && "font-mono")}
              onChange={(event) => onChange(item.id, field, event.target.value)}
              onBlur={() => onBlur(item.id, field, item[field])}
            />
          </div>
        ))}
      </div>
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
