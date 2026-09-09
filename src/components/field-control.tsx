import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AMOUNT_FIELDS,
  FIELD_HINTS,
  FIELD_LABELS,
  GSTIN_FIELDS,
  PINCODE_FIELDS,
  PLACE_OPTIONS,
  TEXTAREA_FIELDS,
  formatAmountInput,
  normalizeGstin,
  type InvoiceField,
} from "@/lib/gst";
import { cn } from "@/lib/utils";

export function FieldControl({
  field,
  value,
  error,
  onChange,
  wide,
  idPrefix,
  fromDefault,
}: {
  field: InvoiceField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  wide?: boolean;
  idPrefix: string;
  fromDefault?: boolean;
}) {
  const isAmount = AMOUNT_FIELDS.includes(field);
  const isGstin = GSTIN_FIELDS.includes(field);
  const isDate = field === "invoice_date";
  const isPin = PINCODE_FIELDS.includes(field);
  const isArea = TEXTAREA_FIELDS.includes(field);
  const id = `${idPrefix}-${field}`;
  const listId = `${idPrefix}-place-options`;
  const span =
    wide || isArea || field === "irn" || field === "place_of_supply" || field === "hsn_sac";

  return (
    <div className={cn("space-y-1.5", span && "sm:col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{FIELD_LABELS[field]}</Label>
        {fromDefault ? (
          <span className="text-xs font-medium uppercase tracking-wider text-sage">
            Default
          </span>
        ) : null}
      </div>
      {isDate ? (
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
        />
      ) : field === "place_of_supply" ? (
        <>
          <Input
            id={id}
            list={listId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={FIELD_HINTS[field]}
            aria-invalid={Boolean(error)}
          />
          <datalist id={listId}>
            {PLACE_OPTIONS.map((place) => (
              <option key={place} value={place} />
            ))}
          </datalist>
        </>
      ) : isArea ? (
        <Textarea
          id={id}
          value={value}
          rows={field === "signed_qr" ? 3 : 2}
          className={cn(field === "signed_qr" && "font-mono text-sm")}
          placeholder={FIELD_HINTS[field]}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          inputMode={isAmount || isPin ? "numeric" : "text"}
          autoCapitalize={isGstin || field === "irn" ? "characters" : undefined}
          spellCheck={!isGstin && !isAmount && field !== "irn"}
          maxLength={isGstin ? 15 : isPin ? 6 : field === "irn" ? 64 : undefined}
          className={cn((isAmount || isGstin || field === "irn" || isPin) && "font-mono tabular-nums")}
          placeholder={FIELD_HINTS[field]}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            let next = event.target.value;
            if (isGstin) next = normalizeGstin(next);
            if (field === "irn") next = next.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
            if (isPin) next = next.replace(/\D/g, "").slice(0, 6);
            onChange(next);
          }}
          onBlur={() => {
            if (isAmount) onChange(formatAmountInput(value));
          }}
        />
      )}
      <p className={cn("text-xs", error ? "text-warn" : "text-muted-foreground")}>
        {error ?? FIELD_HINTS[field]}
      </p>
    </div>
  );
}
