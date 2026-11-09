# Community Hub — Admin User Search

## What was added

An **Admin User Search & Profile Inspector** lives in Community Chat → Admin login → Verified admin. It searches Firebase Auth users by **username, email address, or Firebase user ID**, then offers a **View profile** read-only inspector. Account information displayed includes: profile name, UID, community roles, profile visibility, public avatar/bio, sign-in provider names, created date, last sign-in, and disabled status.

**This feature does not sign the admin in as another user.** It never generates impersonation credentials, opens private DMs, reveals passwords or Firebase tokens, or changes account ownership.

The callable verifies the current Firebase authenticated caller **on the server** against `chatRoles/{uid}/admin === true`, legacy `chatRoles/{uid} === "admin"`, or a verified `admin` custom claim. Client-side panel visibility is only a convenience. Unauthorized callers receive `permission-denied`. The callable also refuses disabled accounts.

Profiles with Friends-only or Private visibility have **hidden bio and avatar**, even for admins. Search still includes usernames, UID and email matching so moderators can find an account for legitimate support.

## Deployment — required before user search works

The GitHub changes alone **do not deploy the function**. The UI may show that the Firebase function hasn't been deployed yet.

1. Use a machine with Node.js 22 and the Firebase CLI (`npm install -g firebase-tools`) and your authorized Firebase account.
2. In the repository folder, run `cd functions && npm install` (needed for existing Functions dependencies, including `web-push`), then go back to the repository root.
3. Confirm that the Firebase project `website-chat-80038` supports Cloud Functions deployment. Firebase may require the **Blaze billing plan**; check billing and any charges before proceeding.
4. Run this from the repository root:
   ```sh
   firebase login
   firebase deploy --project website-chat-80038 --only functions:searchCommunityUsers
   ```
5. Open Community Chat, sign in as a real admin, expand **Admin login** and then **User Search & Profile Inspector**. Search for a known member, then select **View profile**.
6. Confirm that a regular member cannot invoke the `searchCommunityUsers` callable. Test privacy with a user who has set their profile visibility to **Friends only** or **No one**.

## Firebase rules

**No Firebase Realtime Database rules changes are needed.** This feature accesses Firebase Auth and profile data through a server-side Firebase Admin SDK authenticated callable. Firebase Admin SDK database reads bypass Realtime Database rules. Do not broaden `chatProfiles` read permissions to enable searching.

## Implementation

- `community-admin-user-search.js`: Admin panel search and read-only profile display.
- `community-admin-user-search.css`: responsive admin UI.
- `functions/admin-user-search.js`: authenticated search callable, admin authorization, limited results, privacy filtering, and audit logging to `chatActivityLog`.
- `functions/index.js`: exports `searchCommunityUsers`.
- `index.html`: Admin panel UI and script/style references.

The callable scans up to 1,000 Firebase Auth accounts per request and returns up to 25 matches per page. The UI supports paging through additional batches, and only returns whitelisted account metadata. A large site may need more efficient server indexes and request-rate limits.

Search logs record who searched and how many matches were returned, **not** the actual email address, search term or account tokens.

Current Firebase roles, DMs, chats, login methods, admin access checks, Cloudinary and GIPHY settings remain unchanged.
