# Discord `/applications` — Automatically open/close Google Forms

The bot supports two types in its existing Discord command:

- **Moderator** → Google Form **Moderator 🛡️ Forms**
- **Test Subjects / Lab Rats** → Google Form **Test Subjects 🧪 Application**

When an authorized Discord administrator uses `/applications` with **Open** or **Closed**, the bot sends a signed request to a Google Apps Script Web App. Apps Script runs with the authorized Google account's Forms permissions, updates the matching form, verifies `isAcceptingResponses()`, and returns success/failure. **Only after success** does the Discord bot post the announcement. If the form cannot be changed, no success announcement is posted. Old responses are preserved.

The separate **Co-Owner 💎 Applications** form is deliberately **not** included because the current Discord command does not offer a Co-Owner application type.

## One-time Google setup

1. Open [Google Apps Script](https://script.google.com/home/projects/create) while signed in to a Google account with **edit access to both forms**.
2. Name the project `Community Hub Applications Bridge`. Replace the default `Code.gs` contents with [Code.gs](./Code.gs) from this folder and save.
3. In **Project Settings → Script properties**, add:
   - `MODERATOR_FORM_ID` = ID from the Moderator Google Form's edit URL (`docs.google.com/forms/d/FORM_ID/edit`).
   - `TEST_SUBJECTS_FORM_ID` = ID from the Test Subjects Google Form's edit URL.
   - `APPLICATIONS_BRIDGE_SECRET` = a **unique, long random value** (at least 32 characters). Never store this secret in GitHub or a public document.
4. Click **Deploy → New deployment → Web app**, choose **Execute as: Me** and **Who has access: Anyone** (not *Anyone with a Google account*). Authorize Google Forms permissions with the account that owns/edits the forms. This "Anyone" setting is required for Cloudflare's server-to-server request; the script rejects every call without a fresh valid HMAC signature.
5. Copy the resulting `https://script.google.com/macros/s/.../exec` Web App URL. Use the **deployed /exec URL**, not the editor URL or /dev URL.

**Security:** The code checks the signature, timestamp (2-minute validity), nonce replay cache, valid application types, and stored form IDs. It runs only the requested open/close operation; it does not read form answers. Because it runs as the Google account granting authorization, protect both the Apps Script project and the shared secret. Rotate the secret and redeploy if compromised.

## One-time Cloudflare setup

In Cloudflare, open **Workers & Pages → community-chat-discord-bot → Settings → Variables and Secrets** and create:

| Name | Value | Type |
| --- | --- | --- |
| `APPLICATIONS_WEBHOOK_URL` | Apps Script deployed /exec URL | Text or secret |
| `APPLICATIONS_WEBHOOK_SECRET` | **Exact same** value as `APPLICATIONS_BRIDGE_SECRET` | **Secret** |

Do not replace or delete existing Worker bindings (Discord, Firebase, `AI`, `SAD_MESSAGES`, etc.).

Deploy the updated `discord-bot/worker.js` using the existing Wrangler project (`cd discord-bot && npx wrangler deploy`), preserving the current settings. **Committing to GitHub does not by itself deploy the Cloudflare Worker or create the Apps Script project.**

## How the command behaves

1. Run `/applications` **as a Discord server administrator** in the existing bot's configured guild.
2. Choose `status: Open` or `Closed`, `type: Moderator` or `Test Subjects / Lab Rats`, and a Discord role. When opening, supply the required **HTTPS information link**.
3. Discord acknowledges the command privately while the Google Form is updated.
4. The bot checks the correct Google Form:
   - **Open:** publish the form if necessary, then start accepting responses.
   - **Closed:** stop accepting responses and show an applications-closed message, without deleting submitted responses.
5. Once Google confirms the state, the bot posts the announcement in the configured applications channel and confirms privately. On failure, it reports the error privately **without announcing a change**.

For opening, the bot prefers the Google Form's **actual respondent URL**, returned by Apps Script, over a manually pasted application URL. The existing `apply_url` option remains optional for backwards compatibility.

**Important:** Until *both* Cloudflare bindings are present and Apps Script is deployed, `/applications` will report that automation is not configured and will not post a misleading announcement.

## If it fails

- `Form ID not configured`: check the Script properties and use the **edit** URL form IDs.
- `Unauthorized request`: both bridge secrets must match exactly.
- `Expired request` or `Repeated request`: retry once; check that system clocks are correct.
- `Cannot access Form` or `You do not have permission`: the Apps Script deployment account needs editor access.
- `Google Forms bridge did not return JSON`: check Apps Script Web App access setting and deploy the latest version.
- `Form successfully changed, but Discord announcement failed`: check bot Send Messages permission in the announcements channel. The form state **has already changed**.
