import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BRANDING_PRECEDENCE,
  BrandingScopeError,
  LEGACY_NAME_DEFAULT,
  resolveOrgBranding,
  toLegacyBranding,
} from "./orgBranding.ts";

// Representative tenant fixtures. Values are illustrative, not credentials.
const KN_ORG = "8c37827f-ce2c-4507-a821-a5e807d89856";
const DG_ORG = "f1950683-e8b9-41cf-8972-2aa59516850d";

const knInput = {
  organisationId: KN_ORG,
  settings: {
    business_name: "K&N Gas Services",
    company_name: "K & N Gas",
    business_phone: "0871234567",
    company_phone: "0119999999",
    business_address: "1 Sample Street, Dublin",
    message_footer: "K&N Gas Services",
  },
  integrations: [
    {
      integration_type: "360messenger",
      config: { company_name: "KN Messenger Name", company_phone: "0860000000" },
    },
  ],
  organisation: { name: "K&N Gas Services Ltd", address: "Registered address" },
};

const dgInput = {
  organisationId: DG_ORG,
  settings: {
    business_name: "Dublin Gas",
    business_phone: "015550000",
    business_address: "2 Example Road, Dublin",
    message_footer: "Dublin Gas — Registered Gas Installers",
  },
  integrations: [],
  organisation: { name: "Dublin Gas Services", address: null },
};

Deno.test("K&N: resolves canonical fields from settings.business_*", () => {
  const b = resolveOrgBranding(knInput);
  assertEquals(b.organisationId, KN_ORG);
  assertEquals(b.org_name, "K&N Gas Services");
  assertEquals(b.org_phone, "0871234567");
  assertEquals(b.org_address, "1 Sample Street, Dublin");
  assertEquals(b.footer, "K&N Gas Services");
  assertEquals(b.missing, []);
  assertEquals(b.sources.org_name, "settings.business_name");
  assertEquals(b.sources.org_phone, "settings.business_phone");
});

Deno.test("Dublin Gas: resolves its own values, never K&N's", () => {
  const b = resolveOrgBranding(dgInput);
  assertEquals(b.organisationId, DG_ORG);
  assertEquals(b.org_name, "Dublin Gas");
  assertEquals(b.org_phone, "015550000");
  assertEquals(b.footer, "Dublin Gas — Registered Gas Installers");
});

Deno.test("tenant isolation: tenant A never receives tenant B branding", () => {
  // Same resolver call, only the tenant's own rows supplied. There is no code
  // path that can widen the query, so the assertion is that an empty tenant
  // stays empty rather than inheriting the other tenant's values.
  const kn = resolveOrgBranding(knInput);
  const empty = resolveOrgBranding({
    organisationId: DG_ORG,
    settings: null,
    integrations: [],
    organisation: null,
  });
  assertEquals(empty.org_name, "");
  assertEquals(empty.org_phone, "");
  assertEquals(empty.org_address, "");
  assertEquals(empty.footer, "");
  assertEquals(empty.missing, ["org_name", "org_address", "org_phone", "footer"]);
  assertEquals(kn.org_name === empty.org_name, false);
});

Deno.test("missing organisation_id throws instead of resolving anything", () => {
  assertThrows(
    () => resolveOrgBranding({ organisationId: "", settings: knInput.settings }),
    BrandingScopeError,
  );
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => resolveOrgBranding({ organisationId: undefined as any, settings: knInput.settings }),
    BrandingScopeError,
  );
});

Deno.test("unknown organisation_id degrades explicitly, no fallback tenant", () => {
  const b = resolveOrgBranding({
    organisationId: "00000000-0000-0000-0000-000000000000",
    settings: null,
    integrations: [],
    organisation: null,
  });
  assertEquals(b.org_name, "");
  assertEquals(b.missing.includes("org_name"), true);
});

Deno.test("missing individual branding fields are reported, not invented", () => {
  const b = resolveOrgBranding({
    organisationId: DG_ORG,
    settings: { business_name: "Dublin Gas" },
    integrations: [],
  });
  assertEquals(b.org_name, "Dublin Gas");
  assertEquals(b.org_phone, "");
  assertEquals(b.org_address, "");
  assertEquals(b.footer, "Dublin Gas"); // footer precedence falls back to org_name
  assertEquals(b.missing, ["org_address", "org_phone"]);
});

Deno.test("conflicting legacy fields: settings.business_* wins over company_*", () => {
  const b = resolveOrgBranding({
    organisationId: KN_ORG,
    settings: {
      business_name: "Business Name",
      company_name: "Company Name",
      business_phone: "111",
      company_phone: "222",
    },
    integrations: [
      { integration_type: "360messenger", config: { company_name: "Messenger", company_phone: "333" } },
    ],
  });
  assertEquals(b.org_name, "Business Name");
  assertEquals(b.org_phone, "111");
});

Deno.test("phone precedence: company_phone then messenger then make", () => {
  const only = (settings: Record<string, unknown>, integrations: unknown[] = []) =>
    resolveOrgBranding({
      organisationId: KN_ORG,
      // deno-lint-ignore no-explicit-any
      settings: settings as any,
      // deno-lint-ignore no-explicit-any
      integrations: integrations as any,
    });

  assertEquals(only({ company_phone: "222" }).org_phone, "222");
  assertEquals(only({ company_phone: "222" }).sources.org_phone, "settings.company_phone");

  const messenger = only({}, [
    { integration_type: "360messenger", config: { company_phone: "333" } },
  ]);
  assertEquals(messenger.org_phone, "333");
  assertEquals(
    messenger.sources.org_phone,
    "tenant_integrations.360messenger.config.company_phone",
  );

  const make = only({}, [{ integration_type: "make", config: { company_phone: "444" } }]);
  assertEquals(make.org_phone, "444");
  assertEquals(make.sources.org_phone, "tenant_integrations.make.config.company_phone");
});

Deno.test("address precedence: settings.business_address then organisations.address", () => {
  assertEquals(
    resolveOrgBranding({
      organisationId: KN_ORG,
      settings: { business_address: "Settings address" },
      organisation: { address: "Org address" },
    }).org_address,
    "Settings address",
  );
  assertEquals(
    resolveOrgBranding({
      organisationId: KN_ORG,
      settings: {},
      organisation: { address: "Org address" },
    }).sources.org_address,
    "organisations.address",
  );
});

Deno.test("no user_id path exists: a user_id-shaped input is ignored", () => {
  const b = resolveOrgBranding({
    organisationId: DG_ORG,
    // deno-lint-ignore no-explicit-any
    settings: { user_id: "some-user", business_name: "Dublin Gas" } as any,
    integrations: [],
  });
  assertEquals(b.org_name, "Dublin Gas");
  // The resolver's own precedence list never mentions user_id.
  const allCandidates = Object.values(BRANDING_PRECEDENCE).flat().join(" ");
  assertEquals(allCandidates.includes("user_id"), false);
});

Deno.test("resolver never emits the literal 'undefined' / 'null' / 'NaN'", () => {
  const b = resolveOrgBranding({
    organisationId: KN_ORG,
    // deno-lint-ignore no-explicit-any
    settings: {
      business_name: "undefined",
      company_name: "null",
      business_phone: "NaN",
      company_phone: "  ",
      message_footer: "undefined",
    } as any,
    integrations: [],
  });
  assertEquals(b.org_name, "");
  assertEquals(b.org_phone, "");
  assertEquals(b.footer, "");
  assertEquals(b.missing.includes("org_name"), true);
});

Deno.test("legacy shim keeps pre-Phase-2 output (settings-only, 'our team' default)", () => {
  const legacyKn = toLegacyBranding(resolveOrgBranding(knInput));
  assertEquals(legacyKn, {
    name: "K&N Gas Services",
    phone: "0871234567",
    footer: "K&N Gas Services",
  });

  // Values that only exist on tenant_integrations must NOT leak into the legacy
  // shape — the old helper read `settings` only, so widening it here would be a
  // silent copy change.
  const messengerOnly = toLegacyBranding(
    resolveOrgBranding({
      organisationId: DG_ORG,
      settings: {},
      integrations: [
        { integration_type: "360messenger", config: { company_name: "Messenger", company_phone: "333" } },
      ],
      organisation: { name: "Dublin Gas Services" },
    }),
  );
  assertEquals(messengerOnly.name, LEGACY_NAME_DEFAULT);
  assertEquals(messengerOnly.phone, "");
});
