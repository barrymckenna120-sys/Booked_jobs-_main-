import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { engineer_id, email, name, role } = await req.json();
    console.log("Request body:", { engineer_id, email, name, role });
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
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller has admin or office role (not engineer)
    const { data: callerRole } = await supabaseUser.rpc('get_user_role', { _user_id: caller.id });
    if (callerRole === 'engineer') {
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

    // Check if user already exists with this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let authUserId: string;

    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      // Generate a cryptographically random password
      const randomBytes = new Uint8Array(24);
      crypto.getRandomValues(randomBytes);
      const randomPassword = btoa(String.fromCharCode(...randomBytes)) + "!1Aa";

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { display_name: name, role },
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
      });
      if (resetError) {
        console.error("Password reset link generation failed:", resetError);
      }

      // Send the welcome email via Resend with the action link
      const actionLink = linkData?.properties?.action_link || `https://kngasservices.bookedjobs.ie`;
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
              from: `BookedJobs <noreply@notify.kngasservices.bookedjobs.ie>`,
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
          const resData = await res.json();
          if (!res.ok) {
            console.error("Resend welcome email failed:", resData);
          } else {
            console.log("Welcome email sent:", resData.id);
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

    // Link the auth user to the engineer record
    const { error: updateError } = await supabaseAdmin
      .from("engineers")
      .update({ auth_user_id: authUserId, email })
      .eq("id", engineer_id);

    if (updateError) {
      console.error("Engineer update failed:", updateError);
      return new Response(JSON.stringify({ error: "Failed to link user account." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId, existing: !!existingUser }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("invite-team-member error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
