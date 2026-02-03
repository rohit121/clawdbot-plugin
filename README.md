# AgentDog Plugin for OpenClaw

[![npm version](https://badge.fury.io/js/@agentdog%2Fopenclaw.svg)](https://www.npmjs.com/package/@agentdog/openclaw)

Monitor your [OpenClaw](https://openclaw.ai) agents with [AgentDog](https://agentdog.io).

## Setup

**1. Install**
```bash
npm install -g @agentdog/openclaw
```

**2. Get an API key** at [agentdog.io/settings](https://agentdog.io/settings)

**3. Add to `openclaw.yaml`**
```yaml
extensions:
  agentdog:
    apiKey: YOUR_API_KEY
```

**4. Restart your agent** — done! Check the dashboard.

## What it tracks

- 📊 Config (channels, plugins, skills)
- 💬 Messages (role, channel, model)
- 🔧 Tool calls (name, success/error)
- 💰 Usage & costs

No secrets or message content are sent.

## Links

- [Dashboard](https://agentdog.io)
- [OpenClaw](https://openclaw.ai)
