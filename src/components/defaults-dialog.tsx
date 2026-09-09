import { useEffect, useState } from "react";
import { FieldControl } from "@/components/field-control";
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
  DEFAULT_FIELD_GROUPS,
  type InvoiceFields,
} from "@/lib/gst";
import { cn } from "@/lib/utils";

export function DefaultsDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: InvoiceFields;
  onSave: (next: InvoiceFields) => void;
}) {
  const [draft, setDraft] = useState<InvoiceFields>(EMPTY_FIELDS);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
          <DialogHeader>
            <DialogTitle>Field defaults</DialogTitle>
            <DialogDescription>
              Used only when a capture cannot read that field from the invoice.
              Leave a field blank to skip it. Manual rows start with these values.
            </DialogDescription>
          </DialogHeader>
        </div>
        <form
          className="space-y-6 px-5 py-4"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
            onOpenChange(false);
          }}
        >
          {DEFAULT_FIELD_GROUPS.map((group) => (
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
                    idPrefix="defaults"
                    field={field}
                    value={draft[field]}
                    onChange={(next) => setDraft((prev) => ({ ...prev, [field]: next }))}
                    wide={field === "place_of_supply" || field === "hsn_sac"}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <DialogFooter className="sticky bottom-0 border-t border-border bg-card pt-4">
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => setDraft({ ...EMPTY_FIELDS })}
            >
              Clear all
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save defaults</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
