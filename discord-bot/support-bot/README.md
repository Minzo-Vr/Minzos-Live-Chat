# Community Chat AI support bot (Render)

This is a separate long-running Discord Gateway listener for the existing Community Chat bot. It **does not replace** the Cloudflare Worker handling slash commands.

## Discord setup

1. In the Discord Developer Portal, open the existing Community Chat application and enable **Message Content Intent** under Bot > Privileged Gateway Intents.
2. Invite/retain the bot in your server with View Channel, Send Messages, and Read Message History permissions in #help.
3. Enable Developer Mode in Discord, right-click #help, and copy its channel ID.

## Render setup

Create a **Background Worker** using the existing GitHub repository (paid hosting may be required).
- Root directory: `discord-bot/support-bot`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variables (mark secrets private):
  - `DISCORD_BOT_TOKEN`: token of the **existing** Discord bot
  - `HELP_CHANNEL_ID`: the numeric channel ID of #help
  - `OPENAI_API_KEY`: an OpenAI API key with billing configured
  - `OPENAI_MODEL`: optional, defaults to `gpt-4.1-mini`

The token must never be committed to GitHub. Only run **one** instance of this Gateway listener to avoid duplicate answers. Cloudflare Worker remains deployed separately.

## Usage

In #help, type `$How do I link my Discord account?`. Messages not starting with `$`, messages in other channels, and bot messages are ignored. Per-user cooldown: 20 seconds. Questions are capped at 1200 characters; answers at 1750 characters.

This is AI guidance, not an administrative action system. It cannot grant roles or access private account data. Questions are sent to the configured AI provider for processing. Never send passwords or private credentials to the bot.

## Two-way role synchronization (opt-in)

Community Chat roles are stored at `chatRoles/<firebaseUid>`; Discord account links are stored at `discordAuthLinks/<discordUserId>`. The listener synchronizes only linked users who are members of the configured Discord server.

**Required Discord setup:** enable **Server Members Intent** in the Discord Developer Portal, and grant the bot **Manage Roles**. Move the bot's highest role above every role being synced. Never map a Discord role that has the Administrator permission.

**Additional Render environment variables:**
- `DISCORD_GUILD_ID`: Discord server ID.
- `ROLE_SYNC_MAP`: JSON mapping Community Chat role keys to **existing Discord role IDs**, e.g. `{"plus":"123456789012345678","testsubject":"234567890123456789","moderator":"345678901234567890"}`. Replace the example IDs with your real IDs.
- `FIREBASE_DATABASE_URL`: Firebase Realtime Database URL, e.g. `https://website-chat-80038-default-rtdb.firebaseio.com`.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete Firebase service-account JSON stored **only** as a private Render secret. Do not put it in GitHub or client-side code.

Sync is disabled until both `DISCORD_GUILD_ID` and `ROLE_SYNC_MAP` are configured. If enabled, the Firebase credentials must also be present. Roles supported by this initial implementation are `plus`, `testsubject`, and `moderator`. **Admin is intentionally excluded** because syncing administrator privileges across systems needs additional authorization safeguards.

The bot checks Community Chat roles about every minute and applies changes to the Discord server. Discord role changes while the bot is connected are reflected back to Firebase immediately. The bot preserves unrelated roles in both systems. At startup, Community Chat is authoritative for resolving any differences while the bot was offline. There is no historical conflict resolution, and only changes to the mapped roles are synced.

**Security note:** anyone who can manage a mapped Discord role may indirectly grant or revoke the corresponding Community Chat role. Restrict Discord Manage Roles carefully, particularly if mapping Moderator. A mapped Discord role can carry Discord permissions independent of Community Chat. Review Firebase rules and the Discord role permissions before enabling this in production. Use a dedicated service account with the minimum feasible access, and never expose its private key.
