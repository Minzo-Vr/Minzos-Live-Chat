# Community Hub — Block and unblock member accounts (free Firebase plan)

**Status:** The website code is committed to `main`. Before blocks work, the owner must publish the **complete** Firebase Realtime Database rules file named `community_hub_firebase_rules_user_blocking.json` supplied in the ChatGPT conversation. No paid Cloud Functions or billing plan is needed for this feature on Firebase's Spark plan within quotas.

## Using the feature

1. Open [Community Hub](https://minzo-vr.github.io/Minzos-Live-Chat/?interface=selection), then sign in with a Firebase account that has Admin permissions.
2. Go to **My Account → 🚫 Block / Unblock Users**. Alternatively, open **Admin login → User Search & Profile Inspector**, find a user, select **View profile → 🚫 Block from Community Hub**. There's also a **Block users** shortcut in the Game Hub header.
3. Choose the member's Firebase UID, enter a reason, and select **Block user**.
4. The user sees **Access suspended**, including the reason. Their signed-in Firebase account is also denied protected Realtime Database reads and writes by rules.
5. To restore access, use **Unblock** from the blocked users list or paste their UID and select **Restore access**.

Blocks synchronize in real time across open browser sessions. Blocked users can sign out/switch accounts; the ban only applies to the blocked Firebase UID. Admins cannot block themselves or another account with an Admin *database role*. A Firebase custom-claim admin account without an Admin database role should also be protected operationally; keep a separate owner emergency account.

## Rules setup and security

The downloadable complete rules file contains 31 top-level sections: all 30 sections from the previously supplied `community_hub_firebase_rules_website_controls.json`, plus `hubBlockedUsers`. To prevent bypass by calling Firebase directly, it **adds a block check to 76 existing protected read and write rules**. The underlying existing authorization and validation logic is unchanged. Public configuration reads remain public.

Save a backup of the currently published Firebase rules, then **replace the entire Realtime Database → Rules editor** with the full JSON from ChatGPT and select **Publish**. If rules changed after the prior file was generated, compare/reconcile first—do not blindly overwrite newer rules.

The new database path is `hubBlockedUsers/{uid}`. A record contains `blocked: true`, `name`, `reason`, `by` (blocking admin UID), and `at` (Firebase server timestamp). The blocked account can read **only its own block record**; verified admins can read the list. Only verified admins can create or delete records. The rules reject attempts to block oneself or an account with the Admin database role, and restrict record shape, timestamps, lengths and identity. The user directory and public profiles remain unchanged.

## Limits — important

**This is Firebase account blocking, not a permanent physical block of a person or IP.** GitHub Pages serves static HTML publicly, and browser JavaScript cannot prevent requests to public files. Someone can sign out, register another account, visit as a guest where supported, disable JavaScript, or go straight to an independently hosted third-party website. The new rules stop the *blocked Firebase account* from using protected database operations, which is the meaningful server-side restriction on the free plan.

To strictly deny entire-site downloads before any webpage is served, host the website behind an authenticated server or edge layer that evaluates access before serving content (and restrict the origin so it can't be reached directly).

## Files

- `hub-user-access.js` — real-time account suspension check, admin block/unblock forms, block list and User Search integration.
- `hub-user-access.css` — admin controls and suspended-account display.
- `community-admin-user-search.js` — adds **Block from Community Hub** to the Admin User Search profile.
- `index.html` and six standalone app pages — include the blocking client.
- `community_hub_firebase_rules_user_blocking.json` — complete downloadable rules file shared in ChatGPT (not committed to source code).

**No existing Firebase/Auth credentials or Cloudinary/GIPHY settings were altered.** There are no new Cloud Functions or Firebase billing changes.
