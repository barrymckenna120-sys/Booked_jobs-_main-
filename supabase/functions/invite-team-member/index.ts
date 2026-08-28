import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  console.log("invite-team-member called", req.method);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { engineer_id, email, name, role, organisation_id } = await req.json();
    console.log("Request body:", { engineer_id, email, name, role, organisation_id });
    if (!engineer_id || !email) {
      return new Response(JSON.stringify({ error: "engineer_id and email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is an admin/office user
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: getUserError } = await supabaseUser.auth.getUser();
    console.log("getUser result:", JSON.stringify({ user: caller?.id, error: getUserError }));
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller has sufficient permissions.
    // Check both get_user_role RPC AND profiles.role — get_user_role falls back
    // to 'engineer' for users without an engineer record (e.g. superadmins,
    // owner_managers), so profiles is the source of truth for non-engineer staff.
    const supabaseAdminCheck = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const [{ data: rpcRole }, { data: callerProfile }] = await Promise.all([
      supabaseUser.rpc('get_user_role', { _user_id: caller.id }),
      supabaseAdminCheck.from("profiles").select("role").eq("user_id", caller.id).maybeSingle(),
    ]);
    const profileRole = (callerProfile as any)?.role || null;
    const allowedRoles = ['admin', 'office', 'owner', 'owner_manager', 'superadmin'];
    const isAllowed = allowedRoles.includes(rpcRole as string) || allowedRoles.includes(profileRole);
    const callerRole = profileRole || (rpcRole as string) || null;
    console.log("role check result:", JSON.stringify({ rpcRole, profileRole, isAllowed }));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to create auth user via invite
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve tenant domain from tenant_integrations (whatsapp.config.domain).
    // Tenant ownership: the organisation ALWAYS comes from the caller's own
    // profile. A body-supplied organisation_id is ignored unless the caller is a
    // superadmin, so an admin of tenant A can never invite into tenant B.
    const { data: callerProfileOrg } = await supabaseAdmin
      .from("profiles")
      .select("organisation_id")
      .eq("user_id", caller.id)
      .maybeSingle();
    const callerOrgId = (callerProfileOrg as any)?.organisation_id || null;
    const isSuperadmin = rpcRole === "superadmin" || profileRole === "superadmin";

    // Explicit rejection (not a silent downgrade): a tenant admin naming another
    // organisation is an authorisation error, not a body field to discard.
    // Tenant roles keep full access inside their OWN organisation.
    if (organisation_id && callerOrgId && organisation_id !== callerOrgId && !isSuperadmin) {
      console.warn(
        `invite-team-member: cross-tenant organisation_id ${organisation_id} from caller ${caller.id} (org ${callerOrgId})`,
      );
      return new Response(JSON.stringify({ error: "Forbidden: cross-organisation invite" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const resolvedOrgId: string | null = isSuperadmin
      ? (organisation_id || callerOrgId)
      : callerOrgId;

    if (!resolvedOrgId) {
      console.warn("invite-team-member: could not resolve organisation_id for caller");
      return new Response(JSON.stringify({ error: "organisation_id not resolvable for this caller" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: waIntegration } = await supabaseAdmin
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", resolvedOrgId)
      .eq("integration_type", "whatsapp")
      .maybeSingle();

    const tenantDomain = (waIntegration as any)?.config?.domain;
    if (!tenantDomain) {
      console.warn(`invite-team-member: missing whatsapp.config.domain for org ${resolvedOrgId}`);
      return new Response(JSON.stringify({ error: "Tenant domain not configured for this organisation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantBaseUrl = `https://${tenantDomain}`;
    const tenantAuthRedirect = `${tenantBaseUrl}/auth`;


    // Check if user already exists with this email
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    console.log("listUsers result:", JSON.stringify({ count: existingUsers?.users?.length, error: listError }));
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let authUserId: string;

    if (existingUser) {
      console.log("Existing user found:", existingUser.id);
      authUserId = existingUser.id;

      // Generate a password reset link for existing user
      const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: tenantAuthRedirect },

      });
      console.log("generateLink result (existing):", JSON.stringify({ data: linkData, error: resetError }));
      if (resetError) {
        console.error("Password reset link generation failed (existing):", resetError);
      }

      // Send welcome/invite email to existing user via Resend
      const actionLink = linkData?.properties?.action_link || tenantBaseUrl;

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        try {
          const roleLabel = role === "admin" ? "Admin" : role === "office" ? "Office" : "Engineer";
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: `BookedJobs <noreply@bookedjobs.ie>`,
              to: [email],
              subject: `Welcome to BookedJobs — You're in, ${(name || "").split(" ")[0]}!`,
              html: `<!DOCTYPE html><html><body style="font-family:'DM Sans',Arial,sans-serif;background:#F0F4FF;padding:40px 16px;">
<div style="max-width:560px;margin:0 auto;">
<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,0.08);">
<div style="height:5px;background:linear-gradient(90deg,#2563EB,#60a5fa);"></div>
<div style="padding:44px 48px 40px;">
<h1 style="font-size:26px;font-weight:700;color:#0f172a;margin-bottom:12px;">Welcome to BookedJobs! 👋</h1>
<p style="font-size:15px;color:#4b5563;line-height:1.65;margin-bottom:28px;">Your account has been set up and you're ready to go. Click the button below to set your password and log in.</p>
<div style="background:#F8FAFF;border:1px solid #dbeafe;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e8f0fe;font-size:14px;"><span style="color:#6b7280;font-weight:500;">Email</span><span style="color:#0f172a;font-weight:600;">${email}</span></div>
<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;"><span style="color:#6b7280;font-weight:500;">Role</span><span style="color:#0f172a;font-weight:600;">${roleLabel}</span></div>
</div>
<a href="${actionLink}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:15px 36px;border-radius:12px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">Set Password & Log In</a>
</div></div>
<div style="text-align:center;margin-top:28px;padding-bottom:8px;"><p style="font-size:12.5px;color:#9ca3af;">© 2026 BookedJobs · Karl's Gas</p></div>
</div></body></html>`,
            }),
          });
          console.log("Resend response status (existing):", res.status);
          const resBody = await res.text();
          console.log("Resend response body (existing):", resBody);
        } catch (emailErr) {
          console.error("Welcome email send error (existing):", emailErr);
        }
      } else {
        console.warn("RESEND_API_KEY not set, skipping welcome email (existing)");
      }
    } else {
      console.log("No existing user, creating new auth user");
      // Generate a cryptographically random password
      const randomBytes = new Uint8Array(24);
      crypto.getRandomValues(randomBytes);
      const randomPassword = btoa(String.fromCharCode(...randomBytes)) + "!1Aa";

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { display_name: name, role, organisation_id: resolvedOrgId },
      });

      if (createError) {
        console.error("User creation failed:", createError);
        return new Response(JSON.stringify({ error: "Failed to create user account." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      authUserId = created.user.id;

      // Generate a password reset link so user sets their own password
      const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: tenantAuthRedirect },
      });
      console.log("generateLink response:", JSON.stringify({ data: linkData, error: resetError }));
      if (resetError) {
        console.error("Password reset link generation failed:", resetError);
      }

      // Send the welcome email via Resend with the action link
      const actionLink = linkData?.properties?.action_link || tenantBaseUrl;
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        try {
          const roleLabel = role === "admin" ? "Admin" : role === "office" ? "Office" : "Engineer";
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: `BookedJobs <noreply@bookedjobs.ie>`,
              to: [email],
              subject: `Welcome to BookedJobs — You're in, ${(name || "").split(" ")[0]}!`,
              html: `<!DOCTYPE html><html><body style="font-family:'DM Sans',Arial,sans-serif;background:#F0F4FF;padding:40px 16px;">
<div style="max-width:560px;margin:0 auto;">
<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,0.08);">
<div style="height:5px;background:linear-gradient(90deg,#2563EB,#60a5fa);"></div>
<div style="padding:44px 48px 40px;">
<h1 style="font-size:26px;font-weight:700;color:#0f172a;margin-bottom:12px;">Welcome to BookedJobs! 👋</h1>
<p style="font-size:15px;color:#4b5563;line-height:1.65;margin-bottom:28px;">Your account has been set up and you're ready to go. Click the button below to set your password and log in.</p>
<div style="background:#F8FAFF;border:1px solid #dbeafe;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e8f0fe;font-size:14px;"><span style="color:#6b7280;font-weight:500;">Email</span><span style="color:#0f172a;font-weight:600;">${email}</span></div>
<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;"><span style="color:#6b7280;font-weight:500;">Role</span><span style="color:#0f172a;font-weight:600;">${roleLabel}</span></div>
</div>
<a href="${actionLink}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:15px 36px;border-radius:12px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">Set Password & Log In</a>
</div></div>
<div style="text-align:center;margin-top:28px;padding-bottom:8px;"><p style="font-size:12.5px;color:#9ca3af;">© 2026 BookedJobs · Karl's Gas</p></div>
</div></body></html>`,
            }),
          });
          console.log("Resend response status:", res.status);
          const resBody = await res.text();
          console.log("Resend response body:", resBody);
          if (!res.ok) {
            console.error("Resend welcome email failed:", resBody);
          } else {
            try {
              const resData = JSON.parse(resBody);
              console.log("Welcome email sent:", resData.id);
            } catch (_) {
              console.log("Welcome email sent (non-JSON response)");
            }
          }
        } catch (emailErr) {
          console.error("Welcome email send error:", emailErr);
        }
      } else {
        console.warn("RESEND_API_KEY not set, skipping welcome email");
      }
    }

    // Clear any existing engineer linked to this auth user (unique constraint)
    const { error: clearError } = await supabaseAdmin
      .from("engineers")
      .update({ auth_user_id: null })
      .eq("auth_user_id", authUserId)
      .neq("id", engineer_id);

    if (clearError) {
      console.error("Failed to clear old auth link:", clearError);
    }

    // Link the auth user to the engineer record — scoped to the caller's tenant
    // so an engineer row in another organisation can never be claimed.
    const { data: linkedEngineer, error: updateError } = await supabaseAdmin
      .from("engineers")
      .update({ auth_user_id: authUserId, user_id: authUserId, email: email })
      .eq("id", engineer_id)
      .eq("organisation_id", resolvedOrgId)
      .select("id")
      .maybeSingle();

    if (!updateError && !linkedEngineer) {
      console.warn(
        `invite-team-member: engineer ${engineer_id} is not in org ${resolvedOrgId} — refusing to link`,
      );
      return new Response(JSON.stringify({ error: "Engineer not found for this organisation." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (updateError) {
      console.error("Engineer update failed:", updateError);
      return new Response(JSON.stringify({ error: "Failed to link user account." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log to audit_log
    const callerName = caller.user_metadata?.display_name || caller.email || "Admin";
    await supabaseAdmin.from("audit_log").insert({
      user_id: caller.id,
      user_name: callerName,
      user_role: callerRole || "admin",
      action_type: "team_member_invited",
      entity_type: "engineer",
      entity_id: engineer_id,
      detail: `Invited ${name || email} (${role}) to the team`,
      metadata: { email, role, existing_user: !!existingUser },
    });

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId, existing: !!existingUser }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Caught error:", err?.message, JSON.stringify(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
