import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getUserOrg } from "../_shared/orgAuth.ts";
import { resolveCaller } from "../_shared/machineAuth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { recipient_user_id, title, body, job_id } = await req.json();

    if (!recipient_user_id) {
      return new Response(JSON.stringify({ error: "recipient_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Authorization -----------------------------------------------------
    // recipient_user_id is NOT authorization. Authenticate the caller, derive
    // their organisation server-side, and prove the target belongs to it.
    const caller = await resolveCaller(req);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = await getUserOrg(recipient_user_id);
    if (!target.orgId) {
      console.warn("send-push-notification: target user has no organisation");
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (caller.kind === "user") {
      const callerOrg = await getUserOrg(caller.userId);
      if (!callerOrg.orgId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (callerOrg.orgId !== target.orgId && callerOrg.role !== "superadmin") {
        console.warn(
          `send-push-notification: cross-tenant push blocked (caller org ${callerOrg.orgId} -> target org ${target.orgId})`,
        );
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Look up the engineer's FCM token, scoped to the target's organisation.
    const { data: engineer } = await supabase
      .from("engineers")
      .select("fcm_token, name")
      .eq("auth_user_id", recipient_user_id)
      .eq("organisation_id", target.orgId)
      .maybeSingle();

    if (!engineer?.fcm_token) {
      return new Response(JSON.stringify({ skipped: true, reason: "No FCM token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get OAuth2 access token from service account
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      return new Response(JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(sa);

    // Send push via FCM v1 API
    const projectId = sa.project_id;
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: engineer.fcm_token,
            notification: {
              title: title || "New Message",
              body: body || "You have a new message from the office",
            },
            data: {
              job_id: job_id || "",
              click_action: "OPEN_JOB",
            },
            webpush: {
              fcm_options: {
                link: job_id ? `/engineer/job/${job_id}` : "/engineer",
              },
            },
          },
        }),
      }
    );

    const fcmResult = await fcmRes.text();

    // Log result
    await supabase.from("edge_function_logs").insert({
      function_name: "send-push-notification",
      error_message: fcmRes.ok ? "success" : fcmResult,
      payload: { recipient_user_id, fcm_status: fcmRes.status, engineer_name: engineer.name },
    });

    return new Response(JSON.stringify({ success: fcmRes.ok, detail: fcmResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Generate OAuth2 access token from a Google service account JSON */
function base64url(input: string | Uint8Array): string {
  const str = typeof input === "string" ? btoa(input) : btoa(String.fromCharCode(...input));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const unsignedToken = `${header}.${payload}`;

  // Import the private key
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signedToken = `${unsignedToken}.${base64url(new Uint8Array(signature))}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`OAuth2 failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}
