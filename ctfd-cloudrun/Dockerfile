# ─── Litestream binary ────────────────────────────────────────────────────────
FROM debian:trixie-slim AS litestream
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN wget -qO /tmp/litestream.tar.gz \
    https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz \
    && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
    && chmod +x /usr/local/bin/litestream

# ─── CTFd + mayfly plugin + Litestream replication ────────────────────────────
FROM l0zcr0wth3r/ctfd:1.2.1

USER root

COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY ctfd_mayfly /opt/CTFd/CTFd/plugins/ctfd_mayfly
COPY litestream.yml /app/litestream.yml
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN mkdir -p /app/db \
    && chown -R ctfd:ctfd /app \
    && chmod +x /app/docker-entrypoint.sh

USER ctfd

# CTFd's own default is a SQLite file next to the package (wiped on every image
# rebuild/instance recycle); point it at the path Litestream replicates instead.
ENV DATABASE_URL=sqlite:////app/db/ctfd.db

ENTRYPOINT ["/app/docker-entrypoint.sh"]
