# 🐕 AgentDog - Clawdbot Plugin

Monitor your Clawdbot agent with AgentDog - real-time observability for AI agents.

## Installation

```bash
clawdbot plugins install agentdog-clawdbot
```

## Configuration

1. Get your API key at https://agentdog.io
2. Add to your `clawdbot.json`:

```json
{
  "plugins": {
    "entries": {
      "agentdog": {
        "enabled": true,
        "config": {
          "apiKey": "ad_your_key_here"
        }
      }
    }
  }
}
```

3. Restart the gateway:

```bash
clawdbot gateway restart
```

## Config Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `apiKey` | Yes | - | Your AgentDog API key |
| `endpoint` | No | `https://agentdog.io/api/v1` | API endpoint |
| `syncInterval` | No | `300` | Metadata sync interval (seconds) |

## What's Tracked

- 💬 **Messages** - User inputs and assistant responses
- 🔧 **Tool calls** - Every tool invocation with results
- 📊 **Usage** - Token counts and costs
- ⚙️ **Config** - Channels, models, workspace

## Dashboard

View your agent at https://agentdog.io

## Development

```bash
git clone https://github.com/rohit121/agentdog-clawdbot.git
cd agentdog-clawdbot
npm install
npm run build
```

## License

MIT
