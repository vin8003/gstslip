#!/usr/bin/env node
/**
 * GSTSlip tail-latency profiler.
 * Measures load, persist, and register-update long tasks.
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:8080/";
const RUNS = Number(process.argv[3] || 20);

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function summarize(label, values) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.reduce((s, n) => s + n, 0) / (sorted.length || 1);
  return {
    label,
    n: sorted.length,
    p50: Math.round(pct(sorted, 50)),
    p95: Math.round(pct(sorted, 95)),
    p99: Math.round(pct(sorted, 99)),
    max: Math.round(sorted[sorted.length - 1] || 0),
    avg: Math.round(avg),
  };
}

function invoice(i) {
  return {
    id: `inv-${i}`,
    sourceName: `scan-${i}.pdf`,
    capturedAt: "2026-09-01T00:00:00.000Z",
    fields: {
      invoice_number: `NT/${i}`,
      invoice_date: "2026-09-01",
      supplier_name: "Westline Textiles Pvt Ltd",
      supplier_gstin: "27AAPFW2194Q1Z3",
      supplier_address: "12 Mill Road",
      supplier_place: "Mumbai",
      supplier_pincode: "400001",
      buyer_name: "Arcadia Retail LLP",
      buyer_gstin: "29AABCU9603R1ZX",
      buyer_address: "88 Brigade",
      buyer_place: "Bengaluru",
      buyer_pincode: "560001",
      hsn_sac: "5208",
      taxable_value: "12500.00",
      cgst: "1125.00",
      sgst: "1125.00",
      igst: "",
      total_invoice_value: "14750.00",
      place_of_supply: "29-Karnataka",
      irn: "",
      ack_no: "",
      ack_date: "",
      signed_qr: "",
    },
    lineItems: Array.from({ length: 8 }, (_, n) => ({
      id: `line-${i}-${n}`,
      description: `Cotton poplin ${n + 1}`,
      hsn_sac: "5208",
      quantity: "10",
      unit: "MTR",
      rate: "125",
      taxable_value: "1250",
      cgst: "112.50",
      sgst: "112.50",
      igst: "",
      line_total: "1475",
    })),
    pageCount: 3,
  };
}

async function main() {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const load = [];
  const fcp = [];
  const lcp = [];
  const tbt = [];
  const js = [];
  const persist = [];
  const nodeCounts = [];
  const update = [];
  const longTasks = [];

  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage();
    const started = Date.now();
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=GSTSlip");
    load.push(Date.now() - started);

    const nav = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint");
      const lcpEntry = performance.getEntriesByType("largest-contentful-paint").at(-1);
      const resources = performance.getEntriesByType("resource");
      const jsBytes = resources
        .filter((r) => r.name.includes(".js") && !r.name.includes("pdf.worker"))
        .reduce((s, r) => s + (r.transferSize || 0), 0);
      return {
        fcp: paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? 0,
        lcp: lcpEntry?.startTime ?? 0,
        jsBytes,
      };
    });
    fcp.push(nav.fcp);
    lcp.push(nav.lcp);
    js.push(nav.jsBytes);

    const seeded = {
      state: {
        invoices: Array.from({ length: 10 }, (_, i) => invoice(i + 1)),
        capturesUsed: 10,
        isPro: false,
        defaults: invoice(0).fields,
      },
      version: 5,
    };
    await page.evaluate((payload) => {
      localStorage.setItem("gstslip-v1", JSON.stringify(payload));
    }, seeded);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Register", { state: "attached", timeout: 15000 });

    const persistMs = await page.evaluate(() => {
      const raw = localStorage.getItem("gstslip-v1") || "{}";
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        const parsed = JSON.parse(raw);
        localStorage.setItem("gstslip-v1", JSON.stringify(parsed));
        samples.push(performance.now() - t0);
      }
      return samples;
    });
    persist.push(...persistMs);

    const nodes = await page.evaluate(() => document.querySelectorAll("*").length);
    nodeCounts.push(nodes);

    const storeUpdate = await page.evaluate(() => {
      const samples = [];
      for (let i = 0; i < 40; i++) {
        const t0 = performance.now();
        const first = document.querySelector("article, tr");
        first?.getBoundingClientRect();
        samples.push(performance.now() - t0);
      }
      return samples;
    });
    update.push(...storeUpdate);

    const blocking = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return nav?.domContentLoadedEventEnd ?? 0;
    });
    tbt.push(blocking);
    await page.close();
  }

  await browser.close();
  const rows = [
    summarize("goto_domcontentloaded_ms", load),
    summarize("fcp_ms", fcp),
    summarize("lcp_ms", lcp),
    summarize("js_transfer_bytes", js),
    summarize("persist_roundtrip_ms", persist),
    summarize("layout_read_ms", update),
    summarize("dom_nodes", nodeCounts),
    summarize("dcl_ms", tbt),
  ];
  console.log(JSON.stringify({ url: URL, runs: RUNS, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
