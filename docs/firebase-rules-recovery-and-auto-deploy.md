# Firebase Rules Recovery and Automatic Deployments — 10 November 2026

This repository now stores the complete, corrected Community Hub Realtime Database rules at [`database.rules.json`](../database.rules.json) and an automatic deployment workflow at [`.github/workflows/publish-firebase-rules.yml`](../.github/workflows/publish-firebase-rules.yml).

## What was repaired

- The prior database rules rejected valid Firebase custom-token sign-ins (including Community Hub's Discord login) in 45 guarded read/write permissions. These now explicitly allow `firebase.sign_in_provider === 'custom'` alongside Google, password, and the existing conditionally enabled anonymous provider.
- The Community Chat interface incorrectly demanded an `admin` **custom claim** for clearing all chat messages, deleting the oldest messages, approving a vote to clear, and signing in through the special Admin login form. The code now also honors a **verified database Admin role** in `chatRoles/{uid}/admin: true` or legacy `chatRoles/{uid}: "admin"`.
- Moderator, Plus, and Friend access **do not** automatically confer full Admin powers. The account must actually have an Admin role or claim.
- The client account-ban check will no longer lock out every account when Firebase blocks the ban lookup because rules aren't configured. Accounts explicitly marked blocked remain denied protected RTDB operations by the new rules.

## Emergency recovery — fastest method

If Community Hub is currently inaccessible, **do not wait for GitHub Actions setup**. Access Firebase Console using a project owner account:

1. Go to https://console.firebase.google.com/project/website-chat-80038/database and open **Realtime Database → Rules** (NOT Cloud Firestore rules).
2. **Make a backup** of the rules currently displayed.
3. Open the full file `database.rules.json` in the GitHub repository (or use the full JSON file supplied as a ChatGPT download). Select all contents and paste them into the Firebase Rules editor, replacing the existing rules.
4. Press **Publish**. If Firebase rejects a rule, save the full error message and line number; do not replace the rules with `{ ".read": true, ".write": true }`.
5. After publishing and deploying GitHub Pages, reload Community Hub (try a fresh tab) and sign in normally. Existing accounts retain their existing UID and profile data.
6. Grant trusted people admin privileges individually using **Admin login → member profile → Assign roles → Admin → Save**. Do not grant everyone admin just because they are friends.

**Important**: GitHub commits do NOT immediately update live Firebase security rules. A live Firebase deployment still requires an authenticated authorized owner/service account.

## One-time automation setup — GitHub Actions

This uses GitHub Actions and Firebase CLI to deploy rules changes automatically, with no Cloud Functions and no required Blaze upgrade for the rules deployment itself.

### 1. Create a deployment identity

Use a Firebase/Google Cloud service account authorized to manage the Realtime Database rules for `website-chat-80038`. Prefer a dedicated, least-privilege service account if you can set one up. If using **Firebase Console → Project settings → Service accounts → Generate new private key**, treat the downloaded JSON key as a high-privilege secret. Do not paste the JSON file into ChatGPT or commit it to GitHub.

If your organization supports Google Cloud Workload Identity Federation, that is safer than a long-lived service account key, but it requires extra Google Cloud configuration. This workflow supports a secret JSON key for straightforward initial setup.

### 2. Add the secret to GitHub

1. Open https://github.com/Minzo-Vr/Minzos-Live-Chat/settings/secrets/actions
2. Select **New repository secret**.
3. Name: **`FIREBASE_SERVICE_ACCOUNT_JSON`**
4. Value: paste the **entire contents** of the service account JSON private key file. Save.
5. Do not share or put this credential in a source file, chat message, or screenshot.

### 3. Deploy once, then updates become automatic

1. Open https://github.com/Minzo-Vr/Minzos-Live-Chat/actions/workflows/publish-firebase-rules.yml
2. Choose **Run workflow → main → Run workflow**.
3. Check that **Validate database access policies** and **Deploy reviewed database rules** both succeed.
4. After this setup, **every committed edit to `database.rules.json` on `main` automatically triggers validation and deployment**. Changes to `firebase.json`, the test script, or workflow also trigger it.
5. Use the Firebase Console to confirm the published rules. The workflow deploys **only** Realtime Database rules; it does not deploy or modify hosting, auth users or Cloud Functions.

If the workflow reports missing `FIREBASE_SERVICE_ACCOUNT_JSON`, the secret has not yet been configured. If the service account lacks permission, update its IAM role rather than posting the JSON key.

### Never let console edits be overwritten

Once the workflow is enabled, edit the **GitHub `database.rules.json`** file as the source of truth, not only the Firebase Console. GitHub Actions overwrites current Firebase Console rules with the committed file whenever triggered. Before making any future change, copy the current published rules back into the repository if they have diverged.

## What admin permissions mean

- A friend without an Admin role is still a regular member.
- A Moderator may moderate members but **cannot** clear everyone's messages, change the site's main settings, or grant full Admin roles.
- An assigned Admin role under `chatRoles/{uid}/admin: true` is recognized by the Community Chat admin controls and existing Firebase rules.
- Admin AI uses a **separate server-side verified custom-claim requirement**. Giving someone a database role doesn't automatically grant that Worker-backed Admin AI access; do not bypass server-side admin verification.

## Test coverage and limits

- `node scripts/test-firebase-rules.mjs` performs smoke tests for role-vs-claim Admin powers, custom-token chat access, blocked-user denial and directory restrictions.
- The complete JSON is valid JSON and has 31 top-level rule sections. The changes retain bans, roles, messages, friends, games, push-subscription protections and other existing paths.
- A **Firebase emulator test or actual Firebase deployment** is still needed to confirm full rules-engine compatibility. Never treat JSON parsing and simulated expressions as proof of live deployment.
