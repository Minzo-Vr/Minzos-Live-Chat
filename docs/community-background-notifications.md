# Community Chat — notifications after closing the website

Community Chat now has **opt-in background Web Push scaffolding**. The website code is committed, but **push delivery is NOT live until the Firebase backend and VAPID keys are configured and deployed**.

## Events and settings

- Published announcements under `chatAnnouncementPublished/{releaseId}` → generic background notification to opted-in devices (no private content).
- Newly assigned roles under `chatRoles/{uid}` → generic notification only to opted-in devices of the affected account.
- Existing foreground mention notifications, announcement alerts, role alerts, the notification checkbox, and **Do Not Disturb** are preserved. Background mention notifications are **not yet enabled**; mentions still require the site to be open.
- Users explicitly tap **Enable notifications after closing** in Community Chat → Settings → User Settings → Announcements & Notifications.
- A permission grant **alone does not mean push is connected**. The UI reports success only when a subscription is saved by the authenticated Firebase callable function.
- Do Not Disturb and the notifications checkbox synchronize the active/paused state with the server for that browser after they change.
- **Turn off background notifications** unsubscribes this device. Signing out also unsubscribes the device to prevent account crossover.

## Required owner setup (not completed by a GitHub commit)

1. Generate a standard Web Push VAPID key pair using `npx web-push generate-vapid-keys` on a trusted computer.
2. Place **ONLY the public key** in the root `community-push-config.js`, replacing `window.COMMUNITY_CHAT_VAPID_PUBLIC_KEY = "";`. Do **not** put the private key in GitHub, chat, JavaScript, or browser storage.
3. In the repository's `functions` directory, run `npm install` to install `web-push` alongside the existing Firebase libraries.
4. Create a local `functions/.env` with `CHAT_PUSH_VAPID_PUBLIC=YOUR_SAME_PUBLIC_VAPID_KEY`. This is a non-secret public key, but avoid accidentally checking in configuration files.
5. Store the private key with the Firebase CLI: `firebase functions:secrets:set CHAT_PUSH_VAPID_PRIVATE --project website-chat-80038`. Enter the VAPID **private key** only into the Firebase CLI prompt.
6. Firebase Cloud Functions generally requires the **Blaze billing plan**, and deployment can incur costs. Check the actual Firebase project plan, billing permissions, and quotas before continuing. Do not enter payment details you do not control.
7. Deploy the three functions from the repository root (using an authorised Firebase account):
   `firebase deploy --project website-chat-80038 --only functions:setChatPushSubscription,functions:sendCommunityPushAnnouncement,functions:sendCommunityPushRole`.
   The existing `postCommunityAnnouncement` Discord webhook function should not be deleted or modified.
8. Verify Realtime Database rules deny all browser **reads/writes** to `chatPushSubscriptions`; the callable Firebase Admin SDK exclusively manages subscriptions. A child-level `.read:false` **does not override** a broadly permissive parent-level read. Do not overwrite other chat rules. To protect the credentials stored in this branch, verify against the current published rules first.
9. On an HTTPS device and signed-in Community Chat account, open **Settings → User Settings → Announcements & Notifications → Enable notifications after closing**. Allow notifications and verify the success message. Test by publishing a fresh announcement and then closing the app.

## iPhone/iPad notes

The app already has a standalone `manifest.webmanifest`. On **iOS/iPadOS 16.4+**, open Community Chat in Safari and choose **Share → Add to Home Screen**. Launch it from the new Home Screen icon and tap the background notifications button there. Apple's web push permission must be requested as a result of user interaction. Safari tabs, Google Sites embedded frames, or unsupported web views may not support this. No Apple Developer membership is necessary.

## Architecture and security

- `community-push-sw.js`: site-scoped service worker showing notifications immediately on receipt and opening the Community Chat app on tap.
- `community-push-client.js`: user opt-in, permission, VAPID subscription, Firebase Auth callable registration, DND state and device unsubscribe.
- `functions/push-notifications.js`: Firebase Callable `setChatPushSubscription` with server-side account binding, RTDB triggers for published announcements and role assignments, and `web-push` delivery. Client cannot specify another UID, notification content or URL.
- `chatPushSubscriptions/{uid}/{hashOfEndpoint}`: subscription endpoint and encryption keys. These are sensitive account/device tokens; never grant clients blanket read access to this path or log the endpoints.
- There is a 1,000-user fan-out cap on announcement sending and a 12-device per-user send cap. A larger community needs batching/queues, unsubscribe cleanup and operational monitoring.
- Sending requires server execution. Merely registering a service worker or granting browser permission **cannot** send a notification after the site is closed. Browser/device power saving and network conditions can delay push delivery.
- Background notifications intentionally contain generic titles and no message text or private role names.

References:
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://firebase.google.com/docs/functions/database-events
- https://firebase.google.com/docs/functions/callable
- https://github.com/web-push-libs/web-push
