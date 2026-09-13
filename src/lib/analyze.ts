import { toast } from "sonner";
import type { InvoicePageImage } from "./document";
import type { ExtractOk, ExtractResult } from "./extract";
import { extractHasSignal, shouldRetryExtract } from "./extract-parse";
import {
  appendExtractedPages,
  applyFieldDefaults,
  fieldsFromExtract,
  fillMissingHeaderFromLines,
  lineItemsFromExtract,
  type GstInvoice,
  type InvoiceAnalysis,
} from "./gst";
import { hydrateGstStore, useGstStore } from "./store";

type CachedPage = {
  imageBase64: string;
  mimeType: string;
  previewUrl: string;
  result?: ExtractResult;
};

type Job = {
  invoiceId: string;
  gen: number;
  mode: "new" | "append";
  pageIndexOffset: number;
  pages: CachedPage[];
  base: GstInvoice;
  aborted: boolean;
  mergeExtractResults?: (parts: ExtractResult[]) => ExtractResult;
};

const jobs = new Map<string, Job>();
let jobGen = 0;
let active = 0;
const MAX_PARALLEL = 2;
const waiters: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

function currentInvoice(id: string): GstInvoice | undefined {
  hydrateGstStore();
  return useGstStore.getState().invoices.find((invoice) => invoice.id === id);
}

type Patch = {
  id: string;
  analysis: InvoiceAnalysis | null;
  extra?: {
    fields?: GstInvoice["fields"];
    lineItems?: GstInvoice["lineItems"];
    notes?: string;
    filledFromDefaults?: GstInvoice["filledFromDefaults"];
    pageCount?: number;
    sourceName?: string;
  };
};

let queuedPatch: Patch | null = null;
let patchTimer: ReturnType<typeof setTimeout> | null = null;

function flushPatch(): void {
  if (patchTimer) {
    clearTimeout(patchTimer);
    patchTimer = null;
  }
  const next = queuedPatch;
  queuedPatch = null;
  if (!next) return;
  hydrateGstStore();
  useGstStore.getState().updateInvoice(next.id, {
    ...next.extra,
    analysis: next.analysis,
  });
  const row = currentInvoice(next.id);
  if (row) {
    void import("./invoices/client").then((mod) => mod.persistStoredInvoice(row));
  }
}

function patchInvoice(
  id: string,
  analysis: InvoiceAnalysis | null,
  extra?: Patch["extra"],
) {
  queuedPatch = { id, analysis, extra };
  const urgent = analysis === null || analysis.status !== "running" || Boolean(extra?.fields);
  if (urgent) {
    flushPatch();
    return;
  }
  if (patchTimer) return;
  patchTimer = setTimeout(flushPatch, 90);
}

export function isAnalysisLive(id: string): boolean {
  const job = jobs.get(id);
  return Boolean(job && !job.aborted);
}

export function canRetryAnalysis(id: string): boolean {
  const job = jobs.get(id);
  return Boolean(job && !job.aborted && job.pages.some((page) => !page.result?.ok));
}

export function abortAnalysis(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.aborted = true;
  for (const page of job.pages) URL.revokeObjectURL(page.previewUrl);
  jobs.delete(id);
}

export async function startAnalysis(opts: {
  invoiceId: string;
  pages: InvoicePageImage[];
  mode: "new" | "append";
  pageIndexOffset: number;
}): Promise<void> {
  const current = currentInvoice(opts.invoiceId);
  if (!current) {
    for (const page of opts.pages) URL.revokeObjectURL(page.previewUrl);
    return;
  }

  const existing = jobs.get(opts.invoiceId);
  if (existing) {
    existing.aborted = true;
    for (const page of existing.pages) URL.revokeObjectURL(page.previewUrl);
  }

  const job: Job = {
    invoiceId: opts.invoiceId,
    gen: ++jobGen,
    mode: opts.mode,
    pageIndexOffset: opts.pageIndexOffset,
    pages: opts.pages.map((page) => ({
      imageBase64: page.base64,
      mimeType: page.mimeType,
      previewUrl: page.previewUrl,
    })),
    base: current,
    aborted: false,
  };
  jobs.set(opts.invoiceId, job);
  patchInvoice(opts.invoiceId, {
    status: "running",
    done: 0,
    total: job.pages.length,
    failed: 0,
    label: `Queued — ${job.pages.length} page${job.pages.length === 1 ? "" : "s"}`,
  });
  await runJob(job);
}

export async function retryAnalysis(invoiceId: string): Promise<boolean> {
  const job = jobs.get(invoiceId);
  if (!job) return false;
  job.aborted = false;
  job.gen = ++jobGen;
  for (const page of job.pages) {
    if (page.result && !page.result.ok) page.result = undefined;
  }
  const live = currentInvoice(invoiceId);
  if (live) job.base = live;
  patchInvoice(invoiceId, {
    status: "running",
    done: job.pages.filter((page) => page.result?.ok).length,
    total: job.pages.length,
    failed: 0,
    label: "Retrying failed pages…",
  });
  await runJob(job);
  return true;
}

async function runJob(job: Job): Promise<void> {
  const gen = job.gen;
  const { extractInvoice, mergeExtractResults } = await import("./extract");
  job.mergeExtractResults = mergeExtractResults;
  const total = job.pages.length;
  const pageCount = job.pageIndexOffset + total;

  await Promise.all(
    job.pages.map(async (page, index) => {
      if (page.result?.ok) return;
      await withSlot(async () => {
        if (job.aborted || job.gen !== gen) return;
        const pageNo = job.pageIndexOffset + index + 1;
        patchInvoice(job.invoiceId, {
          status: "running",
          done: job.pages.filter((item) => item.result).length,
          total,
          failed: job.pages.filter((item) => item.result && !item.result.ok).length,
          label: `Reading page ${pageNo} of ${pageCount}…`,
        });
        page.result = await extractPageOnce(extractInvoice, job, page, index, pageCount);
        if (job.aborted || job.gen !== gen) return;
        if (shouldRetryExtract(page.result)) {
          const first = page.result;
          patchInvoice(job.invoiceId, {
            status: "running",
            done: job.pages.filter((item) => item.result).length,
            total,
            failed: job.pages.filter((item) => item.result && !item.result.ok).length,
            label: `Retrying page ${pageNo}…`,
          });
          await delay(first.ok ? 250 : 700);
          if (job.aborted || job.gen !== gen) return;
          page.result = pickExtractResult(first, await extractPageOnce(extractInvoice, job, page, index, pageCount));
        }
        if (job.aborted || job.gen !== gen) return;
        publishProgress(job);
      });
    }),
  );

  if (job.aborted || job.gen !== gen) return;
  finishJob(job);
}

type ExtractFn = (opts: {
  data: {
    pages: Array<{ imageBase64: string; mimeType: string }>;
    pageIndex: number;
    pageCount: number;
  };
}) => Promise<ExtractResult>;

async function extractPageOnce(
  extractInvoice: ExtractFn,
  job: Job,
  page: CachedPage,
  index: number,
  pageCount: number,
): Promise<ExtractResult> {
  try {
    return await extractInvoice({
      data: {
        pages: [{ imageBase64: page.imageBase64, mimeType: page.mimeType }],
        pageIndex: job.pageIndexOffset + index,
        pageCount,
      },
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach extraction.",
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickExtractResult(first: ExtractResult, second: ExtractResult): ExtractResult {
  if (extractHasSignal(second)) return second;
  if (extractHasSignal(first)) return first;
  if (second.ok && !first.ok) return second;
  if (first.ok && !second.ok) return first;
  return second;
}

function publishProgress(job: Job): void {
  const parts = job.pages.map((page) => page.result).filter((part): part is ExtractResult => Boolean(part));
  const oks = parts.filter((part): part is ExtractOk => part.ok);
  const done = parts.length;
  const failed = parts.length - oks.length;
  const extra = mergeFields(job, oks);
  patchInvoice(
    job.invoiceId,
    {
      status: "running",
      done,
      total: job.pages.length,
      failed,
      label: failed
        ? `Read ${done} of ${job.pages.length} · ${failed} failed`
        : `Read ${done} of ${job.pages.length} pages…`,
    },
    extra,
  );
}

function mergeFields(
  job: Job,
  oks: ExtractOk[],
): {
  fields?: GstInvoice["fields"];
  lineItems?: GstInvoice["lineItems"];
  notes?: string;
  filledFromDefaults?: GstInvoice["filledFromDefaults"];
  pageCount?: number;
} | undefined {
  if (!oks.length) return undefined;
  const merge = job.mergeExtractResults;
  const merged = oks.length === 1 || !merge ? oks[0] : merge(oks);
  if (!merged.ok) return undefined;
  const defaults = useGstStore.getState().defaults;
  if (job.mode === "append") {
    const next = appendExtractedPages(
      job.base,
      merged,
      job.pages.length,
      `${job.pages.length} page${job.pages.length === 1 ? "" : "s"}`,
      defaults,
    );
    return {
      fields: next.fields,
      lineItems: next.lineItems,
      notes: next.notes,
      filledFromDefaults: next.filledFromDefaults,
      pageCount: next.pageCount,
    };
  }
  const lineItems = lineItemsFromExtract(merged.lineItems);
  const filled = applyFieldDefaults(
    fillMissingHeaderFromLines(fieldsFromExtract(merged.fields), lineItems),
    defaults,
  );
  return {
    fields: filled.fields,
    lineItems,
    notes: merged.notes || undefined,
    filledFromDefaults: filled.applied.length ? filled.applied : undefined,
    pageCount: job.pages.length > 1 ? job.pages.length : undefined,
  };
}

function finishJob(job: Job): void {
  const oks = job.pages.map((page) => page.result).filter((part): part is ExtractOk => Boolean(part?.ok));
  const failed = job.pages.filter((page) => !page.result?.ok).length;
  const extra = mergeFields(job, oks);

  if (!oks.length) {
    patchInvoice(job.invoiceId, {
      status: "error",
      done: job.pages.length,
      total: job.pages.length,
      failed,
      label: job.pages[0]?.result && !job.pages[0].result.ok
        ? job.pages[0].result.error
        : "Could not read this document. Retry from this row.",
    });
    toast.message("Analysis finished with errors. Retry from the register row.");
    return;
  }

  if (failed) {
    patchInvoice(job.invoiceId, {
      status: "error",
      done: job.pages.length,
      total: job.pages.length,
      failed,
      label: `${oks.length} page${oks.length === 1 ? "" : "s"} read · ${failed} timed out or failed`,
    }, extra);
    toast.message("Some pages failed. Retry from the register row.");
    return;
  }

  patchInvoice(job.invoiceId, null, extra);
  for (const page of job.pages) URL.revokeObjectURL(page.previewUrl);
  jobs.delete(job.invoiceId);
  const lines = extra?.lineItems?.length ?? 0;
  toast.success(
    lines
      ? `Invoice ready — ${lines} line${lines === 1 ? "" : "s"}.`
      : "Invoice ready — review the extracted fields.",
  );
}
