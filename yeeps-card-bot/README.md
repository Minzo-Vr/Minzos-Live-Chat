# Yeeps Card Pack Opener — separate Discord bot

A **standalone unofficial Yeeps-inspired pack simulator**. It does not connect to Yeeps accounts, open real packs or grant in-game rewards.

This Discord bot is separate from Community Chat:
- **Discord application:** Create a NEW application at https://discord.com/developers/applications.
- **Cloudflare Worker:** `yeeps-card-pack-opener` using `yeeps-card-bot/worker.js`.
- **Storage:** Dedicated `YEEPS_CARD_PACKS` Workers KV namespace (bound as `PACKS`).
- **Commands:** `/openpack`, `/collection`, and `/packhelp`. Only the pack's owner can reveal it.

## One-time setup

1. In Discord Developer Portal, select **New Application**, name it **Yeeps Card Pack Opener**, then open **Bot**. Use the **Bot Token** only in secure secret storage; do not put it in GitHub code or ChatGPT.
2. Under **Installation**, allow **Guild Install** using `bot` and `applications.commands`. Install the separate bot into your chosen Discord server.
3. The standalone Worker has already been deployed at https://yeeps-card-pack-opener.kobefalzon8.workers.dev. Future code updates can be deployed from the `yeeps-card-bot` folder using `npx wrangler deploy`. The `wrangler.toml` includes the dedicated KV namespace.
4. In Cloudflare dashboard → Workers & Pages → `yeeps-card-pack-opener` → **Settings → Variables and Secrets**, add `DISCORD_PUBLIC_KEY` from the **new Discord application's General Information** page. This is the public key, **not** the bot token. Ensure the Worker also has a plain-text variable `DISCORD_APPLICATION_ID` matching that new application ID, required for deferred collection responses.
5. In the new Discord application → **General Information → Interactions Endpoint URL**, paste the deployed Worker URL (e.g. https://yeeps-card-pack-opener.kobefalzon8.workers.dev). Discord validates the endpoint's signature and PING response.
6. Register the commands for **the new bot**, using your own terminal (Node.js 22+):

   - On macOS/Linux: `YEEPS_DISCORD_BOT_TOKEN=... YEEPS_DISCORD_APPLICATION_ID=... YEEPS_DISCORD_GUILD_ID=... node yeeps-card-bot/register-commands.mjs`
   - On Windows PowerShell, set those three environment variables first (using `$env:VARIABLE="..."`), then run `node yeeps-card-bot/register-commands.mjs`.

7. Test `/openpack`, press **Reveal Cards**, then run `/collection`.

The Worker only needs the new application's public key and application ID at runtime; the bot token is used locally for registering commands. Don't reuse Community Chat's Discord application ID, token, or public key.

**Note:** A new application must be created in the Discord Developer Portal by its owner. Adding code does not automatically create a second Discord identity or finish installation.
