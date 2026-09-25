# Confirmed failures / regression checks

1. Do not assume OmniRoute lacks an OpenAI-compatible endpoint because Cloudflare Relay only exposes /api/ask.
   - Source of truth: docs/openapi.yaml exposes POST /api/v1/chat/completions.
   - Hermes custom base_url must therefore target the OmniRoute API server ending in /api/v1.

2. GitHub file update must use the current blob SHA.
   - A stale/incorrect SHA produced HTTP 409 during this POC.
   - Always fetch the current branch tree/blob SHA immediately before update.

3. A config/repo contract match is not an end-to-end runtime pass.
   - PASS requires an actually reachable OmniRoute API server + valid credential + Hermes process executing the skill.
