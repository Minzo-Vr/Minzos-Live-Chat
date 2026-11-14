# Python Editor Live — collaborative coding rooms

Python Editor is a first-class app on the **main Community Hub launcher**, not inside the separate browser-games Game Hub. It supports Simple Python for everyone and MIP Advanced Python for MIP/Admin accounts. Both modes use the same underlying program and collaboration engine.

- **Private projects:** Each Firebase user owns their code under `hubPythonProjects/<uid>/<projectId>`; other users, including other admins, cannot read it through the app's Realtime Database security rules.
- **Live collaboration rooms:** A room owner authorizes named Firebase accounts. Only approved members can view and edit shared code and see shared runs.

The UI is inspired by the code-and-output workflow of CS in Schools' Python Editor; it does not copy that site's code or offer its full step debugger.

## Create and share a live room

1. Sign in to Community Hub. From the main app launcher, open **Python Editor**; in Simple mode select **Collaborate**.
2. Under **👥 Shared coding rooms**, press **New room**, give it a name, and wait for the **Connected** indicator.
3. Press **Copy invite link** and send it to a collaborator. They must sign in with their own Community Hub account. They will see **Request access**, which sends their request to your room.
4. As owner, open **Pending access requests** in your room and press **Approve**. The requester is then added to the room and its private room list; if they have the invite page open, it will try to open automatically after approval.
5. Alternatively, have the other user press **Copy my ID**, send the Firebase account UID to the owner, and have the owner paste it under **Invite by Firebase account ID**.
6. When multiple people have opened the room, the editor and connected-member list update in real time. Members may type at the same time.
7. **Run for everyone** executes the current shared code in the person who clicked Run's browser and broadcasts its console output to every approved collaborator. The code is **not** run separately in everyone else's browser; they all see the same run's output. The initiator can press Stop. An independent run by a collaborator becomes the newest visible shared run.

## Live document design

`python-collab.js` uses **Yjs** CRDT binary updates and atomic **Firebase Realtime Database transactions**. Each participant retains a local Y.Doc; concurrent edits are merged rather than last-writer overwriting the entire text. Updates are stored as base64-encoded merged Yjs state under:

- `hubPythonRooms/<roomId>/document` — shared CRDT state, updated timestamp.
- `hubPythonRooms/<roomId>/members/<uid>` — owner's approved collaborators.
- `hubPythonRooms/<roomId>/presence/<uid>` — approximately online collaborators; entries are removed on disconnect when possible.
- `hubPythonRooms/<roomId>/runs/<runId>` — member-authored run snapshots and a shared output/status stream.
- `hubPythonRoomRequests/<roomId>/<uid>` — self-authored requests viewable by the owner.
- `hubPythonRoomIndex/<uid>/<roomId>` — each signed-in member's private list of room links.

An invite link **does not** bypass membership permissions. A UID is not a password. The owner can remove an approved account in the room's **Collaborators** panel, which prevents that account's subsequent Firebase reads/writes; previously viewed code cannot be retracted from someone's memory or exported files.

The collaboration rooms are deliberately separated from personal projects. While editing in a shared room, personal project Save/Load/New/Import/Delete actions are disabled; leave the room to return to private-project mode. Downloading a `.py` export remains available.

## Required Firebase setup

The repository's `database.rules.json` adds three rules sections:

- `hubPythonRooms` — only approved members and the owner can read the code; only the owner can grant/revoke membership; only members can edit the room or publish a run.
- `hubPythonRoomRequests` — unapproved signed-in users can request access to a specific room without reading its private content; only the owner can list requests.
- `hubPythonRoomIndex` — every account sees only its own room list and an owner may add approved invitees.

**These rules must be published to Firebase Realtime Database before shared rooms work.** GitHub commits do not by themselves publish live database rules. If configured, GitHub Actions workflow `.github/workflows/publish-firebase-rules.yml` can deploy them; otherwise the project owner must review and publish the complete database rules file in Firebase Console. Do **not** fix permissions by enabling `.read: true` or `.write: true` globally.

The JavaScript is publicly hosted, but the saved room contents are protected by Firebase RTDB permissions. This is not end-to-end encryption: Firebase project owners/admin service accounts can access backend data.

## Practical limits

- Maximum code length per private/shared script: 20,000 characters.
- Shared merged CRDT state: up to 200,000 base64 characters (the UI stops synchronization near 190,000).
- Run input: up to 6,000 characters; shared console output: up to 59,000 characters.
- Python runs in a browser worker through Pyodide, and a running program has a 20-second execution limit after the runtime is loaded.
- Users must remain online for live sync. Connection/presence indicators are approximate, particularly with multiple browser tabs using the same account.
- Concurrent editing uses a text-area/Yjs binding, not the full Google Docs editor experience (there are no in-text remote cursor markers, per-keystroke authorship colors, rich comments, or document revision UI).
- Keep or download backups of important code. The merged Yjs state can grow with repeated edits, and excessive writes/runs increase Firebase usage. Only execute code you trust, especially code edited by collaborators.
