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


## Easiest command registration (GitHub Actions)

The repository includes a **Register Yeeps Card Bot Commands** workflow. It registers `/openpack`, `/collection`, and `/packhelp` as **global commands** for the separate Discord application only, avoiding duplicate guild commands.

1. In this repository, open **Settings → Secrets and variables → Actions → New repository secret**.
2. Add the secret name `YEEPS_DISCORD_BOT_TOKEN` and paste the bot token from the **new Yeeps Card Pack Opener application**, not Community Chat. **Never commit the token or paste it in chat.**
3. Open **Actions → Register Yeeps Card Bot Commands → Run workflow** (branch `main`).
4. Once the workflow succeeds, install the new bot into your server with the `bot` and `applications.commands` scopes and wait for global commands to appear.

This workflow uses the Yeeps application's public ID provided during setup. It needs no Discord server ID and does not overwrite commands belonging to the Community Chat application. Do not also run the guild command registrar for the same app unless you deliberately want guild-scoped copies (which can show duplicates).

**Interactions Endpoint URL:** `https://yeeps-card-pack-opener.kobefalzon8.workers.dev`


## Card admin panel

The standalone bot offers the **/cardadmin** slash command. It opens a private panel with three Discord buttons and input forms:

- **Add Card** — card name, independent drop chance **0–100% per pack**, and a difficulty label: **Easy / Medium / Hard / Extreme**. Difficulty is a label only; chance controls actual drops. Custom cards can replace up to four of the five slots, preserving the guaranteed Rare-or-higher fifth slot. If more than four custom cards trigger during a single pack, four are randomly selected.
- **Give User Card** — specify the target's Discord User ID or full \`<@ID>\` mention, an exact built-in/custom card name or ID, and a quantity of 1–10.
- **Delete Cards** — target an individual Discord User ID or type the exact string \`@everyone\` to clear the virtual card collections globally. Confirmation is \`DELETE USER\` for a single user and \`DELETE ALL\` for everyone. A reset also invalidates any older unopened packs so cleared cards cannot be recovered through old Reveal buttons.

**Security:** Every admin command, button and modal checks Discord Administrator permission **inside the configured admin guild**. The Worker variable \`YEEPS_ADMIN_GUILD_ID\` currently targets the Community Chat server. If the Yeeps bot lives in a different server, change this Worker variable (and \`wrangler.toml\` to keep it on future deploys) to that server's ID. The panel cannot be used in DMs or other servers.

**Storage:** The existing \`PACKS\` Cloudflare KV binding is used; no database migration or extra token is required. Clearing a collection changes its active collection generation immediately and queues old records for physical deletion. A one-minute cron works through the deletion queue in batches. KV is eventually consistent, so resets may take a short period to propagate across Cloudflare locations. \`@everyone\` in this panel is a collection reset instruction, **not** a Discord message mention or ping.

**Command registration:** \`/cardadmin\` is registered as a **global guild-install-only** command with Discord's Administrator permission requirement. The existing \`Register Yeeps Card Bot Commands\` GitHub Action automatically updates the new Discord application's commands without opening a pull request. Do not also register the same commands at guild scope.
