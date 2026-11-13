# Python Editor — private projects in Community Hub

## Open it
1. Sign in to **Community Hub** with your existing Firebase-backed account (Google, Discord, or email).
2. Open **Game Hub** and select **🐍 Python Editor**.
3. Type Python code and press **Run Python**. The first run downloads the Pyodide runtime from jsDelivr, so it needs internet access.
4. Give the project a name and press **Save**. Select a saved project and press **Load** to restore it on another device after signing into **the same account**. Double-clicking a project also loads it.
5. Use **New**, **Delete**, **Import .py**, and **Download .py** as needed.

The editor appears in the Game Hub's admin availability list. If disabled, administrators can unlock that app using the existing admin PIN procedure.

## Private Firebase storage

Projects are written under `hubPythonProjects/{firebaseUid}/{projectId}` with:
- `name`: 1–60 characters
- `code`: up to 20,000 characters
- `updatedAt`: server timestamp

`database.rules.json` denies unregistered readers and checks that `auth.uid === $uid` for both reading and writing project data. **Even a different Admin account cannot read another user's saved code using these client permissions.** The access rule also denies blocked users. Other members can have their own isolated projects.

The UI limits each account to 40 saved projects; this count is a client-side convenience limit, not a hard database quota. Export anything important as a `.py` file for an independent backup.

### Required live database deployment

GitHub committing a rules file does **not** change the Firebase Realtime Database permissions until the updated rules are deployed. The existing [Firebase rules deployment workflow](../.github/workflows/publish-firebase-rules.yml) can deploy automatically if `FIREBASE_SERVICE_ACCOUNT_JSON` is configured and its workflow succeeds. Otherwise a Firebase project owner must review and publish the full [database.rules.json](../database.rules.json) in **Firebase Console → Realtime Database → Rules**. Do not replace a newer live rules version without reviewing differences.

A private save will fail with **permission_denied** until the new `hubPythonProjects` rule is live. This is expected security behavior—never enable public database read/write as a workaround.

## Python runtime and limits

Python runs **in your browser** using Pyodide, not on a server that stores your source. The runtime is loaded into a module-type web worker (version `v314.0.7`). The **Stop** button terminates the worker and resets its Python environment. Runs are limited to 20 seconds after the engine finishes loading; the output console truncates very long output. A program using `input()` can use lines supplied in the optional Program input field. Some packages requiring desktop Python, system access, or unsupported dependencies will not work.

**Security:** A web worker keeps long-running code off the page's UI thread, but it is not a hardened security sandbox for malicious Python (which can access worker browser APIs via Pyodide). Only run code you trust. Firebase rules protect saved code from other signed-in accounts; they do not provide end-to-end encryption, and Firebase project owners retain administrative control over their backend.
