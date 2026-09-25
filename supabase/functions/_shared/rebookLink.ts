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

/** Build the pre-filled renewal/rebooking Tally URL for a customer. */
export function buildRebookTallyUrl(
  baseUrl: string,
  customer: RebookCustomer,
): string {
  const q = new URLSearchParams({
    Customer: customer.name ?? "",
    Mobile: customer.phone ?? "",
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
