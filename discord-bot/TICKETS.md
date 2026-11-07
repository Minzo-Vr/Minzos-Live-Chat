# Community Hub Discord — private support tickets

The running Discord bot uses **private threads** (Discord channel type `12`) to provide private conversations between a member and support staff. It posts three **public button panels** into the channels you requested, then creates a **private thread under the selected channel** when someone presses its button. It never substitutes a public thread if private-thread creation fails.

| Panel | Discord text channel | Button |
| --- | --- | --- |
| 📱 App Reports | `1568434705865375744` | Report an app issue |
| 💬 Direct Support | `1568434138531500092` | Contact support |
| 🐛 Bug Support | `1568434009485348875` | Report a bug |

Server ID: `1564239312613015585`.

## What members see

1. Open the channel and click the ticket button in the bot's panel message.
2. The bot creates a **private thread**, adds the person who clicked, then replies privately with the ticket link.
3. The member and people allowed by Discord private-thread permissions type directly into the thread; they can share screenshots and other attachments using Discord.
4. A **Close Ticket** button inside the private thread lets its creator or staff with `Manage Threads` archive and lock it. Messages remain in Discord; closing never deletes them.
5. When the same member clicks the same category while it is open, the bot links to the existing thread instead of opening another (concurrent clicks may still race because KV is eventually consistent).

**Who can view a private ticket?** The thread's invited members, **plus server members with `Manage Threads`**. Someone with `Manage Threads` can view even without a direct invitation. Do not promise that only one specific admin sees it.

## Required Discord permissions

For the **bot** in each of the three *text* parent channels:
- View Channel
- Send Messages
- Read Message History (used to detect existing panels and prevent duplicates)
- Create Private Threads
- Send Messages in Threads
- Manage Threads (to lock/close a thread)
- Attach Files / Embed Links if you want those optional features in bot messages

For **members** who open tickets, the parent channels must allow **View Channel** and **Send Messages in Threads**. They do not need Create Private Threads permission because the bot creates their threads.

For **admins/reviewers**, assign **Manage Threads**, **View Channel**, and **Send Messages in Threads** on the relevant parent channels. Administrators may already have these through the Administrator permission. These admins can access every private ticket under those channels; this is Discord's intended security model.

A parent channel must be a normal Discord **text channel (type 0)**. Forum, Media, or Announcement channels cannot host these private tickets. The bot checks that and reports an error instead of creating a public conversation. Server permissions and private-thread availability must also permit the feature.

## Bot setup and maintenance

Code: `discord-bot/tickets.js` integrated into `discord-bot/worker.js`.

- Existing Cloudflare Worker `community-chat-discord-bot` uses `SAD_MESSAGES` KV with isolated `ticket-*` / `support-ticket-*` prefixes to remember panels and open tickets. No message bodies are stored in KV.
- The Worker cron automatically installs a panel in each channel **once** after deployment, checks for existing posts first, and stores markers so it does not repeat every minute.
- Administrators can run `/setup_tickets` to check the three channels and restore a deleted panel message; it is registered by `discord-bot/register-commands.mjs` and the existing command-registration GitHub Action.
- The Worker deployment is separate from the GitHub command-registration Action. If button presses say **Interaction Failed**, verify the Worker deployment, Discord Interactions Endpoint URL and permissions.

### Optional: invite specific staff automatically

Cloudflare → Workers & Pages → `community-chat-discord-bot` → Settings → Variables and Secrets → add a **plain-text** variable:

`TICKET_STAFF_USER_IDS` = comma-separated Discord **user** IDs (example `111111111111111111,222222222222222222`). Do not enter a role ID; Discord's Add Thread Member API accepts user IDs only.

The bot will invite up to 15 configured staff user IDs into each new private thread so they can see the conversation and receive a mention. Without this variable, admins with **Manage Threads** can still open and answer tickets, but may need to check threads manually.

### Troubleshooting

- **No panel:** Check Read Message History and Send Messages in all three channels; run `/setup_tickets` as a server Administrator.
- **"Cannot hold private tickets":** Convert that category to a regular text channel; update the hard-coded channel ID if it changes.
- **"Missing Access", "Missing Permissions", or Discord HTTP 403:** Confirm the bot has the necessary channel and thread permissions; members need View Channel and Send Messages in Threads.
- **Ticket exists but creator cannot see it:** Add the member back; check View Channel inherited from the parent and that the person has access to the server.
- **Staff cannot see or reply:** Grant Manage Threads and Send Messages in Threads, or add their individual user IDs via `TICKET_STAFF_USER_IDS`.
- **Doesn't appear in slash command list:** Confirm the **Register Discord Slash Commands** GitHub Action completed or rerun it manually.
- **Old thread archived after inactivity:** Clicking the category again attempts to reopen the existing, unlocked private thread.
- **Bot disabled or app removed:** Discord's existing thread messages are retained subject to Discord's own deletion/retention features, but the bot's controls will stop working.

Security: The Worker verifies Discord interaction signatures before handling buttons. It validates ticket category, server, creator and thread ID; checks staff's server/thread permissions for closing; and doesn't expose ticket messages in public channels. Avoid sharing passwords, recovery codes and API secrets even inside private tickets.
