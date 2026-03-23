# AgentDog Plugin for OpenClaw

[![npm version](https://badge.fury.io/js/@agentdog%2Fopenclaw.svg)](https://www.npmjs.com/package/@agentdog/openclaw)

Monitor your [OpenClaw](https://openclaw.ai) agents with [AgentDog](https://agentdog.io) — real-time observability, per-tool permission controls, and human-in-the-loop approval flows.

## Why AgentDog?

AI agents are powerful — but **you need to stay in control**. AgentDog gives you:

- **See everything** — every message, tool call, and cost in real-time
- **Set boundaries** — allow, block, or require approval for any tool
- **Stay in the loop** — approve dangerous actions with one tap, right in Telegram/Discord/Slack
- **Stop anytime** — emergency stop button halts all agent actions instantly
- **Know what's happening** — live activity tracker shows what your agent is doing right now

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
    permissionsEnabled: true  # enable permission controls
```

**4. Restart your agent** — done! Check the [dashboard](https://agentdog.io).

---

## Features

### 📊 Observability

| What's tracked | Details |
|----------------|---------|
| Messages | Role, channel, model, content |
| Tool calls | Name, arguments, duration, success/error |
| Usage & costs | Tokens in/out, cost per turn |
| Config | Channels, plugins, skills, crons |

No secrets or API keys are ever sent.

### 🛡️ Permission Controls

Set rules for any tool in the [dashboard](https://agentdog.io/permissions):

- **Allow** — tool runs freely
- **Block** — tool is always prevented
- **Ask me** — agent pauses and sends you approve/deny buttons

Rules support exact names (`send_email`), wildcards (`github.*`), or catch-all (`*`). Scope them to a specific agent or apply globally.

**Bulk rule creation:** Select multiple capabilities at once and set permissions in a single click.

### ✅ Inline Approval Buttons

When a tool needs approval, you get **inline buttons** right in your chat:

```
⚠️ Approval needed

Your agent wants to run: exec
  {"command": "git push origin main"}

[✅ Approve]  [❌ Deny]
```

Tap a button — the message updates to show your decision. The agent can continue chatting while waiting.

**Text fallback:** Reply `approve` or `deny` if buttons aren't available.

### ⏳ Live Activity Tracker

See what your agent is doing in real-time:

```
⏳ exec — git pull origin main...
```
↓ (updates automatically)
```
✅ exec — git pull origin main (2.1s)
⏳ exec — npm run build...
```

Only appears for tools that take >3 seconds — fast operations stay silent.

### 🛑 Emergency Stop

Tap the **Stop** button to immediately block all subsequent tool calls:

```
🛑 Agent stopped
All tool calls are blocked until you resume.

[▶️ Resume]
```

- Blocks all tool calls until you resume or send a new message
- Auto-expires after 5 minutes
- No data loss — the agent just can't run tools

### 🔍 Smart CLI Mapping

AgentDog automatically recognizes CLI tools and maps them to apps:

- `exec("gh pr merge")` → matches `github.pr.merge` rules
- `exec("git push")` → matches `github.push` rules  
- `exec("docker run nginx")` → matches `docker.run` rules
- `exec("kubectl apply -f ...")` → matches `kubectl.apply` rules

**Auto-discovery:** Unknown CLI tools are automatically detected, and their capabilities are populated from public documentation (tldr-pages).

---

## Supported Channels

Inline buttons, activity tracking, and stop controls work on:

- **Telegram** ✅
- **Discord** ✅
- **Slack** ✅

Other channels fall back to text-based approve/deny or the AgentDog dashboard.

---

## Config Options

```yaml
extensions:
  agentdog:
    apiKey: ad_xxxxxxxxxxxxx        # required
    endpoint: https://agentdog.io/api/v1  # optional
    agentName: my-agent             # optional, shown in dashboard
    syncInterval: 86400             # config sync interval in seconds
    permissionsEnabled: true        # enable permission enforcement
```

---

## Links

- **Dashboard:** [agentdog.io](https://agentdog.io)
- **Permissions:** [agentdog.io/permissions](https://agentdog.io/permissions)
- **OpenClaw:** [openclaw.ai](https://openclaw.ai)
- **Issues:** [GitHub](https://github.com/rohit121/openclaw-plugin/issues)

---

Built with 🐕 by [AgentDog](https://agentdog.io)
