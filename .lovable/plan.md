# Urgent: bookedjobs.ie unreachable on mobile data — IPv6 investigation

## Your theory is confirmed by the evidence

I re-tested along the IPv6 line and it holds up. Carrier filtering is out; the missing IPv6 address is the cause.

What I verified just now:

- kngasservices.bookedjobs.ie and dublin-gas.bookedjobs.ie publish an IPv4 address only (185.158.133.1). Neither has an IPv6 address.
- karlsgas.lovable.app publishes both IPv4 and IPv6 (2a07:8240::1 and ::2). That is the one difference between the address that works on mobile data and the two that fail.
- The hosting edge already serves both customer domains correctly over IPv6. I forced a request to the IPv6 edge with each custom hostname and got the real app back — page title "BookedJobs — Boiler Service Management", HTTP 200, and the correct certificate for each domain, valid to 24 Oct 2026. Both IPv6 edge addresses answered.

So the servers already support IPv6 for these domains; only the DNS entries are missing. On an IPv6-only mobile network whose IPv4 translation is unreliable, that produces exactly the reported symptom: silent timeout on mobile data across unrelated carriers and countries, fine on dual-stack Wi-Fi.

## The fix: publish IPv6 addresses for both domains

Two routes. I recommend trying route A first because it is Lovable's supported mechanism.

### Route A — switch the domains to proxy/CNAME mode (recommended)

In Project Settings → Domains, reconnect each domain with the Advanced option that switches from A-record setup to CNAME-based setup. A CNAME follows the hosting edge's own dual-stack record, so IPv6 arrives automatically and stays correct if the edge addresses ever change.

Do kngasservices.bookedjobs.ie first, confirm mobile data works, then repeat for dublin-gas.bookedjobs.ie. Records are edited at Blacknight, the DNS provider for bookedjobs.ie.

### Route B — add AAAA records directly (fast, needs monitoring)

At Blacknight, add to each subdomain, alongside the existing A record:

```text
Type: AAAA   Name: kngasservices   Value: 2a07:8240::1
Type: AAAA   Name: kngasservices   Value: 2a07:8240::2
Type: AAAA   Name: dublin-gas      Value: 2a07:8240::1
Type: AAAA   Name: dublin-gas      Value: 2a07:8240::2
```

These are the addresses the hosting edge answers on today, and I confirmed both serve the customer domains correctly. The trade-off: they are not part of the published setup instructions, so if the edge ever renumbers, mobile access breaks again. If we take this route, we should confirm the addresses with Lovable support and re-check them periodically.

Existing A records stay in place either way, so nothing changes for IPv4 visitors.

## While the change propagates

- karlsgas.lovable.app is dual-stack and works on mobile data now — usable by staff immediately.
- Wi-Fi keeps working on the branded addresses.

## Verification after the DNS change

1. Confirm both domains return an IPv6 address from several public DNS services.
2. Confirm the site loads over IPv6 with the correct certificate on both domains.
3. Test on both previously failing mobile networks with Wi-Fi off.
4. Re-check IPv4 still works, and confirm the domains still show as connected.

Allow up to an hour for the change to spread, as the records carry a one-hour lifetime.

## Technical notes

- Evidence for the edge already supporting these hostnames over IPv6: forced requests to `[2a07:8240::1]` and `[2a07:8240::2]` with SNI/Host set to each custom domain returned HTTP 200 and the app HTML; the presented leaf certificate matched each hostname exactly.
- Reverse lookup of 185.158.133.1 gives lovable-app-cd-1-4.p.l5e.io, the custom-domain edge; lovable.app itself resolves to 185.41.148.1/.2 plus 2a07:8240::1/::2.
- DNS is authoritative on ns1-ns4.blacknightdns.com; the verification TXT record is present and correct; delegation is intact.
- No application, database, or Edge Function change is involved. This is a DNS-only fix.
