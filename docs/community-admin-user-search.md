# Admin User Search — free Firebase Spark setup

The Community Hub **Admin User Search & Profile Inspector** now runs on the Firebase Spark plan. **No Firebase Cloud Functions, Blaze plan, Cloudflare Worker, or payment method is required.** The web interface is committed to `main`, but the new **Realtime Database rules must be published manually**.

## Install the complete Firebase rules

A ready-to-paste, full database rules JSON was generated in ChatGPT as `community_chat_firebase_rules_free_admin_search.json`. It preserves all 28 sections from the user's previously supplied full rules (including `chatPushSubscriptions`) and adds the 29th section `chatAdminUserDirectory`.

1. Download and open that JSON file in ChatGPT.
2. Open [Firebase Console](https://console.firebase.google.com/project/website-chat-80038/database) → **Realtime Database → Rules**.
3. Make a backup of the currently published rules.
4. Replace the entire contents of the Rules editor with the complete JSON file and **Publish**.
5. Refresh [Community Hub](https://minzo-vr.github.io/Minzos-Live-Chat/), then have members sign in. Their names will be registered in the new directory.
6. Sign in with an account that actually has the Admin claim/role; open **Admin login → User Search & Profile Inspector** and search by username, UID or exact verified email.

**Important:** Existing users must sign in once after the update before their usernames appear in the new directory. Previous Firebase Authentication accounts **cannot** be enumerated with Realtime Database rules alone. Verified emails already indexed through `chatEmailDirectory` can be searched exactly, subject to existing read rules. Name and UID search covers currently registered directory records.

## New Realtime Database rules section

This is for review **only**. Users should paste the full updated JSON file rather than mixing pieces manually.

```json
"chatAdminUserDirectory": {
  ".read": "auth != null && (auth.token.admin === true || root.child('chatRoles/'+auth.uid).val() === 'admin' || root.child('chatRoles/'+auth.uid+'/admin').val() === true)",
  "$uid": {
    ".write": "auth != null && auth.uid === $uid",
    ".validate": "newData.hasChildren(['name','updatedAt']) && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 80 && newData.child('updatedAt').isNumber() && newData.child('updatedAt').val() >= now - 600000 && newData.child('updatedAt').val() <= now + 600000",
    "name": {
      ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 80"
    },
    "updatedAt": {
      ".validate": "newData.isNumber() && newData.val() >= now - 600000 && newData.val() <= now + 600000"
    },
    "$other": {
      ".validate": false
    }
  }
}
```

## Privacy and permissions

- Only a caller verified by Firebase RTDB rules as Admin (custom `admin` claim or Admin role in `chatRoles`) may read the user directory.
- Members can only create/update/delete their own directory record, consisting of their chosen username and update timestamp. No email addresses, passwords, private chats, auth tokens or profile pictures are stored in this new directory.
- Exact email matching reuses the previously existing `chatEmailDirectory` query. That directory only contains verified email accounts that have registered on sign-in. The query-based read rule restricts lookups to admins or moderators; the new UI additionally lives inside the Admin-only panel.
- The inspector reads a member's public bio/avatar through existing `chatProfiles` rules and does **not** bypass Friends-only or Private profile restrictions.
- Profile information is read-only, and the browser **never signs in as someone else**.
- Last sign-in dates, disabled authentication status and Firebase Auth account enumeration are **not** available in this free browser-only version. It shows when the directory record was updated instead.
- Large directories require server-side search/indexing to stay efficient; this version downloads the admin-only directory when an admin explicitly searches.

## Deployment status

No Firebase Functions deployment is necessary. The only remaining manual action is publishing the new Realtime Database rules from the complete JSON file. The older `functions/admin-user-search.js` callable is **not exported or used** by the site.

The existing Firebase configuration, chat features, Cloudinary, GIPHY, Community Hub apps, roles, and notification feature code remain unchanged. The push notifications added previously still require separate backend configuration and deployment; this free admin search does not activate push delivery.
