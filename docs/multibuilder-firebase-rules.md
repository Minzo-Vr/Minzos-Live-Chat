# MultiBuilder Firebase rules — required before rooms work

MultiBuilder is implemented in `shapes-colours.html`, but requires a new `multiBuilderRooms` child inside the **existing** Firebase Realtime Database `rules` object. Do not replace your existing chat rules. Add the following sibling entry (with a comma separating siblings):

```json
"multiBuilderRooms": {
  "$room": {
    ".read": "auth != null && auth.token.firebase.sign_in_provider === 'google.com' && $room.matches(/^[A-Z0-9_-]{4,16}$/)",
    "objects": {
      ".indexOn": ["kind"],
      "$id": {
        ".write": "auth != null && auth.token.firebase.sign_in_provider === 'google.com' && $room.matches(/^[A-Z0-9_-]{4,16}$/) && $id.matches(/^o[A-Za-z0-9]{32}$/) && (!newData.exists() || newData.hasChildren(['kind','name','color','position','rotation','scale']))",
        ".validate": "newData.hasChildren(['kind','name','color','position','rotation','scale']) && (newData.child('kind').val() === 'box' || newData.child('kind').val() === 'sphere' || newData.child('kind').val() === 'cylinder' || newData.child('kind').val() === 'cone' || newData.child('kind').val() === 'torus' || newData.child('kind').val() === 'plane' || newData.child('kind').val() === 'imported') && (newData.child('kind').val() !== 'imported' || (newData.child('yeepsPath').isString() && newData.child('yeepsPath').val().length > 0 && newData.child('yeepsPath').val().length <= 240)) && newData.child('name').isString() && newData.child('name').val().length <= 80 && newData.child('color').isString() && newData.child('color').val().matches(/^#[0-9a-fA-F]{6}$/) && newData.child('position/0').isNumber() && newData.child('position/1').isNumber() && newData.child('position/2').isNumber() && newData.child('rotation/0').isNumber() && newData.child('rotation/1').isNumber() && newData.child('rotation/2').isNumber() && newData.child('scale/0').isNumber() && newData.child('scale/1').isNumber() && newData.child('scale/2').isNumber()",
        "yeepsPath": {".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 240"},
        "$other": {".validate": false}
      }
    },
    "members": {
      "$uid": {
        ".write": "auth != null && auth.uid === $uid && auth.token.firebase.sign_in_provider === 'google.com'",
        ".validate": "newData.hasChildren(['name','joinedAt']) && newData.child('name').isString() && newData.child('name').val().length <= 40 && newData.child('joinedAt').isNumber()",
        "x": {".validate": "newData.isNumber() && newData.val() >= -1000 && newData.val() <= 1000"},
        "y": {".validate": "newData.isNumber() && newData.val() >= -1000 && newData.val() <= 1000"},
        "z": {".validate": "newData.isNumber() && newData.val() >= -1000 && newData.val() <= 1000"},
        "yaw": {".validate": "newData.isNumber() && newData.val() >= -7 && newData.val() <= 7"},
        "$other": {".validate": false}
      }
    }
  }
}
```

## Important limitations
- This is an initial shared-room prototype. Anyone with the room code and Google sign-in can edit or delete its objects. Codes are **not** private authentication or access control.
- All builders can edit the same objects. No ownership, edit locks, conflict resolution, moderation, or per-room capacity limit yet.
- The rules do not impose a per-room object quota or coordinate bounds. Do not enable this on a public, untrusted service until rate limiting and abuse controls are added.
- Shared rooms support six basic shapes and Yeeps ZIP blocks identified by `yeepsPath` after the updated Firebase rules are **actually published**. Generic imported 3D models without a matching shared Yeeps path remain local-only. All clients must be able to access the same Yeeps ZIP; otherwise they may see a placeholder cube.
- Editing this Markdown file **does not change live Firebase rules**. Merge the snippet above into the existing Realtime Database rules via Firebase Console → Realtime Database → Rules, preserving all existing chat permissions. A missing or denied `multiBuilderRooms` read/write rule will prevent room joins or block synchronization.
- The builder count uses a presence record and onDisconnect; using Leave may not immediately remove a presence record until disconnect.
- A room link opens the editor with its code prefilled; press Join / Create to connect.
- Test these rules in Firebase Rules Playground before publishing; this document is a proposed configuration, not a claim of deployment.

## Player positions (November 2026)
The editor now writes optional `x`, `y`, `z`, and `yaw` numeric fields to each member record during first-person movement. The member rules above include these fields. Other builders appear as 90%-transparent floating heads with names. These changes must be merged into and published alongside existing Firebase rules; editing this document does not publish rules. Uploaded avatar models are not shared yet.
