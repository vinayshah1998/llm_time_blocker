# Chrome Web Store Readiness Review

**Overall verdict: Not ready yet.** The following issues need to be addressed before publishing.

## Critical (Chrome Web Store will reject without these)

- [ ] **No Privacy Policy or Terms of Service** — Required by CWS, especially since the extension collects emails/passwords, stores JWT tokens, integrates with Stripe, and sends data to an external LLM API. These documents need to be hosted and linked in the store listing.

- [ ] **`<all_urls>` host permission** (`manifest.json:16`) — Extremely broad permission that CWS reviewers will flag. Needed because the extension blocks arbitrary user-configured sites, but requires a clear justification in the submission. Consider whether `activeTab` + `webNavigation` alone could suffice.

- [ ] **Missing icon32.png** — Only 16, 48, and 128px icons exist. CWS requires/recommends all four sizes (16, 32, 48, 128).

- [ ] **No Content Security Policy** — None of the HTML pages (blocker, popup, auth) have CSP meta tags. CWS reviewers look for this.

## High

- [ ] **Missing manifest fields** — `short_name` and `homepage_url` are missing from `manifest.json`. Recommended for a proper store listing.

- [ ] **Debug logging in backend** — Multiple `console.log` statements in production backend code (`oauth.ts`, `index.ts`, `webhooks.ts`, `routes/billing.ts`) expose internal details.

## Medium

- [ ] **Potential XSS in popup.js** — Tab titles from `chrome.tabs.get()` are injected via `innerHTML` template literals (lines 253-259). Should use `textContent`/`setAttribute` instead.

- [ ] **Weak error handling** — Network failures in `blocker.js` show generic errors. Users will see unhelpful messages if the backend is down.

## Low

- [ ] **Hardcoded API URL** — `https://backend-production-e828f.up.railway.app` is hardcoded in `src/shared/api.js:4`. Not a blocker but makes environment management harder.

## Positive Findings

- Manifest V3 compliant
- Proper use of Chrome storage API
- Passwords hashed with bcrypt
- Parameterized DB queries (Prisma)
- No TODO/FIXME markers in code
- Clean code organization
- HTTPS enforced for API calls
