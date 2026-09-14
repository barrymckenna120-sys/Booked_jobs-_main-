# Mobile custom-domain failure — findings and read-only next checks

No DNS, code, configuration, secrets, or data were changed.

## Current findings — 14/09/26, 17:16–17:22 UTC

### 1. Both domains are reachable globally right now

- `kngasservices.bookedjobs.ie` currently resolves to `185.41.148.1` and `185.41.148.2`, plus IPv6 `2a07:8240::1` and `2a07:8240::2`.
- `dublin-gas.bookedjobs.ie` currently resolves to `185.41.148.1` and `185.41.148.2`; no IPv6 answer was observed.
- Both domains are Active in Lovable and the project is published.
- Twenty external probes per domain, spanning Europe, North America, South America, Asia and the Middle East, returned HTTP 200. Both `.1` and `.2` were selected successfully by different probes.
- Forced hostname/TLS requests succeeded for all four domain/address combinations.
- A 100-request burst — 25 requests for each domain against each replacement address — returned 100/100 HTTP 200 responses.
- Certificates are valid for each exact hostname. The real app HTML, scripts, styles and images loaded successfully in a browser on both custom domains and on `karlsgas.lovable.app`.

No current domain-specific, address-specific, DNS, TCP, TLS, HTTP, asset-loading, or global routing failure was reproduced.

### 2. The replacement addresses were never a genuinely separate infrastructure path

- `185.41.148.1`, `185.41.148.2`, and the former standard address `185.158.133.1` are all announced by Cloudflare AS13335.
- All three are Lovable-managed Cloudflare-fronted address pools. The replacement addresses are a different Lovable pool, not a direct route around Cloudflare or around Lovable's edge.
- Both replacement addresses share one announced `/24` route. A routing or edge-policy problem affecting that pool can therefore affect both together.
- The earlier change could avoid a fault specific to the `185.158.133.0/24` pool, but it could not eliminate the broader class of Cloudflare/Lovable edge-path failures.
- Because Barry's failure also reproduces through a VPN, a single Irish carrier route or stale carrier DNS cache is no longer a sufficient explanation. A VPN on the same phone still shares the device, Safari/PWA state, hostname, TLS/session behavior and app/backend startup path.

Conclusion: the direct-IP change is presently healthy, but it cannot be classified as a stable architectural fix from this snapshot. It is an unsupported static dependency on a different Lovable address pool and may have been only a partial workaround.

### 3. Both domains behave consistently in current testing

- Both return the same application build and the same successful browser startup.
- Both replacement addresses serve both hostnames correctly.
- No evidence currently shows one domain working while the other fails.
- One material DNS difference remains: `kngasservices` has IPv4 and IPv6 plus a Facebook verification TXT record; `dublin-gas` has IPv4 only and no TXT record at that hostname.
- Since both were reported affected while only one has IPv6, IPv6 alone cannot explain a shared failure.

### 4. CNAME/proxy mode is worth reassessing, but it is not automatically a separate origin path

- Lovable currently records both domains as being in `proxy` mode, while public DNS still exposes static A records. That is a configuration mismatch worth clarifying with Lovable before any change.
- Lovable's documented proxy setup replaces static A records with a CNAME target. This is more maintainable than pinning undocumented IPs because Lovable can change the target's addresses without another manual DNS edit.
- A CNAME alone still reaches Lovable's Cloudflare-fronted infrastructure; it does not prove a fundamentally different final network path.
- A customer-managed CDN/proxy in front would create a genuinely different first hop, but adds another operated layer and still ultimately depends on Lovable's edge.
- `kngasservices.bookedjobs.ie` cannot carry its existing Facebook TXT record at the same DNS name as a standards-compliant CNAME. `dublin-gas.bookedjobs.ie` has no such conflict today.
- Therefore proxy mode is a credible supported alternative to static undocumented IPs, but it should not be presented as a guaranteed cure until the exact CNAME target, Blacknight behavior, Facebook verification placement, and Lovable's current `proxy`-mode status are confirmed.

## Read-only diagnostic plan before any DNS proposal

1. Capture the exact failing state on Barry's phone at the time it occurs: Safari versus installed app, exact domain, visible error or blank screen, timestamp, and whether `karlsgas.lovable.app` works in the same minute.
2. On the same phone and connection, separately test the page HTML, one versioned `/assets/` file, and the backend health path. This identifies whether failure is DNS/TCP/TLS, static assets, service-worker/app startup, or backend connectivity.
3. Compare both custom domains and the Lovable fallback in one session, then repeat in a private Safari tab. If private Safari works while the installed app fails, the network edge is not the primary fault.
4. Obtain the Cloudflare Ray ID or Safari network error from the failed response where available, so Lovable can trace the exact edge location and failure instead of relying on successful global snapshots.
5. Ask Lovable to confirm why both domains are marked `proxy` while publishing static A records, whether `185.41.148.1/.2` are supported custom-domain targets, and the exact supported CNAME target for this project.
6. Only after those results, compare three controlled options: supported Lovable A records, supported Lovable CNAME mode, or a customer-managed proxy. No production DNS change is included in this plan.

## Limits of the evidence

- The checks are a current snapshot, not long-duration monitoring, so they cannot disprove a transient incident before or after the test window.
- External probes do not reproduce Barry's exact device, installed-app cache, mobile radio transition, VPN client, or authenticated backend session.
- The present evidence establishes that the domains and both replacement addresses are globally healthy now; it does not establish why Barry's earlier attempt failed.
