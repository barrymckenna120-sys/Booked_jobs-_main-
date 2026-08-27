// Trusted auth-event tokens.
//
// The failed-login endpoints used to be anonymously callable, so anyone could
// POST an email and get an account banned or an alert email sent (abuse +
// denial-of-service on real users).
//
// New design: `track-failed-login` is the ONLY endpoint the browser calls. It
// is the component that actually counts attempts server-side. When it needs a
// downstream action (lock the account, alert the office) it mints a short-lived
// HMAC token describing the event and passes it to the downstream function.
// `lock-failed-login` and `notify-failed-login` accept nothing else, so a
// downstream action can only ever follow a real, server-counted auth event.
//
// Fails closed: with no AUTH_EVENT_SECRET configured, no token can be minted
// and no token can be verified.

const encoder = new TextEncoder();

export type AuthEventPayload = {
  /** What the token authorises, e.g. "failed_login_lock". */
  purpose: string;
  /** Lower-cased email the event is about. Binds the token to one account. */
  email: string;
  /** Server-counted attempt number at mint time. */
  attempts: number;
  /** Unix seconds expiry. */
  exp: number;
};

export type AuthEventVerification =
  | { ok: true; payload: AuthEventPayload }
  | { ok: false; reason: "not_configured" | "malformed" | "bad_signature" | "expired" | "purpose_mismatch" | "email_mismatch" };

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function secret(): string {
  return String(Deno.env.get("AUTH_EVENT_SECRET") ?? "").trim();
}

async function sign(data: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a token for a server-observed auth event. Null when not configured. */
export async function mintAuthEventToken(
  input: { purpose: string; email: string; attempts: number; ttlSeconds?: number },
): Promise<string | null> {
  const key = secret();
  if (!key) {
    console.warn("authEvent: AUTH_EVENT_SECRET is not set — refusing to mint an auth-event token");
    return null;
  }
  const payload: AuthEventPayload = {
    purpose: input.purpose,
    email: input.email.trim().toLowerCase(),
    attempts: input.attempts,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 120),
  };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body, key)}`;
}

/** Verify a token, optionally binding it to a purpose and email. */
export async function verifyAuthEventToken(
  token: string | null | undefined,
  expect: { purpose: string; email?: string | null },
): Promise<AuthEventVerification> {
  const key = secret();
  if (!key) return { ok: false, reason: "not_configured" };
  const raw = String(token ?? "").trim();
  const [body, signature] = raw.split(".");
  if (!body || !signature) return { ok: false, reason: "malformed" };

  if (!timingSafeEqual(signature, await sign(body, key))) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: AuthEventPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!payload?.exp || payload.exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  if (payload.purpose !== expect.purpose) return { ok: false, reason: "purpose_mismatch" };
  if (
    expect.email &&
    payload.email !== String(expect.email).trim().toLowerCase()
  ) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true, payload };
}

/** The header downstream auth-event functions read the token from. */
export const AUTH_EVENT_HEADER = "x-auth-event-token";
