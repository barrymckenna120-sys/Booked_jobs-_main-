# kngasservices.bookedjobs.ie still failing on mobile data — do NOT revert the AAAA records

## New evidence (checked just now from outside)

| Hostname | IPv4 | IPv6 | Mobile data |
|---|---|---|---|
| karlsgas.lovable.app | 185.41.148.1 / .2 | 2a07:8240::1 / ::2 | works |
| kngasservices.bookedjobs.ie | 185.158.133.1 | 2a07:8240::1 / ::2 | fails |
| dublin-gas.bookedjobs.ie | 185.158.133.1 | none | fails |

Two facts settle the IPv6 question:

1. The hostname that **works** on mobile data uses the **exact same two IPv6 addresses** as the one that fails. If the carrier could not route those addresses, karlsgas.lovable.app would fail too. It doesn't.
2. dublin-gas.bookedjobs.ie has **no IPv6 at all** and fails on mobile data in the same way. So the failure existed in a pure IPv4-only state.

So removing the AAAA records cannot restore anything — that is exactly the state dublin-gas is in, and it is broken. Reverting costs an hour of propagation and buys nothing.

The one thing the two failing names share and the working name does not: the IPv4 address **185.158.133.1** (a different edge range from 185.41.148.x used by lovable.app). Both answer fine from here (HTTP 200 over IPv4 and IPv6, valid certificates), so this is a path/reachability problem between mobile networks and that specific address, not a DNS or hosting-config problem.

## Recommendation right now, for Karl

Do not change DNS. Have Karl use **https://karlsgas.lovable.app** for today — same app, same data, same login, and it is proven to work on mobile data on both carriers. That unblocks him in seconds with zero propagation wait.

## Investigation steps (in order)

1. **Confirm what the phone actually sees.** On the failing phone, mobile data only:
   - open `https://kngasservices.bookedjobs.ie` — note whether it hangs or errors instantly;
   - then open `https://185.158.133.1` — a certificate warning proves the address is reachable; a hang proves it is not.
   This single test separates "carrier can't reach that address" from "TLS/SNI problem for this hostname".
2. **Force IPv4-only vs IPv6-only from the phone's network** (Wi‑Fi off) by asking a mobile-network device to load the site while the AAAA records are temporarily ignored — done via a test hostname, not by touching the live records.
3. **If the address is unreachable from mobile networks**, this is on the hosting edge, not on Blacknight. Raise it with Lovable support with the evidence above: custom domains resolve to 185.158.133.1 which is unreachable from at least two mobile carriers, while *.lovable.app on 185.41.148.x works. Ask whether custom domains can be served from the same edge range, or via the CNAME/proxy mode target.
4. **Route A (CNAME/proxy mode) becomes attractive again**, because it points the name at a hostname rather than that single address — the proxy edge is a different network path. It is blocked only by the `facebook-domain-verification` TXT sitting at the same name. If Karl is not running Meta ads at this subdomain, deleting that TXT unblocks Route A and is re-verifiable later.

## dublin-gas.bookedjobs.ie

Leave as is. Do not add AAAA there yet — nothing is proven to help.

## No application changes

DNS/hosting only. No code, database, or Edge Function changes.
