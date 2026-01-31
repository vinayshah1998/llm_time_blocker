# Chrome Web Store Readiness Review

**Overall verdict: Ready for submission.** All identified issues have been addressed.

## Critical (Chrome Web Store will reject without these)

- [x] **No Privacy Policy or Terms of Service** — Added `privacy-policy.html` and `terms-of-service.html` for hosting and linking in the store listing.

- [x] **`<all_urls>` host permission** (`manifest.json:18`) — Required because users can block arbitrary domains. Justification documented in `CWS_PERMISSIONS_JUSTIFICATION.md` for the CWS submission.

- [x] **Missing icon32.png** — Generated 32px icon and added to `assets/icons/icon32.png`. Updated manifest.json with all four sizes (16, 32, 48, 128).

- [x] **No Content Security Policy** — Added CSP meta tags to all HTML pages (blocker, popup, auth).

## High

- [x] **Missing manifest fields** — Added `short_name` ("LLM Blocker") and `homepage_url` to `manifest.json`.

- [ ] **Debug logging in backend** — Multiple `console.log` statements in production backend code (`oauth.ts`, `index.ts`, `webhooks.ts`, `routes/billing.ts`) expose internal details. (Not part of the Chrome extension package; server-side only.)

## Medium

- [x] **Potential XSS in popup.js** — Replaced `innerHTML` template literal with safe DOM manipulation using `createElement`/`textContent`/`setAttribute`.

- [x] **Weak error handling** — Improved error handling in `blocker.js` to detect network failures (offline/unreachable), timeouts, and provide user-friendly messages.

## Low

- [x] **Hardcoded API URL** — Extracted to `src/shared/config.js` configuration file. All HTML pages load config.js before api.js.

## Positive Findings

- Manifest V3 compliant
- Proper use of Chrome storage API
- Passwords hashed with bcrypt
- Parameterized DB queries (Prisma)
- No TODO/FIXME markers in code
- Clean code organization
- HTTPS enforced for API calls
