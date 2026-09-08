# Urgent: kngasservices.bookedjobs.ie unreachable on mobile data

## What the checks found

The site itself is healthy. Nothing on our side is broken, and no code change will fix this.

- The address answers normally from outside: six consecutive requests returned the live app in about 0.1 seconds.
- The domain is connected and verified, the project is published, and the security certificate is valid until 24 Oct 2026 with a complete, trusted chain.
- All four name servers and four independent public DNS services return the same correct address for both kngasservices.bookedjobs.ie and dublin-gas.bookedjobs.ie.
- Dublin Gas is equally healthy, and karlsgas.lovable.app is healthy.

Reported behaviour: fails on mobile data, works on Wi-Fi, affects more than one person, and the lovable.app address keeps working on the same phones.

That pattern points to one cause: the mobile network is blocking or mis-resolving the bookedjobs.ie name. Irish mobile carriers run content filters that silently drop domains they have not classified, and a newer domain like bookedjobs.ie is a typical casualty. The lovable.app name is long-classified, which is why it still loads.

## Step 1 — Confirm the carrier is the blocker (no changes, minutes)

On an affected phone, still on mobile data with Wi-Fi off:

1. Open kngasservices.bookedjobs.ie — expect the same failure.
2. Open dublin-gas.bookedjobs.ie — if it also fails, the whole bookedjobs.ie name is being blocked, not one customer site.
3. Note the carrier name (Eir, Three, Vodafone, Sky, etc.) and whether the account has any parental control or content filter enabled.
4. Ask a second person on a different carrier to try on mobile data. If their carrier works, that isolates it to the one network.

If step 2 shows only kngasservices failing while dublin-gas works on the same phone, that changes the diagnosis and I will re-investigate that single name specifically.

## Step 2 — Immediate workaround for staff and customers

While the block is in place:

- karlsgas.lovable.app serves the same K&N app and is reachable on mobile data. Staff can use it today.
- Turning on Wi-Fi restores the branded address.
- On iPhone, switching to a private DNS/secure DNS profile (e.g. Cloudflare's 1.1.1.1 app) bypasses most carrier filters and is a quick per-device fix.

## Step 3 — Get the block lifted

Contact the affected carrier's business support and ask them to remove bookedjobs.ie from their content filter or classify it as a business site. Points to give them:

- Domain: bookedjobs.ie and its subdomains, hosted at 185.158.133.1.
- It is a legitimate business application for gas service companies, not adult or restricted content.
- The site resolves and serves correctly worldwide; only their mobile network fails.

Blacknight is the DNS provider for bookedjobs.ie and can confirm no zone-level issue if the carrier pushes back.

## Step 4 — Reduce future exposure (optional, after the outage)

Once service is restored, worth considering:

- Adding an always-available fallback address for staff (the lovable.app address already serves this purpose — worth documenting internally).
- Checking the domain against common blocklists so a future classification problem is spotted before customers hit it.

## Technical notes

- DNS: A record for both subdomains resolves to 185.158.133.1 on ns1-ns4.blacknightdns.com and via 1.1.1.1, 8.8.8.8, 9.9.9.9 and OpenDNS. Verification TXT record present and correct. TTL 3600.
- TLS: leaf issued to each subdomain, chained through Google Trust Services WE1 to GTS Root R4; OpenSSL verify code 0. TLS 1.2 and 1.3 both negotiate; HTTP/2 200 responses.
- Edge: served through Cloudflare, HSTS with includeSubDomains, same deployment id on both custom domains.
- No AAAA records exist for either subdomain, so this is not an IPv6-only-path failure.
- No application, database, or Edge Function changes are proposed. Nothing in this plan touches code.
