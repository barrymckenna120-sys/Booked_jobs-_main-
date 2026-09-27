// TEMPORARY one-off (BJ-NEW-L). Delete immediately after a single run.
// Never returns, logs or prints the DB password or URL.
import sodium from "npm:libsodium-wrappers@0.7.13";

const REPO_OWNER = "barrymckenna120";
let REPO_NAME = "bookedjobs";
const SECRET_NAME = "SUPABASE_DB_URL";
const POOLER_HOST = "aws-1-eu-west-2.pooler.supabase.com";
const POOLER_PORT = 5432;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    // One-time token guard
    const expected = Deno.env.get("TEMP_SYNC_TOKEN");
    const provided = req.headers.get("x-sync-token") ?? "";
    if (!expected || provided !== expected) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    const pat = Deno.env.get("GITHUB_SECRETS_PAT");
    if (!dbUrl || !pat) {
      return json({ ok: false, error: "missing_env" }, 500);
    }

    // Parse the original URL (never logged or returned)
    let u: URL;
    try {
      u = new URL(dbUrl);
    } catch (_e) {
      return json({ ok: false, error: "unparseable_db_url" }, 500);
    }
    const origUser = decodeURIComponent(u.username);
    const password = decodeURIComponent(u.password);
    const origHost = u.hostname;
    if (!origUser || !password) {
      return json({ ok: false, error: "missing_credentials_in_url" }, 500);
    }

    // Rebuild as IPv4 session pooler URL
    const rebuilt =
      `postgres://${encodeURIComponent(origUser)}:${encodeURIComponent(password)}` +
      `@${POOLER_HOST}:${POOLER_PORT}/postgres`;

    const ghHeaders = {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bookedjobs-secret-sync",
    };

    // Fetch repo public key; on 404, auto-discover the repo that already
    // has the SUPABASE_DB_URL Actions secret (name only, never the value).
    let keyResp = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/public-key`,
      { headers: ghHeaders },
    );
    if (keyResp.status === 404) {
      const reposResp = await fetch(
        "https://api.github.com/user/repos?per_page=100",
        { headers: ghHeaders },
      );
      if (!reposResp.ok) {
        return json(
          { ok: false, error: "github_repo_list_failed", github_status: reposResp.status },
          502,
        );
      }
      const repos = await reposResp.json();
      for (const r of repos) {
        const sResp = await fetch(
          `https://api.github.com/repos/${r.full_name}/actions/secrets/${SECRET_NAME}`,
          { headers: ghHeaders },
        );
        if (sResp.ok) {
          REPO_NAME = r.name;
          keyResp = await fetch(
            `https://api.github.com/repos/${r.full_name}/actions/secrets/public-key`,
            { headers: ghHeaders },
          );
          break;
        }
      }
    }
    if (!keyResp.ok) {
      return json(
        { ok: false, error: "github_key_fetch_failed", github_status: keyResp.status },
        502,
      );
    }
    const { key, key_id } = await keyResp.json();

    // Encrypt with libsodium sealed box
    await sodium.ready;
    const encrypted = sodium.crypto_box_seal(
      sodium.from_string(rebuilt),
      sodium.from_hex(key, "base64"),
    );
    const encrypted_value = sodium.to_base64(
      encrypted,
      sodium.base64_variants.ORIGINAL,
    );

    // Write the secret
    const putResp = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/${SECRET_NAME}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "bookedjobs-secret-sync",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ encrypted_value, key_id }),
      },
    );
    if (!putResp.ok && putResp.status !== 201 && putResp.status !== 204) {
      return json(
        { ok: false, error: "github_secret_write_failed", github_status: putResp.status },
        502,
      );
    }

    return json({
      ok: true,
      github_status: putResp.status,
      host: POOLER_HOST,
      port: POOLER_PORT,
      user_prefix: origUser.slice(0, 12),
      orig_user_prefix: origUser.slice(0, 12),
      orig_host: origHost,
    });
  } catch (_e) {
    return json({ ok: false, error: "internal", detail: String(_e).slice(0, 150) }, 500);
  }
});
