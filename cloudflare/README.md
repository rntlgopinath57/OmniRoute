# Relay on Cloudflare Workers

This directory is the platform-portable deployment path for Relay.

## Architecture

- Static UI: `ai-team-playground/`
- API: one Cloudflare Worker
  - `/api/ask`
  - `/api/media`
  - `/api/health`
- All other requests are served directly as static assets.
- Static asset requests do not invoke the Worker.

## Required secrets / variables

Configure the same Relay provider values currently used on Netlify:

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GEMINI_BASE_URL`
- `GEMINI_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_API_KEY`
- `RELAY_GITHUB_TOKEN` or `GITHUB_TOKEN`

Do not commit secret values.

## Safety / cost guardrail

The Worker only runs for `/api/*`; static UI assets are served directly. This avoids consuming Worker requests for ordinary page, CSS, JS, and image loads.

Do not switch production traffic until the Cloudflare preview passes:
1. health endpoint
2. one simple prompt
3. one GitHub-read prompt
4. one reviewer path
5. one image capability check
6. rate/usage sanity check

Netlify remains untouched as a rollback reference.


## Deployment credential

Preview deployment reuses the existing GitHub Actions secret named `CLOUDFLARE_API_TOKEN`. No second Cloudflare token is required.
