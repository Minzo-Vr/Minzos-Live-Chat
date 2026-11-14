# Admin Website & Game Controls (Firebase Spark / free)

Community Hub has an **Admin Website Controls** button inside **My Account** on the app launcher, and an **Admin** shortcut in the Game Hub header. Verified admins can disable individual apps and games for **everyone, including administrators**. To open a disabled experience, an admin must enter the separately configured four-digit unlock PIN. Regular members cannot unlock disabled apps.

## Admin usage

1. Open [Community Hub](https://minzo-vr.github.io/Minzos-Live-Chat/?interface=selection) and sign into an account with the Admin role or a verified Firebase custom claim `admin: true`.
2. Choose **My Account → Admin Website Controls**. In Game Hub, use **Admin** to open the same panel.
3. Under **Websites & apps**, switch **Disable** on for Chats, Python Editor, Admin AI, Shapes & Colours, Minzify, Minz Apps, Update Centre, Game Hub or Community Browser.
4. Under **Individual games**, switch off a particular Game Hub title such as 2048 or Slope without disabling all games.
5. To open a disabled app as an admin, press its **🔐 Unlock** action and enter your four-digit PIN. Unlock is per experience for 15 minutes in the current tab; the disabled status remains in effect for other users.
6. Toggle **Disable** off in My Account to fully re-enable an app or game. My Account remains accessible; opening the admin switch panel now requires the Admin PIN.

A switch set to **Disable** stores the boolean `true` under `hubSiteAvailability/<key>`. A switch set to **Enabled** stores `false`. Admin read/write permission is verified in Firebase Realtime Database rules, not solely by hidden UI elements. The setting records no passwords or credentials.

## Lock for Roles (new)

**Python Editor** is listed in the **main Community Hub app launcher** alongside Chat, Minzify, and Shapes & Colours. It is not a browser game. It defaults to Simple Python; MIP (Minzo’s Important People) and Admin accounts may open Advanced Python. The same Admin Website Controls panel now includes a collapsible **🔐 Lock for Roles** section beneath every Hub app and every Game Hub game, including Python Editor.

To set a role lock:

1. Sign in to a verified Admin account and open **Game Hub → 🛠 Admin** (or **My Account → Admin Website Controls**); enter the existing Admin PIN.
2. Scroll to the desired app or game and expand **Lock for Roles**.
3. Tick any combination of **Signed-in members**, **MIP**, **Moderator**, **Test Subject**, and **Admin**.
4. Press **Save role lock**. The allowed roles are stored under `hubSiteRoleLocks/<appKey>` and update in real time for open browsers.
5. Use **Allow everyone** to remove the role lock without changing the separate **Disable** switch. An empty selection means everyone is allowed.

"Signed-in members" means **all non-guest signed-in accounts**, including those that have additional roles. Choose **MIP / Moderator / Test Subject** without Members for more selective access. A user who has multiple roles only needs one matching role. Admins can always bypass **role** restrictions to avoid permanently locking out management, but a globally **Disabled** app still requires its existing Admin PIN unlock.

Role locks and **Disable** are independent: Disable overrides role permissions. Locking `game-hub` restricts opening the whole Game Hub; locking `game-python-editor` restricts only Python Editor. Users with insufficient roles see a lock label rather than being able to open the app through the Hub UI.

**Firebase rules setup:** The repository's live rules source is [`database.rules.json`](../database.rules.json), which now contains `hubSiteRoleLocks`. The rules grant public read access to the policy and **only verified admins** may change it; unsupported app keys and role names are rejected. The new rules must actually be **deployed** to Firebase Realtime Database via the repository deployment workflow or Firebase Console before settings can be saved.

**Security limitation:** This locks the **navigation/interface** of the GitHub Pages application. GitHub Pages static HTML and JavaScript are still publicly accessible. Do not use client-side role locks alone to protect sensitive files, API operations, or database data; secure those separately using Firebase rules or a server.

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

## Required Firebase rules deployment

Do not use historical downloadable rules files; the repository's full [`database.rules.json`](../database.rules.json) is the current source containing all app settings, Python room permissions, and role locks. Verify that the [Firebase rules publishing workflow](../.github/workflows/publish-firebase-rules.yml) succeeds with its configured service-account secret, or review and publish the complete file in Firebase Console → Realtime Database → Rules. Never replace a newer live rules version without comparing first.

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
