# 1 Word Stories (Discord)

**Goal:** Everyone builds a story together by adding **one word at a time**. A person must wait for **another person** to contribute a valid word before posting again.

## Game rules

| Example | Result | Why |
| --- | --- | --- |
| `Hello` | ✅ Allowed | One word |
| `world!` | ✅ Allowed | One word with a single final punctuation mark |
| `don't` or `she’s` | ✅ Allowed | One contraction |
| `he-liked-her` | ❌ Deleted | Hyphens are not allowed to join words |
| `hello_world` | ❌ Deleted | Underscores are not allowed |
| `hello world` | ❌ Deleted | Multiple words are not allowed |
| `hello​world` (zero-width join) | ❌ Deleted | Hidden separator |
| `hello😀`, `123`, links, mentions | ❌ Deleted | Not a word |
| Photos, embeds, files, stickers | ❌ Deleted | This is a text-only story |
| Two consecutive valid words from the same author | ❌ Second word deleted | Another user must go next |

Unicode letters (including accented words and non-English scripts) are supported. A word may have a single terminal `.`, `,`, `!`, `?`, `;`, or `:`. Length limit: 40 Unicode characters.

The bot cannot stop a user from pressing Send. **Accepted messages receive a ✅ reaction**, while **rejected messages receive a ❌ reaction before being deleted**. The real-time listener typically removes rejected messages after about five seconds; the Cloudflare scheduled fallback leaves the ❌ visible until its following moderation run (normally within roughly a minute). The bot also checks message edits and removes its previous ✅ reaction if an accepted word is edited into an invalid one.

## Discord channel setup

- The bot uses a dedicated, normal text channel named **#1-word-stories**.
- On the next successful Cloudflare cron run after deployment, it looks for an existing channel with that name, **creates one if missing**, and posts a rules message. It stores the channel ID and previous valid author in the existing `SAD_MESSAGES` KV namespace, with `oneword:` keys. It does not delete or change any other channels or messages.
- Admins can run the server-only slash command **`/setup_one_word_stories`** to create/repair the channel and see its link. The command is registered by `discord-bot/register-commands.mjs` and the repository's **Register Discord Slash Commands** GitHub Action.
- The existing Cloudflare Worker scheduled task checks for new story messages once every minute and deletes multiword messages and consecutive turns, with state persisting in KV.

### Required Discord permissions

Bot: **Manage Channels** (to create the new channel), **View Channel**, **Read Message History**, **Send Messages**, **Add Reactions** (to mark ✅ / ❌), and **Manage Messages** (to delete invalid messages). Channel permissions can override server roles. If Add Reactions is denied, the rule enforcement still works, but reactions may not appear.

Enable **Message Content Intent** in the [Discord Developer Portal](https://discord.com/developers/applications) → your bot → Bot → Privileged Gateway Intents. Without message content access, Discord may hide message contents and the bot cannot reliably decide whether a message is one word. The Cloudflare moderator refuses to mass-delete when content appears unavailable.

### Faster moderation (recommended)

The separate long-running Discord Gateway listener at `discord-bot/support-bot/bot.js` reacts to new messages and edits **immediately when running**. It checks previous valid messages in Discord channel history, so bot restarts don't reset the turn order.

For that service on Render (or other Node host), set:

- `DISCORD_BOT_TOKEN` — the same existing bot token, as a private host secret.
- `DISCORD_GUILD_ID` — `1564239312613015585`.
- `ONE_WORD_STORIES_CHANNEL_ID` — optional, recommended once the channel is created. If omitted, it listens for a text channel with the exact name `1-word-stories` in that guild.
- `HELP_CHANNEL_ID` and `OPENAI_API_KEY` — **optional** for AI help; not needed for the word game.
- `ROLE_SYNC_MAP` — optional; the Gateway listener requests Guild Members Intent only if enabled.

The bot adds ✅ to each accepted word and ❌ to a rejected word, then removes rejected messages after a short delay so the reaction can be seen. It also replies to a rule violation with a private DM no more than once per minute per user (when DMs are open). It does **not** clutter the story channel with explanation messages. Run **only one instance** of the Gateway listener for consistent moderation.

If the separate Gateway listener isn't running, the Cloudflare cron moderator is a fallback, but invalid posts may remain visible for up to about a minute. The Cloudflare bot and Discord Gateway use the same strict validator (`discord-bot/one-word-rules.mjs`).

## Troubleshooting

- **Channel missing:** Check Cloudflare logs, the bot's Manage Channels permission, and run `/setup_one_word_stories`.
- **`/setup_one_word_stories` missing:** Check the **Register Discord Slash Commands** GitHub Action and confirm the bot application is installed in this guild.
- **Invalid messages not removed:** Check the bot's Manage Messages, View Channel and Read Message History permissions, plus Message Content Intent.
- **Removals delayed:** Start/redeploy the long-running Gateway listener; the Cloudflare safety net runs each minute.
- **Two people posting rapidly:** The Gateway listener queues message checks per channel. The scheduled moderator processes chronological order and persists the last accepted author.
- **No automatic channel creation:** Your Cloudflare Worker deployment is separate from a GitHub code commit; verify the Worker is deployed with `one-word-stories.js`.

**Privacy:** The KV moderator stores only the Discord channel ID, message cursor, and last accepted Discord author ID. It does not store story content or copy user messages to a separate server.
