# Admin Website & Game Controls (Firebase Spark / free)

Community Hub now has an **Admin Website Controls** button inside **My Account** on the app launcher, and an **Admin** shortcut in the Game Hub header. The settings let verified administrators enable/disable individual Community Hub apps and game entries in real time.

## Admin usage

1. Open [Community Hub](https://minzo-vr.github.io/Minzos-Live-Chat/?interface=selection) and sign into an account with the Admin role or a verified Firebase custom claim `admin: true`.
2. Choose **My Account → Admin Website Controls**. In Game Hub, use **Admin** to open the same panel.
3. Under **Websites & apps**, switch **Disable** on for Chats, Admin AI, Shapes & Colours, Minzify, Minz Apps, Update Centre, Game Hub or Community Browser.
4. Under **Individual games**, switch off a particular Game Hub title such as 2048 or Slope without disabling all games.
5. Toggle the switch off to re-enable a website or game. The change appears in real time to connected clients.

A switch set to **Disable** stores the boolean `true` under `hubSiteAvailability/<key>`. A switch set to **Enabled** stores `false`. Admin read/write permission is verified in Firebase Realtime Database rules, not solely by hidden UI elements. The setting records no passwords or credentials.

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
- If Chats is disabled, visitors are returned to the Hub startup screen, **which stays available to let admins sign in and recover**.
- The site pages `shapes-colours.html`, `minzify.html`, `minzify-spotify.html`, `minzify-youtube.html`, `minzsign.html`, and `update-centre.html` also display an unavailable overlay for non-admin visitors when their parent app is disabled.
- Admins can still enter disabled apps so they can fix problems and toggle them back on.
- Changes synchronize via Firebase's `onValue` listener. If Firebase is offline or rules aren't published, the Hub defaults to **available** to avoid accidental lockouts; rule enforcement for writing changes still applies.

## Limitations

This is a **Hub availability / maintenance control**, not a globally enforced website blocklist. GitHub Pages publicly serves files, so JavaScript cannot guarantee access restriction against visitors who bypass the interface or disable JavaScript. It cannot block independent sites like YouTube or Spotify across the internet, or remove third-party games from their original hosts. For enforceable website shutdowns, you would need hosting or a controlled server/edge layer that can check permissions before serving the protected content.

**No Cloud Functions or billing upgrade** is needed for the availability switches on the Firebase Spark plan within free quotas. The new rules must be published manually; GitHub commits do not update your live Firebase rules.

## Code

- `hub-site-controls.js` — Firebase listeners, admin authorization UI, switches, website/game state, and read-only guards.
- `hub-site-controls.css` — admin panel and maintenance screen styling.
- `index.html` — loads controls and integrates Game Hub availability checks.
- Each supported app's HTML loads the same availability module to present an unavailable notice when disabled.

The existing account sign-in, app launcher, Cloudinary, GIPHY, custom roles, chat and game content remain intact.
