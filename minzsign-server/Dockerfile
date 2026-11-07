# Build the actual iOS signer instead of pretending a web page can sign IPA files.
FROM debian:bookworm AS zsign-build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates make g++ pkg-config libssl-dev
RUN git clone --depth 1 https://github.com/zhlynn/zsign.git /opt/zsign \
 && make -C /opt/zsign/build/linux \
 && install -m 0755 /opt/zsign/bin/zsign /usr/local/bin/zsign

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/minzsign
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=zsign-build /usr/local/bin/zsign /usr/local/bin/zsign
COPY server.js ./
RUN mkdir -p /tmp/minzsign && chown node:node /tmp/minzsign
USER node
ENV PORT=10000 NODE_ENV=production
EXPOSE 10000
CMD ["node","server.js"]
