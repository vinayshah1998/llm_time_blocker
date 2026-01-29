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

### Core Flow
1. `background.js` intercepts navigation via `webNavigation.onBeforeNavigate`
2. Checks if URL matches blocked sites and has no active approval
3. Redirects to `blocker.html?url=<original_url>` if blocked
4. User must convince the LLM in `blocker.js` (paste disabled as anti-cheat)
5. LLM responds with `[ACCESS GRANTED]` or `[ACCESS DENIED]`
6. On approval, stores timestamp in `chrome.storage.local` and redirects

### Component Responsibilities

- **background.js**: Service worker that handles navigation interception, approval storage/expiration, and message passing between components
- **blocker.js**: Chat interface that proxies LLM calls through backend API (`api.js`), parses LLM responses for access decisions
- **popup.js**: Settings management with phrase-protected site list modification (unlock phrase: "I understand this defeats the purpose of this extension")
- **api.js**: Centralized API client with automatic token refresh, handles auth/billing/LLM endpoints
- **auth.html/auth.js**: Login and signup forms

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

## Key Constants
- Approval duration: 30 minutes (`APPROVAL_DURATION_MS`)
- Default blocked sites: youtube.com, instagram.com, reddit.com, twitter.com, x.com
- LLM model: `claude-3-haiku-20240307`
