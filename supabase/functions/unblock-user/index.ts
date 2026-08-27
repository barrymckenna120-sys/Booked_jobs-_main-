import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
};

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (
      !authHeader?.startsWith(
        "Bearer "
      )
    ) {
      return json(
        { error: "Unauthorized" },
        401
      );
    }

    const token =
      authHeader.replace(
        /^Bearer\s+/i,
        ""
      );

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL"
      )!;

    const supabaseUser =
      createClient(
        supabaseUrl,
        Deno.env.get(
          "SUPABASE_ANON_KEY"
        )!
      );

    const {
      data: { user: caller },
      error: userError,
    } =
      await supabaseUser.auth.getUser(
        token
      );

    if (
      userError ||
      !caller
    ) {
      return json(
        { error: "Unauthorized" },
        401
      );
    }

    const supabaseAdmin =
      createClient(
        supabaseUrl,
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        )!
      );

    const callerEmail =
      caller.email
        ?.toLowerCase() ?? "";

    const PLATFORM_OWNER_EMAILS = [
      "barrymckenna120@gmail.com",
    ];

    let isAuthorized =
      PLATFORM_OWNER_EMAILS.includes(
        callerEmail
      );

    let bypassOrgCheck =
      PLATFORM_OWNER_EMAILS.includes(
        callerEmail
      );

    let callerOrgId:
      | string
      | null = null;

    const {
      data: callerProfile,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "role, organisation_id"
        )
        .eq(
          "user_id",
          caller.id
        )
        .maybeSingle();

    if (
      (callerProfile as any)
        ?.role === "superadmin"
    ) {
      isAuthorized = true;
      bypassOrgCheck = true;
    }

    callerOrgId =
      (callerProfile as any)
        ?.organisation_id ??
      null;

    if (!isAuthorized) {
      const {
        data: callerRole,
      } =
        await supabaseAdmin.rpc(
          "get_user_role",
          {
            _user_id: caller.id,
          }
        );

      isAuthorized = [
        "admin",
        "office",
        "owner",
        "manager",
        "superadmin",
      ].includes(
        callerRole ?? ""
      );
    }

    if (!isAuthorized) {
      const {
        data: ownedOrg,
      } =
        await supabaseAdmin
          .from("organisations")
          .select("id")
          .eq(
            "owner_user_id",
            caller.id
          )
          .maybeSingle();

      isAuthorized =
        !!ownedOrg;
    }

    if (!isAuthorized) {
      return json(
        {
          error:
            "Insufficient permissions",
        },
        403
      );
    }

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
            emails
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

    if (
      !bypassOrgCheck &&
      (
        !callerOrgId ||
        !targetOrgId ||
        callerOrgId !==
          targetOrgId
      )
    ) {
      return json(
        {
          error:
            "Cross-tenant action not permitted",
        },
        403
      );
    }

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