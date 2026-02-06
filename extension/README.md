# LLM Time Blocker — Chrome Extension

A Chrome extension (Manifest V3) that blocks distracting websites and requires users to convince an LLM gatekeeper to gain access. Access is granted for 30-minute windows.

## Architecture

```
extension/
├── manifest.json                        # Extension manifest (Manifest V3)
├── assets/icons/                        # Extension icons (16, 32, 48, 128 px)
└── src/
    ├── background/
    │   └── background.js                # Service worker — navigation interception, approval storage
    ├── shared/
    │   ├── constants.js                 # Blocked sites, approval duration, unlock phrase
    │   ├── config.js                    # API base URL configuration
    │   ├── api.js                       # API client with automatic token refresh
    │   └── oauth.js                     # Google OAuth integration
    └── pages/
        ├── blocker/                     # Blocking page with LLM chat interface
        ├── popup/                       # Extension popup (settings, active approvals)
        └── auth/                        # Login and signup forms
```

**Core flow:**
1. `background.js` intercepts navigation via `webNavigation.onBeforeNavigate`
2. If the URL matches a blocked site with no active approval, it redirects to the blocker page
3. The user chats with the LLM to justify their access
4. On approval, a 30-minute access window is stored and the user is redirected to the original site

No build step — the extension is pure JavaScript, HTML, and CSS served directly.

## Local Development

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this `extension/` directory
4. After modifying files, click the reload icon on the extension card to pick up changes

## Releasing to the Chrome Web Store

1. **Bump the version** in `manifest.json` (e.g. `"version": "1.0.1"`)

2. **Create a ZIP** of the extension directory:
   ```sh
   cd extension
   zip -r ../llm-time-blocker.zip . -x "*.DS_Store" "README.md"
   ```

3. **Upload to the Chrome Developer Dashboard**
   - Go to https://chrome.google.com/webstore/devconsole
   - Select **LLM Time Blocker**
   - Click **Package** → **Upload new package**
   - Upload the ZIP file

4. **Fill in release notes** describing what changed in this version

5. **Submit for review** — Chrome Web Store reviews typically complete within a few business days
