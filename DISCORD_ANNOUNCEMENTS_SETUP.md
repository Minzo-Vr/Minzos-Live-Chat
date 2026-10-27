# Community Chat → Discord official announcements

The `#dev-updates` GitHub Action is separate from this integration.

## Setup

1. Create a fresh webhook in the Discord `#announcements` channel. Keep the URL private; replace any webhook URL previously shared in chat.
2. In the [Firebase Console](https://console.firebase.google.com/project/website-chat-80038/overview), confirm the project is on the **Blaze** plan. Cloud Functions deployment may require billing.
3. On a trusted computer with Node.js, install the Firebase CLI: `npm install -g firebase-tools`. Sign in with `firebase login`.
4. Clone `Minzo-Vr/Minzos-Live-Chat` and run `npm install` inside its `functions` folder.
5. From the repository root, run `firebase use website-chat-80038` (or use `--project website-chat-80038` on the deploy command).
6. Run `firebase functions:secrets:set DISCORD_ANNOUNCEMENTS_WEBHOOK` and paste the **new announcements** webhook when prompted. Do not commit it to GitHub.
7. Run `firebase deploy --only functions:postCommunityAnnouncement --project website-chat-80038`.
8. Publish a *new* release from the Community Chat Announcements admin panel and check the Discord `#announcements` channel.

This function listens for new entries at `chatAnnouncementPublished/{releaseId}`. Editing or republishing an existing entry does not trigger it; the Firebase `onValueCreated` event only fires on creation. Discord mentions are disabled in the payload.

If deployment reports missing permissions, verify you are logged into the account with access to the Firebase project. Check the Cloud Functions logs for failures.

The function is **not active until deployed**, and the secret is not set by adding these files to GitHub.
