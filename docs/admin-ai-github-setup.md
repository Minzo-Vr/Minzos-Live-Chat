# Game Hub Admin AI — GitHub editing setup

The Game Hub UI and `admin-ai/worker.js` now contain a GitHub edit-preview and approved-commit workflow. **Committing these files does not deploy the Cloudflare Worker.**

## Deploy / configure

1. Deploy the latest `admin-ai/worker.js` to the existing Cloudflare Worker `community-chat-admin-ai` at `https://community-chat-admin-ai.kobefalzon8.workers.dev`. Keep the existing Workers AI binding named `AI`.
2. Add Cloudflare Worker **secrets** (never put values in the repository or browser):
   - `GITHUB_TOKEN`: a fine-grained GitHub token scoped to **Minzo-Vr/Minzos-Live-Chat**, with **Contents: Read and write**. Avoid broad permissions.
   - `PROPOSAL_SECRET`: a long random value used to sign the exact preview the admin approves.
3. Confirm that the Firebase user has a verified `admin: true` **custom claim**. A visual role in `chatRoles` is not equivalent to the claim.
4. Open Game Hub → Admin AI → GitHub code editor. Request one small change, review the displayed REMOVE/REPLACE text, and approve the commit.

## Safety limits

- Only `index.html` and `shapes-colours.html` are editable.
- The backend verifies the Firebase admin JWT signature, not just browser role text.
- The backend generates an exact single replacement, then signs a 10-minute proposal bound to that admin and file SHA.
- Approval sends the signed proposal back; if the file SHA changed, the commit is rejected.
- Edits touching authentication, authorization, admin, secrets, or payment terms are rejected for manual review.
- The AI can make mistakes. Review every proposed replacement carefully; it is not a substitute for code review.
- The GitHub token has write access. Rotate it if compromised, and consider a dedicated GitHub App with narrower permissions for production.
- Currently this is an **in-place commit to the default branch** after approval, not a pull-request workflow.
