#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
WAIT_SECONDS="${WAIT_SECONDS:-90}"
POLL_SECONDS="${POLL_SECONDS:-3}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required in your shell (.env)."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required."
  exit 1
fi

YDAY_UTC="$(node -e "const d=new Date(Date.now()-24*60*60*1000);console.log(d.toISOString().slice(0,10))")"
YDAY_MELB="$(node -e "const now=new Date();const melb=new Date(now.toLocaleString('en-US',{timeZone:'Australia/Melbourne'}));melb.setDate(melb.getDate()-1);const yyyy=melb.getFullYear();const mm=String(melb.getMonth()+1).padStart(2,'0');const dd=String(melb.getDate()).padStart(2,'0');console.log(\`\${yyyy}-\${mm}-\${dd}\`)")"

create_user() {
  local first_name="$1"
  local last_name="$2"
  local birthday="$3"
  local timezone="$4"

  local payload
  payload=$(cat <<EOF
{"firstName":"$first_name","lastName":"$last_name","birthday":"$birthday","timezone":"$timezone"}
EOF
)

  local status
  status=$(curl -sS -o /tmp/add_user_response.json -w "%{http_code}" \
    -X POST "$API_BASE_URL/user" \
    -H "content-type: application/json" \
    -d "$payload")

  if [[ "$status" != "201" ]]; then
    echo "Failed to create user $first_name $last_name (status=$status)"
    cat /tmp/add_user_response.json
    exit 1
  fi

  node -e "const fs=require('node:fs');const body=JSON.parse(fs.readFileSync('/tmp/add_user_response.json','utf8'));if(!body.id){process.exit(1)};process.stdout.write(String(body.id));"
}

delete_user() {
  local user_id="$1"
  local payload
  payload=$(cat <<EOF
{"id":"$user_id"}
EOF
)

  local status
  status=$(curl -sS -o /tmp/delete_user_response.json -w "%{http_code}" \
    -X DELETE "$API_BASE_URL/user" \
    -H "content-type: application/json" \
    -d "$payload")

  if [[ "$status" != "204" ]]; then
    echo "Failed to delete user id=$user_id (status=$status)"
    cat /tmp/delete_user_response.json
    exit 1
  fi
}

print_db_rows() {
  psql "$DATABASE_URL" -P pager=off -c "
    SELECT
      u.first_name,
      u.last_name,
      u.birthday,
      u.timezone,
      u.deleted_at,
      n.status,
      n.due_at_utc,
      n.sent_at,
      n.last_error
    FROM users u
    LEFT JOIN notification_occurrences n
      ON n.user_id = u.id
    WHERE u.last_name LIKE 'ExactScenario%'
       OR u.last_name LIKE 'LookbackScenario%'
       OR u.last_name LIKE 'DeletedScenario%'
    ORDER BY u.last_name, u.first_name;
  "
}

count_unsent_rows() {
  psql "$DATABASE_URL" -tA -c "
    SELECT COUNT(*)::int
    FROM users u
    LEFT JOIN notification_occurrences n
      ON n.user_id = u.id
    WHERE (u.last_name LIKE 'ExactScenario%' OR u.last_name LIKE 'LookbackScenario%')
      AND COALESCE(n.status, 'missing') <> 'sent';
  "
}

count_deleted_user_occurrences() {
  psql "$DATABASE_URL" -tA -c "
    SELECT COUNT(*)::int
    FROM notification_occurrences n
    INNER JOIN users u
      ON u.id = n.user_id
    WHERE u.last_name LIKE 'DeletedScenario%';
  "
}

echo "Creating scenario users..."
echo "Scenario A (Exact-time cohort): timezone=UTC birthday=$YDAY_UTC"
create_user "Ava" "ExactScenario-One" "$YDAY_UTC" "UTC"
create_user "Noah" "ExactScenario-Two" "$YDAY_UTC" "UTC"
create_user "Mia" "ExactScenario-Three" "$YDAY_UTC" "UTC"

echo "Scenario B (Lookback cohort): timezone=Australia/Melbourne birthday=$YDAY_MELB"
create_user "Liam" "LookbackScenario-One" "$YDAY_MELB" "Australia/Melbourne"
create_user "Emma" "LookbackScenario-Two" "$YDAY_MELB" "Australia/Melbourne"
create_user "Olivia" "LookbackScenario-Three" "$YDAY_MELB" "Australia/Melbourne"

echo "Scenario C (Deleted user should never be sent)"
deleted_id="$(create_user "Zoe" "DeletedScenario-One" "$YDAY_UTC" "UTC")"
delete_user "$deleted_id"

echo
echo "Initial DB snapshot (after user creation):"
print_db_rows

echo
echo "Waiting for planner/worker to process occurrences..."
elapsed=0
while (( elapsed < WAIT_SECONDS )); do
  unsent="$(count_unsent_rows | tr -d '[:space:]')"
  if [[ "$unsent" == "0" ]]; then
    break
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

echo
echo "Final DB snapshot:"
print_db_rows

unsent="$(count_unsent_rows | tr -d '[:space:]')"
if [[ "$unsent" != "0" ]]; then
  echo
  echo "Some rows are still not sent after ${WAIT_SECONDS}s (unsent=$unsent)."
  echo "Make sure api/planner/worker services are running and reachable."
  exit 1
fi

deleted_occurrences="$(count_deleted_user_occurrences | tr -d '[:space:]')"
if [[ "$deleted_occurrences" != "0" ]]; then
  echo
  echo "Deleted-user check failed: expected 0 occurrences, got $deleted_occurrences."
  exit 1
fi

echo
echo "All non-deleted scenario rows reached status=sent."
echo "Deleted-user scenario verified: no occurrence rows created/sent."
echo "Please check your webhook endpoint now."
echo "Expected requests: 6 total (3 ExactScenario + 3 LookbackScenario, 0 DeletedScenario)."
echo "Expected message format for each request:"
echo "  Hey, {full_name} it’s your birthday"
