# bookedjobs.ie mobile-data outage — revised fix: Route B (A + AAAA), CNAME abandoned

## What changed

Route A (CNAME/proxy mode) is not viable for kngasservices.bookedjobs.ie:

- A CNAME cannot coexist with any other record at the same name (DNS standard, enforced by Blacknight).
- A `facebook-domain-verification` TXT record sits directly at `kngasservices.bookedjobs.ie`, blocking the CNAME.
- That TXT likely verifies the subdomain for Meta/Facebook (typically because it was used as an ads landing page). Deleting it is harmless only if K&N no longer runs Meta ads pointing at this subdomain — and there is no need to make that trade-off.

Route B (A + AAAA records) coexists with the Facebook TXT and any future records, so it is the chosen fix.

## URGENT first step — service is currently down

The A record was deleted during the CNAME attempt, so `kngasservices.bookedjobs.ie` currently resolves to nothing for everyone (Wi-Fi and mobile). Re-add it immediately at Blacknight:

```text
Type: A   Name: kngasservices   Value: 185.158.133.1
```

## The fix — DNS records at Blacknight for kngasservices

After the A record is back, add both IPv6 addresses (the hosting edge already answers on these; verified earlier with forced IPv6 requests returning HTTP 200 and the correct certificate for this hostname):

```text
Type: AAAA   Name: kngasservices   Value: 2a07:8240::1
Type: AAAA   Name: kngasservices   Value: 2a07:8240::2
```

Final state at the name `kngasservices.bookedjobs.ie`:

```text
A      185.158.133.1          (existing — restored)
AAAA   2a07:8240::1           (new)
AAAA   2a07:8240::2           (new)
TXT    facebook-domain-verification=...   (untouched)
```

The `_lovable` verification TXT lives at a different name (`_lovable.kngasservices`) and is unaffected.

## Known trade-off of Route B (accepted)

The AAAA addresses are the edge's current addresses, not from Lovable's published setup docs. If Lovable ever renumbers its edge, mobile access breaks again. Mitigations:

- Re-check periodically that the AAAA values still answer (quick dig/curl check).
- Optionally confirm the addresses with Lovable support so the values are on record.

## dublin-gas.bookedjobs.ie — hold

Do not touch until kngasservices is verified working on mobile data. Then repeat the identical record set (A already exists there; add the two AAAA records). Check first whether it also has a Facebook TXT — irrelevant for Route B, no action needed either way.

## Verification after the change

1. `kngasservices.bookedjobs.ie` returns both AAAA addresses from several public DNS resolvers.
2. Site loads over IPv6 with the correct certificate (I can re-run the forced-IPv6 curl checks).
3. Real test: both previously failing mobile networks, Wi-Fi off — site loads.
4. IPv4/Wi-Fi still works; domain still shows connected/Active in Lovable settings.

Records carry a one-hour TTL; allow up to an hour to propagate.

## No application changes

DNS-only fix. No code, database, or Edge Function changes.
