FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
RUN git clone --depth 1 https://github.com/MercuryWorkshop/Scramjet-App.git .
RUN pnpm install --frozen-lockfile
COPY community-bridge.js /app/public/community-bridge.js
RUN sed -i 's@</head>@<script src="/community-bridge.js" defer></script></head>@' /app/public/index.html
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["pnpm", "start"]
