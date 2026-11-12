# Admin Website & Game Controls (Firebase Spark / free)

Community Hub has an **Admin Website Controls** button inside **My Account** on the app launcher, and an **Admin** shortcut in the Game Hub header. Verified admins can disable individual apps and games for **everyone, including administrators**. To open a disabled experience, an admin must enter the separately configured four-digit unlock PIN. Regular members cannot unlock disabled apps.

## Admin usage

1. Open [Community Hub](https://minzo-vr.github.io/Minzos-Live-Chat/?interface=selection) and sign into an account with the Admin role or a verified Firebase custom claim `admin: true`.
2. Choose **My Account → Admin Website Controls**. In Game Hub, use **Admin** to open the same panel.
3. Under **Websites & apps**, switch **Disable** on for Chats, Admin AI, Shapes & Colours, Minzify, Minz Apps, Update Centre, Game Hub or Community Browser.
4. Under **Individual games**, switch off a particular Game Hub title such as 2048 or Slope without disabling all games.
5. To open a disabled app as an admin, press its **🔐 Unlock** action and enter your four-digit PIN. Unlock is per experience for 15 minutes in the current tab; the disabled status remains in effect for other users.
6. Toggle **Disable** off in My Account to fully re-enable an app or game. My Account remains accessible; opening the admin switch panel now requires the Admin PIN.

A switch set to **Disable** stores the boolean `true` under `hubSiteAvailability/<key>`. A switch set to **Enabled** stores `false`. Admin read/write permission is verified in Firebase Realtime Database rules, not solely by hidden UI elements. The setting records no passwords or credentials.

## Shared admin-panel PIN gate

Community Hub's admin-facing interfaces now ask for the **same four-digit PIN (7443)** before opening:

- Chat Admin controls (including message timestamp visibility).
- My Account → Admin Website Controls and the Game Hub Admin shortcut.
- My Account → Block / Unblock Users and the Game Hub block-users shortcut.
- Admin AI.
- Admin announcement draft/editor.
- Admin controls on member profiles, including role assignment.

A verified admin role/claim is **still required**; entering the PIN does not grant administrator permissions. The prompt appears again when entering a panel after closing it, and unlocks are kept only in memory in that tab. Standard member sign-in and admin sign-in remain available without a PIN so nobody gets locked out of the login process.

**Security limits:** GitHub Pages serves the JavaScript to everyone. A four-digit PIN checked in browser JavaScript (even as a digest) is a convenience/privacy lock that determined users can bypass. Firebase RTDB security rules and server-side verification remain the actual protection for privileged data and actions. Do not rely on this PIN to protect sensitive data on its own.

## Required Firebase Rules setup

A **complete JSON rules file**, `community_hub_firebase_rules_website_controls.json`, was prepared as a ChatGPT download. It contains **all 29 prior rules sections unchanged**, plus this one new section. It includes the previously added `chatPushSubscriptions` protections and free user search directory.

1. Make a backup of the currently published database rules in Firebase Console → Realtime Database → Rules.
2. Open the complete JSON rules file downloaded from ChatGPT, copy all of its contents and replace the Rules editor contents.
3. Review differences if you've made other rules changes since the preceding full rules file.
4. Press **Publish**. Until then, the website switches show a rules/permissions error.

The added section is shown below *for inspection only*. The downloadable JSON already contains it, so **do not separately append it**:

```json
"hubSiteAvailability": {
  ".read": true,
  "$key": {
    ".write": "auth != null && (auth.token.admin === true || root.child('chatRoles/'+auth.uid).val() === 'admin' || root.child('chatRoles/'+auth.uid+'/admin').val() === true) && $key.matches(/^(chats|admin-ai|shapes-colours|minzify|minz-apps|update-centre|game-hub|community-browser|game-2048|game-cookie-clicker|game-google-dino|game-google-snake|game-retro-bowl|game-slope|game-run-3|game-minesweeper|game-blackjack|game-moto-x3m|game-block-blast|game-gorilla-tag|game-twerk-race-3d)$/) && newData.isBoolean()",
    ".validate": "newData.isBoolean()"
  }
}
```

## What members see

- In the Hub App Store-style grid, a disabled entry is dimmed and labelled **Disabled by admin**; the Open button is disabled, while Preview remains available.
- Game Hub shows disabled games as unavailable; Play won't launch them, and currently open disabled games return to the game list.
- If Game Hub itself is disabled, it closes for non-admin visitors.
- If Chats is disabled, everyone is returned to the Hub startup screen until an admin unlocks Chats. **The startup screen and My Account always stay accessible so administrators can recover.**
- The site pages `shapes-colours.html`, `minzify.html`, `minzify-spotify.html`, `minzify-youtube.html`, `minzsign.html`, and `update-centre.html` display an unavailable overlay when disabled. Verified admins get a **🔐 Unlock with Admin PIN** option on that overlay.
- Admins are also blocked from disabled apps until they enter the four-digit Admin PIN. This grants a 15-minute tab-specific unlock for that app only. My Account and the admin switch panel remain accessible for recovery.
- Changes synchronize via Firebase's `onValue` listener. If Firebase is offline or rules aren't published, the Hub defaults to **available** to avoid accidental lockouts; rule enforcement for writing changes still applies.

## Limitations

This is a **Hub availability / maintenance control**, not a globally enforced website blocklist. GitHub Pages publicly serves files, so JavaScript cannot guarantee access restriction against visitors who bypass the interface or disable JavaScript. It cannot block independent sites like YouTube or Spotify across the internet, or remove third-party games from their original hosts. For enforceable website shutdowns, you would need hosting or a controlled server/edge layer that can check permissions before serving the protected content.

**No Cloud Functions or billing upgrade** is needed for the availability switches or client-side PIN prompts on the Firebase Spark plan within free quotas. The new rules must be published manually; GitHub commits do not update your live Firebase rules.

## Code

- `hub-site-controls.js` — Firebase listeners, admin authorization UI, switches, website/game state, and read-only guards.
- `hub-site-controls.css` — admin panel and maintenance screen styling.
- `index.html` — loads controls and integrates Game Hub availability checks.
- Each supported app's HTML loads the same availability module to present an unavailable notice when disabled.

The existing account sign-in, app launcher, Cloudinary, GIPHY, custom roles, chat and game content remain intact.

## Admin PIN behavior (10 November 2026)

- Admins and members both see the locked state when an experience is disabled. An Admin can request a temporary unlock by entering the owner-configured four-digit PIN.
- The PIN verifier stores a salted-context SHA-256 digest in the public site source, not the plaintext PIN. This is **not cryptographically strong protection for a four-digit PIN**: visitors can inspect and brute-force the public JavaScript.
- Each successful unlock works only for that specific app or game for 15 minutes in that browser tab. Unlocks are tied to the signed-in Firebase account and are cleared when that experience's enabled/disabled switch changes.
- Direct visits to standalone Hub apps display the locked overlay until the app is enabled or the signed-in admin enters the PIN. The Hub launcher and My Account stay accessible.
- **No Firebase Realtime Database rules change is required** for this UI change; the stored disabled flags and admin-only permissions are unchanged.
- For real protection against determined users, a backend/edge authentication check must run **before content is served**. GitHub Pages cannot enforce this site-wide.
