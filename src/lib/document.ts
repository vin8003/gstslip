import { MAX_INVOICE_PAGES } from "./gst";

const MAX_EDGE = 768;
const JPEG_QUALITY = 0.55;
const MAX_JPEG_BYTES = 280_000;

type PdfJs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
let pdfjsLoader: Promise<PdfJs> | null = null;

export type InvoicePageImage = {
  base64: string;
  mimeType: "image/jpeg";
  previewUrl: string;
  label: string;
};

export type PageListener = (
  page: InvoicePageImage,
  index: number,
  total: number,
) => void;

export function warmDocumentPipeline(): void {
  void loadPdfjs();
}

export async function filesToInvoicePages(
  files: File[],
  onPage?: PageListener,
  maxPages = MAX_INVOICE_PAGES,
): Promise<InvoicePageImage[]> {
  const cap = Math.max(1, Math.min(MAX_INVOICE_PAGES, maxPages));
  const created: string[] = [];
  const opened: PdfDocument[] = [];
  try {
    const prepared = await Promise.all(
      files.slice(0, cap).map(async (file) => {
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) return { kind: "image" as const, file };
        const pdf = await openPdf(file);
        opened.push(pdf);
        return { kind: "pdf" as const, file, pdf };
      }),
    );

    type Task = { index: number; run: () => Promise<InvoicePageImage> };
    const tasks: Task[] = [];
    for (const item of prepared) {
      if (tasks.length >= cap) break;
      if (item.kind === "image") {
        const index = tasks.length;
        const file = item.file;
        tasks.push({
          index,
          run: () => encodeImageFile(file, created),
        });
        continue;
      }
      const remaining = cap - tasks.length;
      const count = Math.min(item.pdf.numPages, Math.max(1, remaining));
      for (let n = 1; n <= count; n++) {
        const index = tasks.length;
        const pdf = item.pdf;
        const file = item.file;
        const label = count > 1 ? `${file.name} · p.${n}` : file.name;
        tasks.push({
          index,
          run: () => encodePdfPage(pdf, n, label, created),
        });
      }
    }

    const total = tasks.length;
    const pages: InvoicePageImage[] = new Array(total);
    await Promise.all(
      tasks.map(async (task) => {
        const page = await task.run();
        pages[task.index] = page;
        onPage?.(page, task.index, total);
      }),
    );
    if (!pages.length || pages.some((page) => !page)) {
      throw new Error("Could not read any pages from those files.");
    }
    return pages;
  } catch (error) {
    for (const url of created) URL.revokeObjectURL(url);
    throw error;
  } finally {
    await Promise.all(opened.map((pdf) => pdf.destroy()));
  }
}

async function encodeImageFile(file: File, created: string[]): Promise<InvoicePageImage> {
  const bitmap = await imageBitmap(file);
  try {
    return canvasToPage(drawFitted(bitmap), file.name, created);
  } finally {
    bitmap.close();
  }
}

async function encodePdfPage(
  pdf: PdfDocument,
  pageNumber: number,
  label: string,
  created: string[],
): Promise<InvoicePageImage> {
  const canvas = await renderPdfPage(pdf, pageNumber);
  return canvasToPage(canvas, label, created);
}

async function canvasToPage(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  label: string,
  created: string[],
): Promise<InvoicePageImage> {
  const blob = await canvasToJpegBlob(canvas);
  const previewUrl = URL.createObjectURL(blob);
  created.push(previewUrl);
  try {
    const base64 = await blobToBase64(blob);
    return { base64, mimeType: "image/jpeg", previewUrl, label };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

async function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsLoader) {
    pdfjsLoader = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsLoader;
}

async function openPdf(file: File): Promise<PdfDocument> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    isEvalSupported: false,
  }).promise;
}

async function imageBitmap(file: File): Promise<ImageBitmap> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(url);
      bitmap = await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const size = fitSize(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && size.height === bitmap.height) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: "low",
  });
  bitmap.close();
  return resized;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image. Use JPEG, PNG, or PDF."));
    img.src = src;
  });
}

function fitSize(width: number, height: number): { width: number; height: number } {
  const max = Math.max(width, height, 1);
  if (max <= MAX_EDGE) return { width: Math.max(1, width), height: Math.max(1, height) };
  const scale = MAX_EDGE / max;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawFitted(source: ImageBitmap): HTMLCanvasElement | OffscreenCanvas {
  const size = fitSize(source.width, source.height);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { alpha: false }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("Could not process the document image.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function renderPdfPage(pdf: PdfDocument, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  try {
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(1.15, MAX_EDGE / Math.max(unscaled.width, unscaled.height, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not render the PDF page.");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  } finally {
    page.cleanup();
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  const blob = await canvasToBlob(canvas, JPEG_QUALITY);
  if (blob.size <= MAX_JPEG_BYTES) return blob;
  return canvasToBlob(canvas, 0.42);
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode the document image."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not encode the document image."));
    reader.readAsDataURL(blob);
  });
}
