No code changes required — this was a read-only verification of the already-deployed `resolve-document-link` function.

## Verification results

| # | Token | Type | Status | Body |
|---|---|---|---|---|
| 1 | `63eb4b36-a18e-40f5-99f0-569654feac11` (valid UUID access_token) | certificate | 200 | `{"signed_url":"https://…/storage/v1/object/sign/certificates/KN-2026-3951.pdf?token=…"}` |
| 2 | `DG-2026-5204` (legacy cert number) | certificate | 200 | `{"signed_url":"https://…/storage/v1/object/sign/certificates/DG-2026-5204.pdf?token=…"}` |
| 3 | `not-a-token` | certificate | 404 | `{"error":"not_found"}` |
| 4 | `DG-2026-5204` | quote | 404 | `{"error":"not_found"}` |

All four outcomes match expectations:
- UUID access_token path resolves normally.
- Legacy cert-number fallback resolves only when `type=certificate`.
- Malformed tokens still 404.
- The legacy fallback is correctly scoped — the same legacy string under `type=quote` does not leak into a signed URL.

No plan to implement; awaiting further instruction.