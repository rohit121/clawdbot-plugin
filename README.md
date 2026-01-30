# AgentDog Plugin for Clawdbot

Observability plugin that sends data to [AgentDog](https://agentdog.io).

## Features

- **Agent registration** — Auto-registers your Clawdbot instance
- **Config sync** — Syncs channels, plugins, settings (no secrets)
- **Event tracking** — Messages, tool calls, usage
- **Cost tracking** — Token usage and costs per model

## Config Sync Triggers

1. **On startup** — When gateway starts
2. **After conversations** — On `agent_end` hook
3. **Periodic backup** — Every 24h (configurable)

## Installation

```bash
# From npm (when published)
clawdbot plugins install agentdog

# Or link locally for development
cd /root/agentdog-clawdbot
npm install && npm run build
npm link
clawdbot plugins link agentdog-clawdbot
```

## Configuration

Add to your Clawdbot config:

```yaml
plugins:
  entries:
    agentdog:
      enabled: true
      config:
        apiKey: "ad_your_api_key_here"
        # Optional:
        endpoint: "https://agentdog.io/api/v1"  # default
        syncInterval: 86400  # seconds (default: 24h)
```

## What Gets Synced

### Config (no secrets)
- Workspace name
- Channel names + policies (not tokens)
- Plugin names (not configs)
- Agent settings (model, thinking, heartbeat)
- Clawdbot version

### Events
- Messages (user/assistant)
- Tool calls (name, success/error)
- Usage (tokens, costs, model)

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /agents/register` | Register agent on startup |
| `POST /agents/{id}/config` | Sync config |
| `POST /events` | Send events |
| `POST /agents/{id}/heartbeat` | Heartbeat (optional) |

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Test locally
clawdbot plugins link agentdog-clawdbot
clawdbot gateway restart
```

## License

MIT
