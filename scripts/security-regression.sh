#!/usr/bin/env bash
# Regression: email queue + duplicate-job check access rules (read-only calls).
# Usage: SUPABASE_URL=... ANON_KEY=... USER_TOKEN=<signed-in JWT> OWN_ORG=<user's org> OTHER_ORG=<another org> scripts/security-regression.sh
set -u; fail=0; R="$SUPABASE_URL/rest/v1/rpc"
call(){ curl -s -o /dev/null -w "%{http_code}" -X POST "$R/$1" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
expect(){ [ "$2" = "$3" ] && echo "PASS $1" || { echo "FAIL $1 (got $2, want $3)"; fail=1; }; }
dup(){ echo "{\"p_organisation_id\":\"$1\",\"p_phone\":\"+353870000000\",\"p_job_type\":\"Boiler Service\",\"p_address\":\"x\"}"; }
expect "signed-out enqueue_email blocked" "$(call enqueue_email '{"queue_name":"transactional_emails","payload":{}}')" 401
expect "signed-out find_duplicate_job blocked" "$(call find_duplicate_job "$(dup "$OWN_ORG")")" 401
expect "signed-in enqueue_email blocked" "$(call enqueue_email '{"queue_name":"transactional_emails","payload":{}}' "$USER_TOKEN")" 403
expect "signed-in cross-tenant duplicate check blocked" "$(call find_duplicate_job "$(dup "$OTHER_ORG")" "$USER_TOKEN")" 403
expect "signed-in own-tenant duplicate check allowed" "$(call find_duplicate_job "$(dup "$OWN_ORG")" "$USER_TOKEN")" 200
exit $fail
