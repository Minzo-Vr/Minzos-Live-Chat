# Community Chat Discord bot (slash commands)
This is a Cloudflare Worker Discord interactions endpoint. It does **not** replace the existing working GitHub Actions webhook announcements yet.

1. Create a Discord application at https://discord.com/developers/applications and add a bot. Enable **Guild Install** with `bot` and `applications.commands` scopes; grant **Send Messages** and **View Channel** permissions. Invite it to your server.
2. Create a Cloudflare account. In `discord-bot`, run `npx wrangler login` then `npx wrangler deploy`. Note the deployed HTTPS URL.
3. In Cloudflare Worker settings add these **secrets**: `DISCORD_PUBLIC_KEY` (Discord application's public key), `DISCORD_BOT_TOKEN`, `FIREBASE_WEB_API_KEY`, `FIREBASE_BOT_EMAIL`, `FIREBASE_BOT_PASSWORD`, `DATABASE_URL` (Firebase RTDB URL ending in `/chatAnnouncementPublished.json`), `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID`. Never put passwords or tokens into source code.
4. In Discord Developer Portal → General Information → **Interactions Endpoint URL**, paste the Worker HTTPS URL. Discord will validate its Ed25519 signature handling.
5. On your own machine, set `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, and `DISCORD_GUILD_ID` environment variables and run `node discord-bot/register-commands.mjs` from repository root.
6. Test `/ping`, `/latest`, and admin-only `/announce` in Discord. Verify the bot has access to the intended channel.

The existing GitHub Actions webhook announcements remain enabled during setup. Once commands work, bot-token-based automatic announcements can be migrated separately to avoid duplicates.

Security: Discord verifies signed interactions. `/announce` requires Discord Administrator permissions and a matching guild ID. Do not publish credentials, and rotate any previously exposed webhook or bot token.


## Private ticket support

The bot now automatically posts ticket buttons to the **App Reports**, **Direct Support**, and **Bug Support** text channels. A button creates a **private Discord thread**, invites its creator, and shows a **Close Ticket** button. Only invited members and admins/moderators with **Manage Threads** can read it; ordinary members cannot see ticket messages.

For the three requested channel IDs, Discord permissions, optional staff invitations, and `/setup_tickets` recovery, read [TICKETS.md](./TICKETS.md). The bot must have **Create Private Threads**, **View Channel**, **Send Messages**, **Send Messages in Threads**, and **Manage Threads**. Members need **View Channel** and **Send Messages in Threads**.

The implementation uses the existing `SAD_MESSAGES` KV namespace with separate ticket key prefixes. It does not require an extra database or expose ticket messages to the website.
