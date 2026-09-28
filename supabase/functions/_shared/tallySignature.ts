// Tally webhook signature verification + privacy-safe field-schema capture.
//
// Tally signs each webhook with `tally-signature` = base64(HMAC-SHA256(rawBody,
// signingSecret)). The signing secret lives in a backend secret whose NAME is
// stored on the tenant's `tally` integration row
// (`config.boiler_enquiry_signing_secret_name`) — never in code.

const enc = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Constant-time string compare (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function tallySignatureFor(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  return toBase64(new Uint8Array(sig));
}

export async function verifyTallySignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): Promise<boolean> {
  const provided = String(header ?? "").trim();
  const s = String(secret ?? "");
  if (!provided || !s) return false;
  return safeEqual(await tallySignatureFor(rawBody, s), provided);
}

/**
 * Field keys, labels and types ONLY — never answer values. Used to capture the
 * form's field IDs for mapping. Temporary debug aid.
 */
export function tallyFieldSchema(body: unknown): { key: string; label: string; type: string }[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const fields = data.fields;
  if (!Array.isArray(fields)) return [];
  return fields.slice(0, 200).map((f) => {
    const r = (f ?? {}) as Record<string, unknown>;
    return {
      key: String(r.key ?? ""),
      label: String(r.label ?? "").slice(0, 200),
      type: String(r.type ?? ""),
    };
  });
}
