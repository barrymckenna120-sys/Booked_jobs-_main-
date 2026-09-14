# Mobile-data-only failure on bookedjobs.ie — revised findings and next checks

No DNS, code, configuration, secrets, or data were changed.

## Your clarification changes the diagnosis, but not in the direction expected

The decisive fact is one we already have: **karlsgas.lovable.app works on mobile data, while both bookedjobs.ie addresses fail on mobile data.**

That rules out the "mobile networks can't reach Lovable's Cloudflare edge" theory:

- `karlsgas.lovable.app` resolves to Cloudflare-announced addresses, is served by Cloudflare, and works on mobile data.
- `kngasservices.bookedjobs.ie` and `dublin-gas.bookedjobs.ie` resolve to Cloudflare-announced addresses, are served by Cloudflare, and fail on mobile data.

Same network operator, same edge infrastructure, same certificate authority, same application build. If mobile networks could not reach that edge, the working address would fail too. It doesn't.

So the one variable that tracks the failure exactly is **the domain name itself — bookedjobs.ie — not the IP address and not the edge.**

## What that pattern actually points at

"Works on every WiFi network, fails on every mobile network, follows the hostname rather than the address, survives a VPN on the same handset" is the classic signature of **mobile-operator name-based filtering**, not routing:

- Irish and most European mobile networks apply content filtering and parental/age controls by default on mobile data, and not on fixed broadband. These filters act on the requested hostname, not the destination address — which is why changing the IP twice made no lasting difference.
- Newly registered domains are commonly held in "uncategorised" or "unclassified" buckets by these filters and blocked until classified. `lovable.app` has existed since May 2023 and carries an established reputation; `bookedjobs.ie` is new, and public registry data for it is not published in the machine-readable registry service the way `lovable.app`'s is.
- A VPN app on the phone does not necessarily defeat this. If the VPN resolves names through the operator's resolver, or the filter acts before the tunnel is established, or the tunnel itself is filtered, the same block reproduces — which matches what Barry saw.

This is a hypothesis, not yet a confirmed cause. It is consistent with every observation so far and, unlike the routing theory, it is not contradicted by the working hostname.

## Does CNAME/proxy mode look more promising now?

**No — on this evidence it looks less promising, and it should not be attempted as a fix for this.**

- Proxy mode changes the DNS record type and the address the name resolves to. The browser still requests the hostname `kngasservices.bookedjobs.ie`. Name-based operator filtering keys on exactly that, so the block would survive the change.
- We already have direct proof that changing the address does not fix this: the addresses were changed once, appeared to work, and the same failure returned. Proxy mode is another address change.
- Proxy mode also requires resolving the existing Facebook verification record at that same name, and it would replace a supported configuration with one Lovable explicitly says it does not configure, validate, or monitor.

Spending another propagation cycle on a DNS change would most likely reproduce the same outcome a third time.

## Current infrastructure state, for the record — 14/09/26, 17:16–17:22 UTC

- Both domains resolve consistently worldwide to `185.41.148.1` and `185.41.148.2`; `kngasservices` also has IPv6, `dublin-gas` does not, and both were reported failing — so IPv6 is not the cause.
- Twenty external probes per domain across Europe, North America, South America, Asia and the Middle East: all HTTP 200.
- A 100-request burst across both domains and both addresses: 100/100 HTTP 200.
- Valid per-hostname certificates on both addresses; the real application loads fully in a browser on both custom domains and on `karlsgas.lovable.app`.
- `185.41.148.1`, `185.41.148.2` and the former `185.158.133.1` are all announced by the same network (Cloudflare AS13335) and are all Cloudflare-fronted Lovable pools — the replacement addresses were never a separate infrastructure path.

Nothing is broken on the hosting side from any network we can test from. The failure lives on the mobile path, keyed to the name.

## Next checks — all read-only, no DNS changes

1. **Confirm it is name-based filtering.** On the failing phone, mobile data only, WiFi off: open `https://kngasservices.bookedjobs.ie`, then `https://karlsgas.lovable.app`, then `https://bookedjobs.ie`, and note the exact wording and timing of each result. A filter block typically fails instantly, often with an operator notice page or a certificate/connection error, while a routing failure hangs. If the plain `bookedjobs.ie` name fails too, the whole domain is being filtered, which settles it.
2. **Check the operator's own controls.** Ask Barry to confirm whether content filtering, adult filtering, or age verification is active on his mobile account, and to try the site immediately after switching it off. This is the single fastest confirmation and costs nothing.
3. **Test a second, unrelated mobile account** on a different Irish operator on the same domain, to establish whether this is one account's settings or an industry-wide classification.
4. **Submit the domain for classification** with the affected operators if step 1 or 2 confirms filtering. This is the actual fix for this class of problem and does not touch DNS or the application.
5. **Capture the failure detail** where the phone exposes one — the operator notice text, or the Cloudflare Ray ID if a response does arrive — so we can distinguish an operator block from a Lovable edge rejection with evidence rather than inference.
6. **Meanwhile, keep Barry on `karlsgas.lovable.app`.** It is the same application, same data, same login, and it is proven to work on mobile data. That unblocks him today with no propagation wait and no configuration risk.

## Deliberately not in this plan

- No DNS record changes, no move to proxy mode, no reverting the replacement addresses.
- No application, database, or backend function changes.
- No change to the Facebook verification record.

## Limits of the evidence

- The reachability checks are a snapshot from fixed-line and datacentre networks. They cannot reproduce a mobile operator's filtering path, which is exactly where the failure lives — so they establish that hosting is healthy, not why Barry's phone fails.
- The filtering hypothesis is the best fit for every observation, but it is unconfirmed until step 1 or 2 is run on the affected handset.
