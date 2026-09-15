import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isPlatformAdminDenied, requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import {
  DEFAULT_BRAND_SETTINGS,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  defaultPaymentPlaceholder,
  derivePrefix,
  generateWebhookSecret,
  generateWebhookSecret,
  TENANT_CONFIG_VERSION,
} from "../_shared/tenantDefaults.ts";

Deno.serve(async (req) => {
  // CORS: project-standard shared helper (origin-scoped), per request.
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "method_not_allowed" },
      405
    );
  }

  const SUPABASE_URL =
    Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    )!;

  // Authorisation: creating a whole new tenant is a platform-wide operation,
  // so it goes through the shared platform-admin helper (profiles.role =
  // 'superadmin', or the single central PLATFORM_OWNER_EMAILS override).
  // No tenant role — owner/admin/manager/office — may provision tenants, and
  // no per-function email allowlist exists here.
  const platformAdmin = await requirePlatformAdmin(req, {
    fnName: "provision-tenant",
    cors: corsHeaders,
  });
  if (isPlatformAdminDenied(platformAdmin)) return platformAdmin.error;

  const supabase = createClient(
    SUPABASE_URL,
    SERVICE_ROLE
  );

  let body: any;

  try {
    body = await req.json();
  } catch (_e) {
    return json(
      { error: "invalid_json" },
      400
    );
  }

  const {
    company_name,
    company_phone,
    owner_name,
    owner_email,
    org_slug,
    business_address,
    business_email,
    rgi_number,
    job_reference_prefix,
    waba_id,
    api_key_secret,
    country_code,
  } = body ?? {};

  // A new tenant must NEVER inherit the shared/K&N WhatsApp key. When no
  // per-tenant secret name is supplied we seed the integration without one, so
  // WhatsApp sends fail closed until the tenant's own secret is configured.
  const resolvedApiKeySecret =
    typeof api_key_secret ===
      "string" &&
    api_key_secret.trim()
      ? api_key_secret.trim()
      : null;

  const resolvedCountryCode =
    typeof country_code ===
      "string" &&
    country_code.trim()
      ? country_code.trim()
      : "353";

  // Step 1: validate
  const required = {
    company_name,
    company_phone,
    owner_name,
    owner_email,
    org_slug,
    job_reference_prefix,
  };

  for (const [
    field,
    value,
  ] of Object.entries(required)) {
    if (
      !value ||
      typeof value !== "string" ||
      !value.trim()
    ) {
      return json(
        {
          error: "missing_field",
          field,
        },
        400
      );
    }
  }

  if (
    !/^[A-Z0-9]{2,6}$/.test(
      job_reference_prefix.trim()
    )
  ) {
    return json(
      {
        error:
          "invalid_job_reference_prefix",
        detail:
          "job_reference_prefix must be 2–6 characters, uppercase letters or digits only",
      },
      400
    );
  }

  // Hard superadmin protection: block provisioning if owner_email belongs
  // to any superadmin account.
  const normalizedOwnerEmail =
    String(owner_email)
      .trim()
      .toLowerCase();

  {
    const {
      data: superadminRows,
      error: superadminErr,
    } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("role", "superadmin");

    if (superadminErr) {
      return json(
        {
          error:
            "provision_failed",
          step:
            "0-superadmin-check",
          detail:
            superadminErr.message,
        },
        500
      );
    }

    const superadminIds =
      new Set(
        (
          superadminRows ??
          []
        ).map(
          (r: any) =>
            r.user_id
        )
      );

    if (superadminIds.size > 0) {
      // Page through auth users to find any superadmin matching the owner_email
      for (
        let page = 1;
        page <= 20;
        page++
      ) {
        const {
          data: listPage,
          error: listErr,
        } =
          await supabase.auth.admin.listUsers(
            {
              page,
              perPage: 200,
            }
          );

        if (listErr) {
          return json(
            {
              error:
                "provision_failed",
              step:
                "0-superadmin-check",
              detail:
                listErr.message,
            },
            500
          );
        }

        const users =
          listPage?.users ?? [];

        for (const u of users) {
          if (
            superadminIds.has(
              u.id
            ) &&
            (u.email ?? "")
              .trim()
              .toLowerCase() ===
              normalizedOwnerEmail
          ) {
            return json(
              {
                error:
                  "This email belongs to a superadmin account and cannot be used for tenant provisioning.",
              },
              400
            );
          }
        }

        if (users.length < 200)
          break;
      }
    }
  }

  const addressPart = (
    business_address ?? ""
  )
    .toString()
    .trim();

  const message_footer = [
    company_name,
    addressPart,
    company_phone,
  ]
    .filter(
      (v) =>
        v &&
        String(v).trim()
    )
    .join(" | ");

  const logFailure = async (
    step: string,
    error: string
  ) => {
    try {
      await supabase
        .from(
          "edge_function_logs"
        )
        .insert({
          function_name:
            "provision-tenant",
          error_message:
            `${step}: ${error}`,
          payload: {
            org_slug,
            owner_email,
          } as any,
        });
    } catch (_e) {
      // best effort
    }
  };

  // Step 2: slug uniqueness — auto-suffix if taken
  let finalSlug = org_slug;

  for (
    let i = 0;
    i < 50;
    i++
  ) {
    const candidate =
      i === 0
        ? org_slug
        : `${org_slug}-${i + 1}`;

    const {
      data: existing,
      error: slugErr,
    } = await supabase
      .from("organisations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (slugErr) {
      await logFailure(
        "step 2",
        slugErr.message
      );

      return json(
        {
          error:
            "provision_failed",
          step: "2",
          detail:
            slugErr.message,
        },
        500
      );
    }

    if (!existing) {
      finalSlug = candidate;
      break;
    }

    if (i === 49) {
      return json(
        {
          error: "slug_taken",
        },
        409
      );
    }
  }

  // Step 3: insert organisation.
  // The public web address is deliberately left BLANK at provisioning time.
  // BookedJobs has no wildcard DNS for <slug>.bookedjobs.ie, so deriving one
  // here produced customer-facing links on a hostname that does not resolve.
  // Public links therefore fall back to the platform's own working app host
  // (see _shared/platformPublicUrl.ts) until a real tenant domain is connected
  // and verified, at which point it can be stored in public_domain.
  const resolvedDomain: string | null = null;


  const {
    data: org,
    error: orgErr,
  } = await supabase
    .from("organisations")
    .insert({
      name: company_name,
      slug: finalSlug,
      subscription_status: "trial",
      owner_name,
      owner_phone: company_phone,
      industry: "gas_heating",
      job_reference_prefix:
        job_reference_prefix.trim(),
      public_domain:
        resolvedDomain,
      company_phone,
      company_email:
        (business_email ?? "")
          .toString()
          .trim() || null,
      address:
        addressPart || null,
    })
    .select("id")
    .single();

  if (orgErr || !org) {
    const msg =
      orgErr?.message ??
      "insert returned no row";

    await logFailure(
      "step 3",
      msg
    );

    return json(
      {
        error:
          "provision_failed",
        step: "3",
        detail: msg,
      },
      500
    );
  }

  const newOrgId =
    org.id as string;

  // Step 6 (moved): send invite first to get user_id;
  // reuse if user exists
  let newUserId:
    | string
    | null = null;

  const {
    data: inviteData,
    error: inviteErr,
  } =
    await supabase.auth.admin.inviteUserByEmail(
      owner_email,
      {
        data: {
          organisation_id:
            newOrgId,
          role: "admin",
          full_name:
            owner_name,
        },
      }
    );

  if (inviteErr) {
    const msg =
      inviteErr.message ?? "";

    const alreadyExists =
      /already been registered|already registered|email_exists/i.test(
        msg
      );

    if (!alreadyExists) {
      await logFailure(
        "step 6",
        msg
      );

      return json(
        {
          error:
            "provision_failed",
          step: "6",
          detail: msg,
        },
        500
      );
    }

    // Look up existing user by email
    const {
      data: list,
      error: listErr,
    } =
      await supabase.auth.admin.listUsers(
        {
          page: 1,
          perPage: 200,
        }
      );

    if (listErr) {
      await logFailure(
        "step 6",
        `lookup failed: ${listErr.message}`
      );

      return json(
        {
          error:
            "provision_failed",
          step: "6",
          detail:
            listErr.message,
        },
        500
      );
    }

    const found =
      list?.users?.find(
        (u) =>
          (
            u.email ?? ""
          ).toLowerCase() ===
          String(
            owner_email
          ).toLowerCase()
      );

    if (!found) {
      await logFailure(
        "step 6",
        "user reported existing but not found in list"
      );

      return json(
        {
          error:
            "provision_failed",
          step: "6",
          detail:
            "user_lookup_failed",
        },
        500
      );
    }

    newUserId = found.id;
  } else {
    newUserId =
      inviteData.user.id;
  }

  // Post-resolution superadmin guard: if the resolved user is a superadmin,
  // abort and clean up the org
  {
    const {
      data: saProfile,
      error: saErr,
    } = await supabase
      .from("profiles")
      .select("user_id")
      .eq(
        "user_id",
        newUserId
      )
      .eq("role", "superadmin")
      .maybeSingle();

    if (saErr) {
      await supabase
        .from("organisations")
        .delete()
        .eq("id", newOrgId);

      await logFailure(
        "6-superadmin-guard",
        saErr.message
      );

      return json(
        {
          error:
            "provision_failed",
          step:
            "6-superadmin-guard",
          detail:
            saErr.message,
        },
        500
      );
    }

    if (saProfile) {
      await supabase
        .from("organisations")
        .delete()
        .eq("id", newOrgId);

      return json(
        {
          error:
            "This email belongs to a superadmin account and cannot be used for tenant provisioning.",
        },
        400
      );
    }
  }

  // Guard: prevent hijacking an existing user's profile
  // (e.g. superadmin or cross-org user)
  {
    const {
      data: existingProfile,
      error: existingProfileErr,
    } = await supabase
      .from("profiles")
      .select(
        "user_id, organisation_id, role"
      )
      .eq(
        "user_id",
        newUserId
      )
      .maybeSingle();

    if (existingProfileErr) {
      await logFailure(
        "step 6-guard",
        existingProfileErr.message
      );

      return json(
        {
          error:
            "provision_failed",
          step: "6-guard",
          detail:
            existingProfileErr.message,
        },
        500
      );
    }

    if (existingProfile) {
      if (
        existingProfile.role ===
        "superadmin"
      ) {
        await logFailure(
          "step 6-guard",
          "email belongs to superadmin"
        );

        return json(
          {
            error:
              "This email belongs to a superadmin account and cannot be used for tenant provisioning.",
          },
          400
        );
      }

      if (
        existingProfile.organisation_id &&
        existingProfile.organisation_id !==
          newOrgId
      ) {
        await logFailure(
          "step 6-guard",
          `email belongs to org ${existingProfile.organisation_id}`
        );

        return json(
          {
            error:
              "A user with this email already exists in another organisation. Please use a different email address.",
          },
          400
        );
      }
    }
  }

  // Ensure organisation_id + role are present in raw_app_meta_data (JWT claims)
  const {
    error: appMetaErr,
  } =
    await supabase.auth.admin.updateUserById(
      newUserId,
      {
        app_metadata: {
          organisation_id:
            newOrgId,
          role: "admin",
        },
      }
    );

  if (appMetaErr) {
    await logFailure(
      "step 6b",
      appMetaErr.message
    );

    return json(
      {
        error:
          "provision_failed",
        step: "6b",
        detail:
          appMetaErr.message,
      },
      500
    );
  }

  // Step 6c: create/update profile for tenant owner
  const {
    error: profileErr,
  } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: newUserId,
        organisation_id:
          newOrgId,
        role: "admin",
        display_name:
          owner_name,
      },
      {
        onConflict: "user_id",
      }
    );

  if (profileErr) {
    await logFailure(
      "step 6c",
      profileErr.message
    );

    return json(
      {
        error:
          "Failed to create profile for tenant owner",
      },
      500
    );
  }

  // Step 6d: record the owner ON the organisation.
  // Machine/webhook paths (e.g. tally-incoming-job) resolve the job's owning
  // user from organisations.owner_user_id; without it, incoming bookings fail
  // and never reach the Schedule.
  const {
    error: ownerLinkErr,
  } = await supabase
    .from("organisations")
    .update({
      owner_user_id:
        newUserId,
    })
    .eq("id", newOrgId);

  if (ownerLinkErr) {
    await logFailure(
      "step 6d",
      ownerLinkErr.message
    );

    return json(
      {
        error:
          "provision_failed",
        step: "6d",
        detail:
          ownerLinkErr.message,
      },
      500
    );
  }



  // Step 4: settings upsert — company identity always, product defaults only on
  // first creation so a re-run never overwrites values the tenant has edited.
  const {
    data: existingSettings,
  } = await supabase
    .from("settings")
    .select("id")
    .eq("user_id", newUserId)
    .maybeSingle();

  const identityFields = {
    organisation_id: newOrgId,
    user_id: newUserId,
    company_name,
    company_phone,
    business_name:
      company_name,
    business_phone:
      company_phone,
    business_address:
      addressPart || null,
    business_email:
      (business_email ?? "")
        .toString()
        .trim() || null,
    rgi_number:
      (rgi_number ?? "")
        .toString()
        .trim() || null,
    message_footer,
    owner_name,
    cert_prefix: derivePrefix(
      finalSlug,
      2
    ),
  };

  const settingsPayload =
    existingSettings
      ? identityFields
      : {
        ...identityFields,
        ...DEFAULT_SETTINGS,
        invoice_prefix:
          derivePrefix(
            finalSlug,
            1
          ),
      };

  const {
    error: settingsErr,
  } = await supabase
    .from("settings")
    .upsert(
      settingsPayload,
      {
        onConflict:
          "user_id",
      }
    );

  if (settingsErr) {
    await logFailure(
      "step 4",
      settingsErr.message
    );

    return json(
      {
        error:
          "provision_failed",
        step: "4",
        detail:
          settingsErr.message,
      },
      500
    );
  }

  // Step 5: brand_settings — real product defaults, created once.
  const {
    data: existingBrand,
  } = await supabase
    .from("brand_settings")
    .select("id")
    .eq(
      "organisation_id",
      newOrgId
    )
    .maybeSingle();

  const {
    error: brandErr,
  } = existingBrand
    ? { error: null }
    : await supabase
      .from("brand_settings")
      .insert({
        organisation_id:
          newOrgId,
        ...DEFAULT_BRAND_SETTINGS,
      });

  if (brandErr) {
    await logFailure(
      "step 5",
      brandErr.message
    );

    return json(
      {
        error:
          "provision_failed",
        step: "5",
        detail:
          brandErr.message,
      },
      500
    );
  }

  // Step 5b: engineers row for owner
  // (so IntegrationsTab + role checks resolve org)
  const {
    error: engErr,
  } = await supabase
    .from("engineers")
    .upsert(
      {
        organisation_id:
          newOrgId,
        auth_user_id:
          newUserId,
        name: owner_name,
        email: owner_email,
        phone:
          company_phone,
        role: "admin",
        can_access_office:
          true,
        status: "active",
        is_available: true,
      },
      {
        onConflict:
          "auth_user_id",
      }
    );

  if (engErr) {
    await logFailure(
      "step 5b",
      engErr.message
    );

    return json(
      {
        error:
          "provision_failed",
        step: "5b",
        detail:
          engErr.message,
      },
      500
    );
  }

  // Step 5c: seed tenant_integrations placeholders — one row per type, created
  // only when absent so a re-run never duplicates them. No credential value is
  // ever copied from another tenant: WhatsApp/payment keys stay empty until the
  // tenant's own secret is configured, and the webhook secret is freshly
  // generated for this tenant alone.
  const {
    data: existingIntegrations,
  } = await supabase
    .from("tenant_integrations")
    .select(
      "integration_type"
    )
    .eq(
      "organisation_id",
      newOrgId
    );

  const haveTypes = new Set(
    (
      existingIntegrations ??
      []
    ).map(
      (r: any) =>
        r.integration_type
    )
  );

  const integrationRows = [
    {
      organisation_id:
        newOrgId,
      integration_type:
        "360messenger",
      config: {
        api_key_secret:
          resolvedApiKeySecret,
        company_name,
        company_phone,
        country_code:
          resolvedCountryCode,
        waba_id:
          waba_id ?? null,
      },
    },
    {
      organisation_id:
        newOrgId,
      integration_type:
        "tally",
      config: {
        webhook_secret:
          generateWebhookSecret(),
      },
    },
    {
      organisation_id:
        newOrgId,
      integration_type:
        "sumup",
      config:
        defaultPaymentPlaceholder(),
    },
  ].filter(
    (r) =>
      !haveTypes.has(
        r.integration_type
      )
  );

  if (
    integrationRows.length > 0
  ) {
    const {
      error: tiErr,
    } = await supabase
      .from(
        "tenant_integrations"
      )
      .insert(
        integrationRows
      );

    if (tiErr) {
      await logFailure(
        "step 5c",
        tiErr.message
      );

      return json(
        {
          error:
            "provision_failed",
          step: "5c",
          detail:
            tiErr.message,
        },
        500
      );
    }
  }

  // Step 5d: default job/product categories (names only, no prices).
  const {
    data: existingCategories,
  } = await supabase
    .from("categories")
    .select("name")
    .eq(
      "organisation_id",
      newOrgId
    );

  const haveCategories =
    new Set(
      (
        existingCategories ??
        []
      ).map((r: any) =>
        String(r.name)
          .trim()
          .toLowerCase()
      )
    );

  const categoryRows =
    DEFAULT_CATEGORIES.filter(
      (name) =>
        !haveCategories.has(
          name.toLowerCase()
        )
    ).map((name) => ({
      organisation_id:
        newOrgId,
      name,
    }));

  if (categoryRows.length > 0) {
    const {
      error: catErr,
    } = await supabase
      .from("categories")
      .insert(categoryRows);

    if (catErr) {
      await logFailure(
        "step 5d",
        catErr.message
      );

      return json(
        {
          error:
            "provision_failed",
          step: "5d",
          detail:
            catErr.message,
        },
        500
      );
    }
  }

  // Step 6e: stamp the configuration version. Only newly provisioned tenants
  // reach this line; existing tenants are never backfilled.
  const {
    error: versionErr,
  } = await supabase
    .from("organisations")
    .update({
      tenant_config_version:
        TENANT_CONFIG_VERSION,
    })
    .eq("id", newOrgId);

  if (versionErr) {
    await logFailure(
      "step 6e",
      versionErr.message
    );

    return json(
      {
        error:
          "provision_failed",
        step: "6e",
        detail:
          versionErr.message,
      },
      500
    );
  }

  // Step 7: success
  return json({
    success: true,
    organisation_id:
      newOrgId,
    org_slug: finalSlug,
    invited_email:
      owner_email,
    public_domain:
      resolvedDomain,
    tenant_config_version:
      TENANT_CONFIG_VERSION,
    defaults_applied: {
      settings: !existingSettings,
      branding: !existingBrand,
      categories:
        categoryRows.length,
      integrations:
        integrationRows.map(
          (r) =>
            r.integration_type
        ),
    },
  });
});