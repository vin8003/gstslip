import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { ipQuotaId, normalizeIp } from "./rules";

function forwardedIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return normalizeIp(first);
  const real =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-client-ip")?.trim();
  if (real) return normalizeIp(real);
  return "0.0.0.0";
}

export function hashedClientIp(): string {
  const request = getRequest();
  const ip = request ? forwardedIp(request) : "0.0.0.0";
  const digest = createHash("sha256").update(`gstslip-ip-v1:${ip}`, "utf8").digest("hex");
  return ipQuotaId(digest);
}
