import { useEffect, useLayoutEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  EMPTY_FIELDS,
  canCapture,
  coerceFields,
  coerceInvoice,
  hasMeaningfulInvoiceData,
  type GstInvoice,
  type InvoiceField,
  type InvoiceFields,
  type LineItem,
} from "./gst";

const STORAGE_KEY = "gstslip-v1";

type GstState = {
  invoices: GstInvoice[];
  capturesUsed: number;
  isPro: boolean;
  defaults: InvoiceFields;
  addInvoice: (invoice: GstInvoice, consume?: boolean) => boolean;
  updateInvoice: (
    id: string,
    patch: {
      fields?: InvoiceFields;
      filledFromDefaults?: InvoiceField[];
      lineItems?: LineItem[];
      notes?: string;
      pageCount?: number;
      sourceName?: string;
    },
  ) => boolean;
  removeInvoice: (id: string) => void;
  unlockPro: () => void;
  setDefaults: (defaults: InvoiceFields) => void;
};

type Persisted = Pick<GstState, "invoices" | "capturesUsed" | "isPro" | "defaults">;

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function localStorageOrNoop() {
  if (typeof window === "undefined") return noopStorage;
  try {
    const probe = "__gstslip";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return noopStorage;
  }
}

function coerceInvoices(value: unknown): GstInvoice[] {
  if (!Array.isArray(value)) return [];
  const next: GstInvoice[] = [];
  for (const item of value) {
    const invoice = coerceInvoice(item);
    if (invoice) next.push(invoice);
  }
  return next;
}

function normalizePersisted(persisted: unknown): Persisted {
  const state = (persisted ?? {}) as Partial<Persisted>;
  return {
    invoices: coerceInvoices(state.invoices),
    capturesUsed: typeof state.capturesUsed === "number" ? state.capturesUsed : 0,
    isPro: Boolean(state.isPro),
    defaults: coerceFields(state.defaults),
  };
}

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown };
    return normalizePersisted(parsed.state);
  } catch {
    return null;
  }
}

export const useGstStore = create<GstState>()(
  persist(
    (set, get) => ({
      invoices: [],
      capturesUsed: 0,
      isPro: false,
      defaults: { ...EMPTY_FIELDS },
      addInvoice: (invoice, consume = true) => {
        const { capturesUsed, isPro, invoices } = get();
        if (consume && !canCapture(capturesUsed, isPro)) return false;
        const row: GstInvoice = consume
          ? { ...invoice, pendingQuota: undefined }
          : { ...invoice, pendingQuota: true };
        set({
          invoices: [row, ...invoices],
          capturesUsed: consume ? capturesUsed + 1 : capturesUsed,
        });
        return true;
      },
      updateInvoice: (id, patch) => {
        const { invoices, capturesUsed, isPro } = get();
        const invoice = invoices.find((row) => row.id === id);
        if (!invoice) return false;
        const fields = patch.fields ?? invoice.fields;
        const lineItems = patch.lineItems ?? invoice.lineItems;
        const filled =
          patch.filledFromDefaults !== undefined
            ? patch.filledFromDefaults.length
              ? patch.filledFromDefaults
              : undefined
            : invoice.filledFromDefaults;
        let pendingQuota = invoice.pendingQuota === true;
        let nextUsed = capturesUsed;
        if (pendingQuota && hasMeaningfulInvoiceData(fields, lineItems, filled)) {
          if (!canCapture(capturesUsed, isPro)) return false;
          nextUsed = capturesUsed + 1;
          pendingQuota = false;
        }
        set({
          capturesUsed: nextUsed,
          invoices: invoices.map((row) => {
            if (row.id !== id) return row;
            return {
              ...row,
              fields,
              filledFromDefaults: filled,
              lineItems,
              notes: patch.notes !== undefined ? patch.notes || undefined : row.notes,
              pageCount: patch.pageCount ?? row.pageCount,
              sourceName: patch.sourceName ?? row.sourceName,
              pendingQuota: pendingQuota || undefined,
            };
          }),
        });
        return true;
      },
      removeInvoice: (id) => {
        const { invoices, capturesUsed } = get();
        const invoice = invoices.find((row) => row.id === id);
        if (!invoice) return;
        const restore = invoice.pendingQuota !== true && capturesUsed > 0;
        set({
          invoices: invoices.filter((row) => row.id !== id),
          capturesUsed: restore ? capturesUsed - 1 : capturesUsed,
        });
      },
      unlockPro: () => set({ isPro: true }),
      setDefaults: (defaults) => set({ defaults: coerceFields(defaults) }),
    }),
    {
      name: STORAGE_KEY,
      version: 5,
      skipHydration: true,
      storage: createJSONStorage(() => localStorageOrNoop()),
      partialize: (state) => ({
        invoices: state.invoices,
        capturesUsed: state.capturesUsed,
        isPro: state.isPro,
        defaults: state.defaults,
      }),
      migrate: (persisted) => normalizePersisted(persisted),
      merge: (persisted, current) => ({
        ...current,
        ...normalizePersisted(persisted),
      }),
    },
  ),
);

let restored = false;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Sync restore from localStorage. Never blocks first paint; safe to call often. */
export function hydrateGstStore(): void {
  if (restored) return;
  restored = true;
  const persisted = readPersisted();
  if (persisted) useGstStore.setState(persisted);
}

export function useGstStoreRestore(): void {
  useIsoLayoutEffect(() => {
    hydrateGstStore();
  }, []);
}
