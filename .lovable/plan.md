# Legacy cert-number fallback in resolve-document-link

Additive-only change, scoped to `type === "certificate"`.

## Edit: `supabase/functions/resolve-document-link/index.ts`

1. Add regex next to `UUID_RE`:
   ```ts
   const LEGACY_CERT_NUMBER_RE = /^[A-Z]{2,4}-\d{4}-\d+$/;
   ```
2. Replace the current token gate:
   ```ts
   if (!UUID_RE.test(token)) return notFound();
   ```
   with:
   ```ts
   const isUuid = UUID_RE.test(token);
   const isLegacyCertNumber =
     type === "certificate" && LEGACY_CERT_NUMBER_RE.test(token);
   if (!isUuid && !isLegacyCertNumber) return notFound();
   ```
3. Choose lookup column based on the matched format:
   ```ts
   const lookupColumn = isUuid ? "access_token" : "cert_number";
   const { data: row, error } = await sb
     .from(cfg.table)
     .select(`${cfg.urlColumn}, organisation_id`)
     .eq(lookupColumn, token)
     .maybeSingle();
   ```

Everything after the lookup (missing row → 404, `extractStoragePath`, `signDocumentUrl`, JSON response) is unchanged.

## Scope guarantees

- Only the `certificate` doc type accepts the legacy format. `quote`, `receipt`, `invoice`, `hazard` still require a UUID token.
- Non-matching tokens still return the existing `{ "error": "not_found" }` 404.
- No schema, RLS, client, or other edge-function changes.

## Verification after deploy

- `curl` with UUID token → 200 signed URL (regression check).
- `curl` with `DG-2026-5204` → 200 signed URL (the failing legacy link).
- `curl` with `not-a-token` → 404.
- `curl` with `DG-2026-5204` against `type=quote` → 404 (scope check).