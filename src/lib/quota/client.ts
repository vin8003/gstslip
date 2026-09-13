import { useGstStore } from "@/lib/store";
import {
  confirmQuotaVerification,
  consumeCapture,
  getQuota,
  sendQuotaVerification,
  type ConsumeResult,
  type QuotaStatus,
} from "./store";

export type { ConsumeResult, QuotaStatus };

export function applyQuotaStatus(status: QuotaStatus): void {
  useGstStore.getState().setCapturesUsed(status.capturesUsed);
  if (status.isPro) useGstStore.getState().setPro(true);
}

export async function refreshQuota(): Promise<QuotaStatus> {
  const localUsed = useGstStore.getState().capturesUsed;
  const status = await getQuota({ data: { localUsed } });
  applyQuotaStatus(status);
  return status;
}

export async function takeCaptureSlot(): Promise<ConsumeResult> {
  const localUsed = useGstStore.getState().capturesUsed;
  const result = await consumeCapture({ data: { localUsed } });
  applyQuotaStatus(result);
  return result;
}

export async function requestVerifyCode(): Promise<{ status: QuotaStatus; previewCode?: string }> {
  const result = await sendQuotaVerification();
  applyQuotaStatus(result);
  return { status: result, previewCode: result.previewCode };
}

export async function submitVerifyCode(code: string): Promise<QuotaStatus> {
  const status = await confirmQuotaVerification({ data: { code } });
  applyQuotaStatus(status);
  return status;
}
