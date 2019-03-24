#!/bin/bash

set -e

redis_socket="/tmp/redis.sock"
redis_dir=${REDIS_DIR:-.}

echo "Starting Redis server"
redis-server \
    --unixsocket $redis_socket \
    --unixsocketperm 777 \
    --appendonly yes \
    --appendfsync everysec \
    --dir $redis_dir \
    >&1 &2>&2 \
    &
redis_pid=$!

echo "Starting XRP Settlement Engine"
xrp-settlement-engine \
    --redis=$redis_socket \
    --address=${XRP_ADDRESS:?XRP_ADDRESS is required} \
    --secret=${XRP_SECRET:?XRP_SECRET is required} \
    >&1 &2>&2 \
    &
settlement_engine_pid=$(("$!" + 1))

echo "Creating admin account"
interledger node accounts add \
    --redis_uri=unix:$redis_socket \
    --ilp_address=${ILP_ADDRESS:-private.local.node} \
    --xrp_address=${XRP_ADDRESS} \
    --http_incoming_token=${ADMIN_TOKEN:?ADMIN_TOKEN is required} \
    --asset_code=XRP \
    --asset_scale=9 \
    --admin \
    >&1 &2>&2 \
    &

# Forward signals to child processes
# trap "ps aux" SIGINT SIGTERM EXIT
# trap "kill -TERM $redis_pid" SIGINT SIGTERM EXIT
# trap "redis-cli -s $redis_socket shutdown" SIGINT SIGTERM EXIT

echo "Launching Interledger node"
interledger node \
    --redis_uri=unix:$redis_socket \

