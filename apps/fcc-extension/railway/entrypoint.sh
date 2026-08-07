#!/bin/sh
set -eu

umask 077

required() {
  name="$1"
  eval "value=\${$name-}"
  if [ -z "$value" ]; then
    printf 'missing required configuration: %s\n' "$name" >&2
    exit 64
  fi
  if printf '%s' "$value" | LC_ALL=C grep -q '[[:cntrl:]]'; then
    printf 'invalid control character in configuration: %s\n' "$name" >&2
    exit 64
  fi
}

toml_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

for name in \
  FCC_INDEXER_HOST FCC_INDEXER_PORT FCC_INDEXER_DATABASE \
  FCC_INDEXER_USER FCC_INDEXER_PASSWORD PROXY_PRIVATE_KEY \
  FCC_DIRECT_API_KEY COSTON2_RPC_URL INITIAL_OWNER EXTENSION_ID \
  GOVERNANCE_SIGNERS GOVERNANCE_THRESHOLD
do
  required "$name"
done

case "${FCC_INDEXER_PORT}" in
  *[!0-9]*|'') printf 'FCC_INDEXER_PORT must be numeric\n' >&2; exit 64 ;;
esac
case "${PORT:-6662}" in
  *[!0-9]*|'') printf 'PORT must be numeric\n' >&2; exit 64 ;;
esac

runtime_dir=/run/veilbid
sealed_dir=${SEALED_STORE_DIR:-/data/sealed}
config_dir=/app/config
config_path=$config_dir/config.toml
mkdir -p "$runtime_dir" "$sealed_dir" "$config_dir"
chmod 0700 "$runtime_dir" "$sealed_dir" "$config_dir"

indexer_host=$(toml_string "$FCC_INDEXER_HOST")
indexer_database=$(toml_string "$FCC_INDEXER_DATABASE")
indexer_user=$(toml_string "$FCC_INDEXER_USER")
indexer_password=$(toml_string "$FCC_INDEXER_PASSWORD")
external_port=${PORT:-6662}

cat > "$config_path" <<EOF
# Generated inside the Railway runtime. Never publish this file.
redis_port = "127.0.0.1:6379"
chain_id = 114
private_key_variable = "PROXY_PRIVATE_KEY"
initial_signing_policy_offset = 2
signing_policy_fetch_interval = "20s"
machine_path_list_fetch_interval = "10m"
db_sync_max_sleep_time = "10m"

[db]
host = "$indexer_host"
port = ${FCC_INDEXER_PORT}
database = "$indexer_database"
username = "$indexer_user"
password = "$indexer_password"
log_queries = false

[logging]
level = "INFO"
file = ""
max_file_size = 0
console = true

[addresses]
flare_systems_manager = "0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52"
relay = "0xa10B672D1c62e5457b17af63d4302add6A99d7dE"
voter_registry = "0x6a0AF07b7972177B176d3D422555cbc98DfDe914"

[ports]
internal = "6661"
external = "$external_port"

[info_timing]
initial_timeout = "5m"
cycle_internal = "10s"
cycle_queue_response_wait = "30s"

[voting]
proposal_expiration = "120s"
max_pending_request = 100
history_size = 3
finalized_buffer_size = 10
max_provider_vote = 0.025

[storage]
action_ttl = "336h"
result_ttl = "336h"
submit_result_ttl = "30m"
backup_ttl = "192h"

[direct]
enable = true
api_key = ""
api_key_variable = "FCC_DIRECT_API_KEY"
api_key_optional = false
max_body_size = 1048576

[attestation]
enable = true
allow_magic_pass = true

[metrics]
enable = false
EOF
chmod 0600 "$config_path"

redis-server \
  --bind 127.0.0.1 \
  --protected-mode yes \
  --port 6379 \
  --save '' \
  --appendonly no \
  --dir "$runtime_dir" &
redis_pid=$!

cleanup() {
  trap - TERM INT EXIT
  kill -TERM "${tee_pid:-}" "${proxy_pid:-}" "$redis_pid" 2>/dev/null || true
  wait "${tee_pid:-}" "${proxy_pid:-}" "$redis_pid" 2>/dev/null || true
}
trap cleanup TERM INT EXIT

for attempt in $(seq 1 40); do
  if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$redis_pid" 2>/dev/null; then
    printf 'redis exited before becoming ready\n' >&2
    exit 70
  fi
  if [ "$attempt" -eq 40 ]; then
    printf 'redis readiness timeout\n' >&2
    exit 70
  fi
  sleep 0.25
done

/app/tee-proxy &
proxy_pid=$!

for attempt in $(seq 1 120); do
  if nc -z 127.0.0.1 6661 >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$proxy_pid" 2>/dev/null; then
    printf 'tee-proxy exited before becoming ready\n' >&2
    exit 70
  fi
  if [ "$attempt" -eq 120 ]; then
    printf 'tee-proxy readiness timeout\n' >&2
    exit 70
  fi
  sleep 0.25
done

export MODE=1
export CHAIN_ID=114
export PROXY_URL=http://127.0.0.1:6661
export SEALED_STORE_DIR="$sealed_dir"
/app/extension-tee &
tee_pid=$!

printf 'VeilBid FCC machine started in simulated Coston2 mode\n'
while :; do
  for process in "$redis_pid" "$proxy_pid" "$tee_pid"; do
    if ! kill -0 "$process" 2>/dev/null; then
      printf 'FCC machine child process exited\n' >&2
      exit 70
    fi
  done
  sleep 2
done
