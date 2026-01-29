# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Time Blocker is a Chrome extension (Manifest V3) that blocks distracting websites and requires users to convince an LLM gatekeeper to gain access. Access is granted for 30-minute windows.

## Development

**Load extension in Chrome:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

**Testing changes:** Reload the extension from `chrome://extensions` after modifying files.

## Architecture

### Directory Structure
```
llm_time_blocker/
├── manifest.json
├── src/
│   ├── shared/
│   │   ├── constants.js      # Shared constants (blocked sites, durations, phrases)
│   │   └── api.js            # Centralized API client
│   ├── background/
│   │   └── background.js     # Service worker
│   └── pages/
│       ├── popup/            # Extension popup (settings)
│       ├── blocker/          # Blocking page with LLM chat
│       └── auth/             # Login/signup forms
└── assets/
    └── icons/                # Extension icons
```

### Core Flow
1. `background.js` intercepts navigation via `webNavigation.onBeforeNavigate`
2. Checks if URL matches blocked sites and has no active approval
3. Redirects to `src/pages/blocker/blocker.html?url=<original_url>` if blocked
4. User must convince the LLM in `blocker.js` (paste disabled as anti-cheat)
5. LLM responds with `[ACCESS GRANTED]` or `[ACCESS DENIED]`
6. On approval, stores timestamp in `chrome.storage.local` and redirects

### Component Responsibilities

- **src/shared/constants.js**: Shared constants (DEFAULT_BLOCKED_SITES, APPROVAL_DURATION_MS, UNLOCK_PHRASE)
- **src/shared/api.js**: Centralized API client with automatic token refresh, handles auth/billing/LLM endpoints
- **src/background/background.js**: Service worker that handles navigation interception, approval storage/expiration, and message passing between components
- **src/pages/blocker/blocker.js**: Chat interface that proxies LLM calls through backend API, parses LLM responses for access decisions
- **src/pages/popup/popup.js**: Settings management with phrase-protected site list modification
- **src/pages/auth/**: Login and signup forms

### Storage Keys (chrome.storage.local)
- `authTokens`: JWT access and refresh tokens for backend authentication
- `user`: User object with email and subscription status
- `blockedSites`: Array of blocked domains
- `approvals`: Object mapping domains to approval timestamps
- `schedules`: Time window configuration for scheduled blocking

### Message Types (chrome.runtime)
- `GRANT_APPROVAL`: Store approval timestamp for a URL
- `CHECK_APPROVAL`: Check if URL has active approval
- `GET_APPROVAL_STATUS`: Get all active approvals with remaining time

### Backend API (backend/)
- **Tech stack**: Node.js, Express, TypeScript, PostgreSQL, Prisma
- **Auth**: JWT-based with 15min access / 30day refresh tokens
- **Billing**: Stripe subscription at $5/month with 7-day free trial
- **Endpoints**: /api/auth/*, /api/billing/*, /api/llm/chat, /webhooks/stripe

## Deployment

### Railway Configuration
The backend is deployed on Railway with GitHub integration.

**Important**: The repo root contains the Chrome extension, not the backend. For GitHub-triggered deploys to work:
1. **Railway Console**: Set Root Directory to `backend` in service Settings → Source
2. **Config file**: `backend/railway.toml` defines build/deploy configuration

Without the Root Directory setting, GitHub pushes will fail because Railway tries to build from the repo root (which lacks `package.json`), while manual `railway up` from `backend/` succeeds.

## Key Constants
- Approval duration: 30 minutes (`APPROVAL_DURATION_MS`)
- Default blocked sites: youtube.com, instagram.com, reddit.com, twitter.com, x.com
- LLM model: `claude-3-haiku-20240307`
