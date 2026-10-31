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
