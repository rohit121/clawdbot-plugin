# AgentDog Plugin for Clawdbot

[![npm version](https://badge.fury.io/js/@agentdog%2Fclawdbot.svg)](https://www.npmjs.com/package/@agentdog/clawdbot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Monitor your [Clawdbot](https://clawd.bot) AI agents with [AgentDog](https://agentdog.io) observability.

## Features

- 📊 **Config Sync** — Channels, plugins, skills, crons, nodes
- 💬 **Message Tracking** — User and assistant messages
- 🔧 **Tool Monitoring** — Tool calls with error tracking
- 💰 **Usage & Costs** — Token counts and cost tracking
- ⏱️ **Gateway Stats** — Uptime, errors, health metrics
- 🔄 **Auto Sync** — On startup, heartbeat, and periodic intervals

## Installation

```bash
# Using npm
npm install @agentdog/clawdbot

# Using pnpm
pnpm add @agentdog/clawdbot
```

Or install directly via Clawdbot:

```bash
clawdbot plugins install @agentdog/clawdbot
```

## Configuration

Add to your Clawdbot config (`clawdbot.yaml` or `clawdbot.json`):

```yaml
plugins:
  entries:
    agentdog:
      enabled: true
      config:
        apiKey: "ad_your_api_key_here"
        endpoint: "https://agentdog.io/api/v1"  # optional, this is default
        agentName: "my-agent"  # optional, defaults to 'clawdbot'
        syncInterval: 86400    # optional, seconds between syncs (default: 24h)
```

## Getting an API Key

1. Sign up at [agentdog.io](https://agentdog.io)
2. Go to Settings → API Keys
3. Create a new key
4. Add it to your Clawdbot config

## What Data is Sent?

The plugin sends observability data to help you monitor your agent:

| Data Type | Description |
|-----------|-------------|
| **Config** | Enabled channels, plugins, skills, crons (no secrets) |
| **Messages** | Message role (user/assistant), channel, model used |
| **Tool Calls** | Tool name, success/error status |
| **Usage** | Token counts, cost estimates |
| **Gateway Stats** | Uptime, error counts |

**We never send:**
- API keys or secrets
- Message content
- Personal data
- File contents

## Sync Schedule

- **On startup** — Immediate sync when gateway starts
- **On heartbeat** — Syncs on each Clawdbot heartbeat
- **Periodic** — Every 24h (configurable via `syncInterval`)

## Development

```bash
# Clone the repo
git clone https://github.com/agentdog-io/clawdbot-plugin.git
cd clawdbot-plugin

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Manual Installation

Copy the built plugin to your Clawdbot extensions folder:

```bash
npm run build
cp dist/* ~/.clawdbot/extensions/agentdog/
```

## License

MIT — see [LICENSE](LICENSE)

## Links

- [AgentDog Dashboard](https://agentdog.io)
- [Clawdbot](https://clawd.bot)
- [Documentation](https://docs.agentdog.io)
- [Report Issues](https://github.com/agentdog-io/clawdbot-plugin/issues)
