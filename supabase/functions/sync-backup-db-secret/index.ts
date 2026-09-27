// TEMPORARY one-off (BJ-NEW-L). Delete immediately after a single run.
// Never returns, logs or prints the DB password or URL.
import sodium from "npm:libsodium-wrappers@0.7.15";

const REPO = "barrymckenna120-sys/Booked_jobs-_main-";
const REF = "ktkfuquqxbrmuqrmbmdj";
const POOLER_HOST = "aws-1-eu-west-2.pooler.supabase.com";
const POOLER_PORT = 5432;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

    const expected = Deno.env.get("TEMP_SYNC_TOKEN") ?? "";
    const provided = req.headers.get("x-sync-token") ?? "";
    if (!expected || !provided || !safeEqual(provided, expected)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const raw = Deno.env.get("SUPABASE_DB_URL");
    const pat = Deno.env.get("GITHUB_SECRETS_PAT");
    if (!raw) return json({ ok: false, error: "SUPABASE_DB_URL missing" }, 500);
    if (!pat) return json({ ok: false, error: "GITHUB_SECRETS_PAT missing" }, 500);

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch (_e) {
      return json({ ok: false, error: "SUPABASE_DB_URL unparseable" }, 500);
    }

    const origUser = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    if (!password) return json({ ok: false, error: "no password in URL" }, 500);

    const user = origUser.startsWith(`postgres.${REF}`) ? origUser : `postgres.${REF}`;

    const target =
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
      `@${POOLER_HOST}:${POOLER_PORT}/postgres?sslmode=require`;

    const gh = {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bookedjobs-sync-backup-db-secret",
    };

    const keyRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/secrets/public-key`,
      { headers: gh },
    );
    if (!keyRes.ok) {
      await keyRes.body?.cancel();
      return json({
        ok: false, github_status: keyRes.status, stage: "public-key",
        host: POOLER_HOST, port: POOLER_PORT, user_prefix: user.slice(0, 12),
      });
    }
    const { key, key_id } = await keyRes.json();

    await sodium.ready;
    const sealed = sodium.crypto_box_seal(
      sodium.from_string(target),
      sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
    );
    const encrypted_value = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);

    const putRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/secrets/SUPABASE_DB_URL`,
      {
        method: "PUT",
        headers: { ...gh, "Content-Type": "application/json" },
        body: JSON.stringify({ encrypted_value, key_id }),
      },
    );
    await putRes.body?.cancel();

    return json({
      ok: putRes.status === 201 || putRes.status === 204,
      github_status: putRes.status,
      host: POOLER_HOST,
      port: POOLER_PORT,
      user_prefix: user.slice(0, 12),
    });
  } catch (_e) {
    return json({ ok: false, error: "internal" }, 500);
  }
});
