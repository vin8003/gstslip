import { useEffect, useLayoutEffect } from "react";
import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import {
  EMPTY_FIELDS,
  canCapture,
  coerceFields,
  coerceInvoice,
  hasMeaningfulInvoiceData,
  type GstInvoice,
  type InvoiceAnalysis,
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
      analysis?: InvoiceAnalysis | null;
    },
  ) => boolean;
  removeInvoice: (id: string) => void;
  unlockPro: () => void;
  setPro: (isPro: boolean) => void;
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

function stripAnalysis(invoice: GstInvoice): GstInvoice {
  if (!invoice.analysis) return invoice;
  return { ...invoice, analysis: undefined };
}

function persistable(state: GstState): Persisted {
  return {
    invoices: state.invoices.map(stripAnalysis),
    capturesUsed: state.capturesUsed,
    isPro: state.isPro,
    defaults: state.defaults,
  };
}

function createDebouncedPersistStorage(): PersistStorage<Persisted> {
  const inner = localStorageOrNoop();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: { name: string; value: unknown } | null = null;

  const flush = () => {
    if (!queued) return;
    const item = queued;
    queued = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      inner.setItem(item.name, JSON.stringify(item.value));
    } catch {
      /* quota / private mode */
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      try {
        const raw = inner.getItem(name);
        return raw ? (JSON.parse(raw) as { state: Persisted; version?: number }) : null;
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: unknown) => {
      queued = { name, value };
      if (timer) return;
      timer = setTimeout(flush, 280);
    },
    removeItem: (name: string) => {
      queued = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inner.removeItem(name);
    },
  };
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
        const index = invoices.findIndex((row) => row.id === id);
        if (index < 0) return false;
        const invoice = invoices[index];
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
        const next = invoices.slice();
        next[index] = {
          ...invoice,
          fields,
          filledFromDefaults: filled,
          lineItems,
          notes: patch.notes !== undefined ? patch.notes || undefined : invoice.notes,
          pageCount: patch.pageCount ?? invoice.pageCount,
          sourceName: patch.sourceName ?? invoice.sourceName,
          pendingQuota: pendingQuota || undefined,
          analysis:
            patch.analysis === null
              ? undefined
              : patch.analysis !== undefined
                ? patch.analysis
                : invoice.analysis,
        };
        set({ capturesUsed: nextUsed, invoices: next });
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
      setPro: (isPro) => set({ isPro: Boolean(isPro) }),
      setDefaults: (defaults) => set({ defaults: coerceFields(defaults) }),
    }),
    {
      name: STORAGE_KEY,
      version: 5,
      skipHydration: true,
      storage: createDebouncedPersistStorage(),
      partialize: persistable,
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
