# Chat+ emoji reactions — Realtime Database rules

The Community Chat front end uses the dedicated path `chatMessageReactions/{general|room1..room5}/{messageKey}/{emojiId}/{uid}`. It listens to counts in real time without modifying or rewriting another person's message. **Only the signed-in Plus or Admin account may add/remove its own reaction**; other signed-in members can see reaction counts in General Chat, and members of a private room can view reactions in that room.

## Required setup before reactions work

1. In the **Firebase Console → Build → Realtime Database → Rules**, **make a backup of the currently published rules**. Do not reset the database or replace the current rules with only this example.
2. Add the `"chatMessageReactions"` child below as a **sibling** of existing top-level nodes like `chatMessages`, `roomMessages`, `chatRoles`, and `rooms` under the current `"rules"` object.
3. Preserve *all* other existing rules, roles, Cloudinary/GIPHY settings, and existing chat paths. Publish the **merged** rules in Firebase.
4. Test with a Plus user and a regular member. Plus should be able to add/remove their own reaction; regular members should see counts but receive `PERMISSION_DENIED` on reaction writes. Test Room 1 membership too.

**Do not paste this small object over the whole rules document.** It is a new *child* of the existing top-level `rules` object and requires the other nodes to remain intact.

```json
{
  "chatMessageReactions": {
    "$room": {
      ".read": "auth != null && ($room === 'general' || ($room.matches(/^room[1-5]$/) && root.child('rooms').child($room).child('members').child(auth.uid).exists()))",
      "$messageId": {
        "$emojiId": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid && $messageId.matches(/^[-A-Za-z0-9_]{12,100}$/) && $emojiId.matches(/^(thumbsup|heart|joy|sob|open_mouth|cry|rage|fire|tada|skull|eyes|pray|100|sunglasses|partying_face|sparkles)$/) && (!newData.exists() || ((root.child('chatRoles').child(auth.uid).child('plus').val() === true || root.child('chatRoles').child(auth.uid).child('admin').val() === true || auth.token.admin === true) && ($room === 'general' || ($room.matches(/^room[1-5]$/) && root.child('rooms').child($room).child('members').child(auth.uid).exists())) && (($room === 'general' && root.child('chatMessages').child($messageId).exists()) || ($room.matches(/^room[1-5]$/) && root.child('roomMessages').child($room).child($messageId).exists()))))",
            ".validate": "newData.val() === true"
          }
        }
      }
    }
  }
}
```

### Security notes

- Rules check Firebase authentication, Plus/Admin roles in `chatRoles/{uid}`, or the verified `auth.token.admin` claim. Client-only toggles do **not** count as secure role enforcement.
- A user can only write `/{theirOwnUid}`, either adding the boolean `true` or deleting their own reaction.
- Reaction types are allowlisted (thumbsup, heart, joy, sob, open_mouth, cry, rage, fire, tada, skull, eyes, pray, 100, sunglasses, partying_face, sparkles).
- New reactions require an existing message under `chatMessages/{messageKey}` or `roomMessages/{roomN}/{messageKey}`, as appropriate.
- Private-room reads require membership at `rooms/{roomN}/members/{uid}`. This is intentionally stricter than some room discovery workflows.
- If any **ancestor** has a broad `.write` grant (for example, `".write": "auth != null"` at the root), Firebase rules cannot restrict access by adding a deeper `.write` rule. Review existing ancestors before claiming Chat+ exclusivity. Place the rule under a restrictive parent or revise the broad ancestor first.
- Deleting a message does not automatically delete its reaction records. These are hidden when the message disappears; for storage hygiene, a trusted backend cleanup task can remove orphaned records later.
- If `chatRoles` in your deployed database uses a different schema (such as string roles rather than boolean `plus`/`admin` children), adapt the role test against **your actual deployed schema** before publishing. The site currently accepts both formats, but this rules example checks boolean role entries and the admin claim.

## How the user interface works

Everyone can type `:sob:` for 😭, `:joy:` for 😂, `:skull:` for 💀, and other supported shortcodes, with suggestions while typing. This is a front-end feature and needs **no rule changes**.

Users with a Plus or Admin role see **😊+** in the actions of General Chat and room messages. The picker supports 16 popular reactions; members without Chat+ see the counts but cannot react. Clicking an existing reaction toggles the current user's vote.

The new reaction UI is committed to `index.html`, but **live reactions remain disabled by Firebase `PERMISSION_DENIED` errors until these Realtime Database rules are merged and deployed**. This document is setup guidance; a GitHub commit is **not** a Firebase rules deployment.
