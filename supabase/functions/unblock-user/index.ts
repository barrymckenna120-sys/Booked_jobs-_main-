import { createClient } from "npm:@supabase/supabase-js@2";
import { crossTenantDenied, isAdminDenied, requireAdminCaller } from "../_shared/adminAuth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorisation: verified JWT -> trusted role loaded server-side.
    // Tenant admins may unblock only inside their own organisation; crossing
    // tenants requires platform authority (superadmin role or the single
    // centrally configured platform-owner override). No email list here.
    const caller = await requireAdminCaller(req, {
      fnName: "unblock-user",
      cors: corsHeaders,
    });
    if (isAdminDenied(caller)) return caller.error;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );


    const body =
      await req
        .json()
        .catch(() => ({}));

    // ── list_locked mode:
    // Return which of the supplied emails are currently locked.
    if (
      Array.isArray(
        body?.emails
      )
    ) {
      const emails =
        (
          body.emails as string[]
        )
          .filter(
            (e) =>
              typeof e ===
                "string" &&
              e.trim()
                .length > 0
          )
          .map((e) =>
            e.trim().toLowerCase()
          );

      if (
        emails.length === 0
      ) {
        return json({
          locked_emails: [],
        });
      }

      // Tenant admins may only probe lockouts for engineers in their own org.
      let scopedEmails = emails;
      if (!caller.platformAdmin) {
        if (!caller.orgId) {
          return json(
            { error: "Cross-tenant action not permitted" },
            403
          );
        }
        const { data: orgEngineers } =
          await supabaseAdmin
            .from("engineers")
            .select("email")
            .eq(
              "organisation_id",
              caller.orgId
            );
        const ownOrgEmails = new Set(
          (orgEngineers ?? [])
            .map((e) =>
              (e.email ?? "")
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        );
        scopedEmails = emails.filter((e) =>
          ownOrgEmails.has(e)
        );
        if (
          scopedEmails.length === 0
        ) {
          return json({
            locked_emails: [],
            rows: [],
          });
        }
      }


      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from("login_attempts")
          .select(
            "email, locked_at, attempts, last_attempt_at"
          )
          .in(
            "email",
            scopedEmails
          )

          .not(
            "locked_at",
            "is",
            null
          );

      if (error) {
        console.error(
          "[unblock-user] list_locked error:",
          error
        );

        return json(
          {
            error:
              "Failed to list lockouts",
          },
          500
        );
      }

      return json({
        locked_emails:
          (data ?? []).map(
            (r) =>
              (
                r.email as string
              ).toLowerCase()
          ),
        rows: data ?? [],
      });
    }

    // ── unblock mode
    const {
      userId,
      email,
      engineerId,
    } = body as {
      userId?: string;
      email?: string;
      engineerId?: string;
    };

    if (
      !userId &&
      !email &&
      !engineerId
    ) {
      return json(
        {
          error:
            "userId, email or engineerId is required",
        },
        400
      );
    }

    // Resolve target organisation for cross-tenant protection.
    let targetOrgId:
      | string
      | null = null;

    if (engineerId) {
      const {
        data: engRow,
      } =
        await supabaseAdmin
          .from("engineers")
          .select(
            "organisation_id"
          )
          .eq(
            "id",
            engineerId
          )
          .maybeSingle();

      targetOrgId =
        (engRow as any)
          ?.organisation_id ??
        null;
    }

    if (
      !targetOrgId &&
      userId
    ) {
      const {
        data: profRow,
      } =
        await supabaseAdmin
          .from("profiles")
          .select(
            "organisation_id"
          )
          .eq(
            "user_id",
            userId
          )
          .maybeSingle();

      targetOrgId =
        (profRow as any)
          ?.organisation_id ??
        null;
    }

    // If only an email was supplied, resolve the user's profile.
    if (
      !targetOrgId &&
      email
    ) {
      const normalized =
        email.trim().toLowerCase();

      const {
        data: authUsers,
      } =
        await supabaseAdmin.auth.admin.listUsers(
          {
            page: 1,
            perPage: 200,
          }
        );

      const targetUser =
        authUsers?.users?.find(
          (u) =>
            (
              u.email ?? ""
            )
              .trim()
              .toLowerCase() ===
            normalized
        );

      if (targetUser) {
        const {
          data: profRow,
        } =
          await supabaseAdmin
            .from("profiles")
            .select(
              "organisation_id"
            )
            .eq(
              "user_id",
              targetUser.id
            )
            .maybeSingle();

        targetOrgId =
          (profRow as any)
            ?.organisation_id ??
          null;
      }
    }

    // targetOrgId is always derived server-side above (engineer row / profile /
    // auth email lookup) — a body-supplied organisation cannot widen scope.
    const blocked = crossTenantDenied(
      caller,
      targetOrgId,
      corsHeaders,
      "unblock-user",
    );
    if (blocked) return blocked;


    const performed: string[] =
      [];

    // Clear auth-side ban if userId is known.
    if (userId) {
      const {
        error: updateError,
      } =
        await supabaseAdmin.auth.admin.updateUserById(
          userId,
          {
            ban_duration:
              "none",
          }
        );

      if (updateError) {
        console.error(
          "[unblock-user] auth ban clear error:",
          updateError
        );

        return json(
          {
            error:
              "Failed to unblock user",
          },
          500
        );
      }

      performed.push(
        "cleared auth ban"
      );

      // Reactivate profile row so soft-deleted users are restored.
      await supabaseAdmin
        .from("profiles")
        .update({
          is_active: true,
          deactivated_at:
            null,
          deactivated_by:
            null,
        } as any)
        .eq(
          "user_id",
          userId
        );
    }

    // If email was provided, resolve the auth user and clear the auth ban.
    if (email) {
      const normalized =
        email.trim().toLowerCase();

      const {
        data: authUsers,
        error: authListError,
      } =
        await supabaseAdmin.auth.admin.listUsers(
          {
            page: 1,
            perPage: 200,
          }
        );

      if (authListError) {
        console.error(
          "[unblock-user] auth user lookup error:",
          authListError
        );
      } else {
        const targetUser =
          authUsers?.users?.find(
            (u) =>
              (
                u.email ?? ""
              )
                .trim()
                .toLowerCase() ===
              normalized
          );

        if (targetUser) {
          const {
            error:
              authUnblockError,
          } =
            await supabaseAdmin.auth.admin.updateUserById(
              targetUser.id,
              {
                ban_duration:
                  "none",
              }
            );

          if (
            authUnblockError
          ) {
            console.error(
              "[unblock-user] auth ban clear by email error:",
              authUnblockError
            );

            return json(
              {
                error:
                  "Failed to unblock user",
              },
              500
            );
          }

          performed.push(
            "cleared auth ban"
          );

          await supabaseAdmin
            .from("profiles")
            .update({
              is_active: true,
              deactivated_at:
                null,
              deactivated_by:
                null,
            } as any)
            .eq(
              "user_id",
              targetUser.id
            );
        }
      }

      // Clear failed-login lock state.
      const {
        error: delErr,
      } =
        await supabaseAdmin
          .from(
            "login_attempts"
          )
          .delete()
          .eq(
            "email",
            normalized
          );

      if (delErr) {
        console.error(
          "[unblock-user] login_attempts clear error:",
          delErr
        );
        // Non-fatal — continue.
      } else {
        performed.push(
          "cleared login_attempts"
        );
      }
    }

    // Also clear engineers.status server-side.
    if (engineerId) {
      const {
        error: engErr,
      } =
        await supabaseAdmin
          .from("engineers")
          .update({
            status:
              "active",
            blocked_reason:
              null,
            is_available:
              true,
          })
          .eq(
            "id",
            engineerId
          );

      if (engErr) {
        console.error(
          "[unblock-user] engineers status reset error:",
          engErr
        );

        return json(
          {
            error:
              "Failed to reset engineer status",
          },
          500
        );
      }

      performed.push(
        "reactivated engineer"
      );
    }

    // If we have a userId, make sure the failed-login record
    // for that user's email is also cleared.
    if (userId) {
      const {
        data: targetAuthUser,
      } =
        await supabaseAdmin.auth.admin.getUserById(
          userId
        );

      const targetEmail =
        targetAuthUser
          ?.user
          ?.email?.trim()
          .toLowerCase();

      if (targetEmail) {
        const {
          error: loginClearError,
        } =
          await supabaseAdmin
            .from(
              "login_attempts"
            )
            .delete()
            .eq(
              "email",
              targetEmail
            );

        if (
          !loginClearError
        ) {
          performed.push(
            "cleared login_attempts"
          );
        }
      }
    }

    return json({
      success: true,
      performed: [
        ...new Set(
          performed
        ),
      ],
    });
  } catch (err) {
    console.error(
      "unblock-user error:",
      err
    );

    return json(
      {
        error:
          "An unexpected error occurred",
      },
      500
    );
  }
});