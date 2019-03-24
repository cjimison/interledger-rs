# Build Node.js into standalone binaries
FROM node:11 as node

RUN npm install -g nexe@^3.0.0-beta.15

# Build settlement engine
COPY ./settlement-engines /usr/src/settlement-engines
WORKDIR /usr/src/settlement-engines/xrp
RUN npm run build

ENV PLATFORM alpine
ENV ARCH x64
ENV NODE 10.15.3

RUN nexe \
    --target ${PLATFORM}-${ARCH}-${NODE} \
    ./build/cli.js \
    --output \
    /usr/local/bin/xrp-settlement-engine \
    --resource \
    "./scripts/*.lua"

# Build Interledger node into standalone binary
FROM clux/muslrust as rust

WORKDIR /usr/src
COPY ./Cargo.toml /usr/src/Cargo.toml
COPY ./crates /usr/src/crates

# TODO build release
RUN cargo build --package interledger


# Copy the binaries into the final stage
FROM alpine:latest

# Expose ports for HTTP and BTP
EXPOSE 7768
EXPOSE 7770

VOLUME [ "/data" ]
ENV REDIS_DIR=/data

WORKDIR /usr/local/bin

# Install SSL certs and Redis
RUN apk --no-cache add \
    ca-certificates \
    redis

# Copy in Node.js bundles
COPY --from=node /usr/local/bin/xrp-settlement-engine /usr/local/bin/xrp-settlement-engine

COPY ./run-interledger-node.sh /usr/local/bin/run-interledger-node

# Copy Interledger binary
COPY --from=rust /usr/src/target/x86_64-unknown-linux-musl/debug/interledger /usr/local/bin/interledger

CMD ["sh", "run-interledger-node"]