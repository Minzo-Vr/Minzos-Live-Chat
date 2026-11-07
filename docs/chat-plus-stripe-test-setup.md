# Chat+ billing — Stripe sandbox setup

Status: **Dedicated Cloudflare billing Worker is deployed with secure routes, but all purchases remain disabled until payment credentials, Firebase entitlement rules and the explicit billing-readiness flag are configured.** The website and iOS UI are connected, but no paid transactions or App Store products have been enabled.

## Plan
- Chat+ recurring subscription: **AUD 1.00/month** (Stripe unit amount `100`, currency `aud`, interval `month`).
- Use **Stripe test mode** only (`sk_test_...`), and a recurring test-mode Price ID (`price_...`).
- Use a **separate Cloudflare Worker** for billing. Do not change or redeploy the existing Discord bot Worker or its bindings.
- Website starts checkout only for a Firebase-authenticated user. Worker must validate Firebase ID tokens, and associate the Checkout Session with the verified Firebase UID on the server.
- Worker creates a Stripe Checkout Session (`mode=subscription`) using the configured test Price ID. Do not trust a price, amount, role or UID supplied by the browser.
- Worker verifies Stripe webhook signatures against the **raw request body**, requires `livemode === false`, handles duplicate/out-of-order events, and checks subscription state with Stripe before granting/revoking entitlement.
- Store billing state in a **server-write-only Firebase location**. Do not let a client write billing status or the Plus role.
- Existing manually assigned Plus/Admin roles must be preserved. Billing-derived access should be a distinct entitlement and should never remove manually granted roles.
- Add Stripe Customer Portal support for subscription cancellation and billing management after checkout works.
- Only enable the checkout button after a sandbox checkout and webhook round trip succeeds.

## Configuration needed (not stored in GitHub)
1. Stripe test-mode secret key (`STRIPE_SECRET_KEY`), stored as a Cloudflare Worker secret.
2. Stripe test recurring AUD 1.00/month Price ID (`STRIPE_PRICE_ID`), Worker environment variable.
3. Stripe test webhook signing secret (`STRIPE_WEBHOOK_SECRET`), Worker secret.
4. Firebase authentication and server-side database credentials for the dedicated Worker, stored as secrets; verify database security rules before enabling role updates.

Never paste secret keys into website HTML, public GitHub files, or chat. Configure them in the Cloudflare dashboard or through Wrangler secret storage.

## Sandbox test
Stripe's test card `4242 4242 4242 4242` with a future expiry and any CVC can simulate a successful checkout. Confirm that a paid subscription grants billing-derived Chat+ access, cancellation/end of paid period removes only that entitlement, and payment failure is handled without granting access.

See [billing/README.md](../billing/README.md) for complete activation steps, including the already-deployed Cloudflare billing Worker, the Firebase rule merger, Apple StoreKit, GitHub iOS build variables, and the mandatory `BILLING_FIREBASE_RULES_READY=true` interlock. The subscription button remains disabled until backend readiness checks pass.
