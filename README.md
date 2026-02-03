# AgentDog Plugin for OpenClaw

[![npm version](https://badge.fury.io/js/@agentdog%2Fopenclaw.svg)](https://www.npmjs.com/package/@agentdog/openclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Monitor your [OpenClaw](https://openclaw.ai) AI agents with [AgentDog](https://agentdog.io) observability.

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
npm install @agentdog/openclaw

# Using pnpm
pnpm add @agentdog/openclaw
```

Or install directly via OpenClaw:

```bash
openclaw plugins install @agentdog/openclaw
```

## Configuration

Add to your OpenClaw config (`openclaw.yaml` or `openclaw.json`):

```yaml
plugins:
  entries:
    agentdog:
      enabled: true
      config:
        apiKey: "ad_your_api_key_here"
        endpoint: "https://agentdog.io/api/v1"  # optional, this is default
        agentName: "my-agent"  # optional, defaults to 'openclaw'
        syncInterval: 86400    # optional, seconds between syncs (default: 24h)
```

## Getting an API Key

1. Sign up at [agentdog.io](https://agentdog.io)
2. Go to Settings → API Keys
3. Create a new key
4. Add it to your OpenClaw config

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
- **On heartbeat** — Syncs on each OpenClaw heartbeat
- **Periodic** — Every 24h (configurable via `syncInterval`)

## Development

```bash
# Clone the repo
git clone https://github.com/agentdog-io/openclaw-plugin.git
cd openclaw-plugin

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Manual Installation

Copy the built plugin to your OpenClaw extensions folder:

```bash
npm run build
cp dist/* ~/.openclaw/extensions/agentdog/
```

## License

MIT — see [LICENSE](LICENSE)

## Links

- [AgentDog Dashboard](https://agentdog.io)
- [OpenClaw](https://openclaw.ai)
- [Documentation](https://docs.agentdog.io)
- [Report Issues](https://github.com/agentdog-io/openclaw-plugin/issues)
