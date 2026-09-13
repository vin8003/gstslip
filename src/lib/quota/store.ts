import { createHash, randomInt } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { canUseFreeQuota, clampUsed, hashCode, mergeUsed, remainingOf, userQuotaId } from "./rules";
import { optionalSession } from "./session";

export type QuotaStatus = {
  capturesUsed: number;
  remaining: number;
  isPro: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  needsVerification: boolean;
};

export type ConsumeResult = QuotaStatus & {
  ok: boolean;
  reason?: "exhausted" | "unverified";
};

export type VerifySendResult = QuotaStatus & {
  sent: boolean;
  previewCode?: string;
};

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function ipKey(): Promise<string> {
  const { hashedClientIp } = await import("./ip.server");
  return hashedClientIp();
}

async function readUsed(id: string): Promise<number> {
  const db = await sql();
  const rows = await db<{ captures_used: number }>`
    select captures_used from capture_quota where id = ${id} limit 1
  `;
  return clampUsed(Number(rows[0]?.captures_used ?? 0));
}

async function writeUsed(id: string, kind: "user" | "ip", used: number): Promise<void> {
  const db = await sql();
  const next = clampUsed(used);
  await db`
    insert into capture_quota (id, kind, captures_used, updated_at)
    values (${id}, ${kind}, ${next}, now())
    on conflict (id) do update
      set captures_used = greatest(capture_quota.captures_used, ${next}),
          updated_at = now()
  `;
}

async function isProUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { readSnapshot } = await import("@/lib/billing/store");
  const snap = await readSnapshot(userId);
  return snap.isPro;
}

async function emailVerifiedOf(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const db = await sql();
  const rows = await db<{ verified: boolean | null; social: boolean | null }>`
    select
      u."emailVerified" as verified,
      exists (
        select 1 from account a
        where a."userId" = ${userId}
          and a."providerId" <> 'credential'
      ) as social
    from "user" u
    where u.id = ${userId}
    limit 1
  `;
  const verified = Boolean(rows[0]?.verified) || Boolean(rows[0]?.social);
  if (rows[0]?.social && !rows[0]?.verified) {
    await db`
      update "user" set "emailVerified" = true, "updatedAt" = now()
      where id = ${userId}
    `;
  }
  return verified;
}

async function resolveUsed(userId: string | null, localUsed: number): Promise<{ id: string; kind: "user" | "ip"; used: number }> {
  const ipId = await ipKey();
  const ipUsed = await readUsed(ipId);
  const local = clampUsed(localUsed);
  if (!userId) {
    const used = mergeUsed(ipUsed, local);
    if (used !== ipUsed) await writeUsed(ipId, "ip", used);
    return { id: ipId, kind: "ip", used };
  }
  const userIdKey = userQuotaId(userId);
  const userUsed = await readUsed(userIdKey);
  const used = mergeUsed(mergeUsed(userUsed, ipUsed), local);
  await writeUsed(userIdKey, "user", used);
  await writeUsed(ipId, "ip", used);
  return { id: userIdKey, kind: "user", used };
}

function toStatus(opts: {
  used: number;
  isPro: boolean;
  signedIn: boolean;
  emailVerified: boolean;
}): QuotaStatus {
  return {
    capturesUsed: opts.isPro ? 0 : clampUsed(opts.used),
    remaining: remainingOf(opts.used, opts.isPro),
    isPro: opts.isPro,
    signedIn: opts.signedIn,
    emailVerified: opts.emailVerified,
    needsVerification: opts.signedIn && !opts.isPro && !opts.emailVerified,
  };
}

export const getQuota = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { localUsed?: number } | undefined) => ({
    localUsed: clampUsed(Number(input?.localUsed ?? 0)),
  }))
  .handler(async ({ context, data }): Promise<QuotaStatus> => {
    const signedIn = Boolean(context.userId);
    const [isPro, emailVerified, resolved] = await Promise.all([
      isProUser(context.userId),
      emailVerifiedOf(context.userId),
      resolveUsed(context.userId, data.localUsed),
    ]);
    return toStatus({ used: resolved.used, isPro, signedIn, emailVerified });
  });

export const consumeCapture = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { localUsed?: number } | undefined) => ({
    localUsed: clampUsed(Number(input?.localUsed ?? 0)),
  }))
  .handler(async ({ context, data }): Promise<ConsumeResult> => {
    const signedIn = Boolean(context.userId);
    const isPro = await isProUser(context.userId);
    const emailVerified = await emailVerifiedOf(context.userId);
    const resolved = await resolveUsed(context.userId, data.localUsed);
    const gate = canUseFreeQuota({
      isPro,
      signedIn,
      emailVerified,
      used: resolved.used,
    });
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, ...toStatus({ used: resolved.used, isPro, signedIn, emailVerified }) };
    }
    if (isPro) {
      return { ok: true, ...toStatus({ used: resolved.used, isPro: true, signedIn, emailVerified }) };
    }
    const next = clampUsed(resolved.used + 1);
    await writeUsed(resolved.id, resolved.kind, next);
    if (resolved.kind === "user") await writeUsed(await ipKey(), "ip", next);
    return { ok: true, ...toStatus({ used: next, isPro: false, signedIn, emailVerified }) };
  });

export const sendQuotaVerification = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<VerifySendResult> => {
    if (!context.userId) {
      return {
        sent: false,
        ...toStatus({ used: 0, isPro: false, signedIn: false, emailVerified: false }),
      };
    }
    const signedIn = true;
    const isPro = await isProUser(context.userId);
    const emailVerified = await emailVerifiedOf(context.userId);
    const resolved = await resolveUsed(context.userId, 0);
    const status = toStatus({ used: resolved.used, isPro, signedIn, emailVerified });
    if (emailVerified) return { sent: false, ...status };
    const code = String(randomInt(100000, 1000000));
    const codeHash = digest(hashCode(context.userId, code));
    const db = await sql();
    await db`
      insert into email_verify_codes (user_id, code_hash, expires_at)
      values (${context.userId}, ${codeHash}, now() + interval '30 minutes')
      on conflict (user_id) do update
        set code_hash = ${codeHash},
            expires_at = now() + interval '30 minutes'
    `;
    const preview = !String(process.env.DATABASE_URL ?? "").trim();
    return { sent: true, previewCode: preview ? code : undefined, ...status };
  });

export const confirmQuotaVerification = createServerFn({ method: "POST" })
  .middleware([optionalSession])
  .validator((input: { code?: string }) => ({
    code: String(input?.code ?? "").replace(/\D/g, "").slice(0, 6),
  }))
  .handler(async ({ context, data }): Promise<QuotaStatus> => {
    if (!context.userId) {
      return toStatus({ used: 0, isPro: false, signedIn: false, emailVerified: false });
    }
    const db = await sql();
    if (data.code.length === 6) {
      const rows = await db<{ code_hash: string; expires_at: string | Date }>`
        select code_hash, expires_at from email_verify_codes
        where user_id = ${context.userId} limit 1
      `;
      const row = rows[0];
      const expires = row?.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(String(row?.expires_at ?? ""));
      const expected = digest(hashCode(context.userId, data.code));
      if (row && Number.isFinite(expires) && expires > Date.now() && row.code_hash === expected) {
        await db`
          update "user" set "emailVerified" = true, "updatedAt" = now()
          where id = ${context.userId}
        `;
        await db`delete from email_verify_codes where user_id = ${context.userId}`;
      }
    }
    const isPro = await isProUser(context.userId);
    const emailVerified = await emailVerifiedOf(context.userId);
    const resolved = await resolveUsed(context.userId, 0);
    return toStatus({ used: resolved.used, isPro, signedIn: true, emailVerified });
  });
