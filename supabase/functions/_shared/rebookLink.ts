/**
 * Rebooking-link helpers.
 *
 * Mirrors the URL shape already produced by renewal-reminder-14 / -30 so a
 * customer opening a missed-call rebooking link sees the same pre-filled Tally
 * form (hidden fields: Customer, Mobile, Address, Eircode, Areacode,
 * Boiler_Brand, Boiler_model).
 */

export type RebookCustomer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  eircode?: string | null;
  area_code?: string | null;
  boiler_brand?: string | null;
  boiler_model?: string | null;
};

/** Local Irish format (0871234567) used by the Tally `Mobile` hidden field. */
export function toLocalIrishPhone(raw: unknown, countryCode = "353"): string {
  if (!raw || typeof raw !== "string") return "";
  let digits = raw.replace(/\D/g, "");
  const ccLen = countryCode.length;
  if (countryCode && digits.startsWith(countryCode) && digits.length === 9 + ccLen) {
    // already full international
  } else if (digits.startsWith("0") && digits.length === 10) {
    digits = countryCode + digits.slice(1);
  } else if (digits.length === 9) {
    digits = countryCode + digits;
  }
  const local = digits.slice(ccLen);
  return local ? "0" + local : "";
}

/** Build the pre-filled renewal/rebooking Tally URL for a customer. */
export function buildRebookTallyUrl(
  baseUrl: string,
  customer: RebookCustomer,
  countryCode = "353",
): string {
  const q = new URLSearchParams({
    Customer: customer.name ?? "",
    Mobile: toLocalIrishPhone(customer.phone, countryCode),
    Address: customer.address ?? "",
    Eircode: customer.eircode ?? "",
    Areacode: customer.area_code ?? "",
    Boiler_Brand: customer.boiler_brand ?? "",
    Boiler_model: customer.boiler_model ?? "",
  });
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${q.toString()}`;
}

/**
 * Mint a short link via create-booking-link (service-role auth, same as the
 * renewal reminders). Falls back to the full URL if minting fails so the
 * caller always gets something usable.
 */
export async function mintShortLink(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  organisation_id: string;
  customer_id?: string | null;
  full_url: string;
}): Promise<string> {
  try {
    const res = await fetch(`${params.supabaseUrl}/functions/v1/create-booking-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.serviceRoleKey}`,
      },
      body: JSON.stringify({
        customer_id: params.customer_id ?? null,
        full_url: params.full_url,
        organisation_id: params.organisation_id,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.short_url) return String(json.short_url);
  } catch (_e) { /* fall through */ }
  return params.full_url;
}
