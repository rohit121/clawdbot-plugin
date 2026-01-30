/**
 * AgentDog Plugin for Clawdbot
 * 
 * Sends events to AgentDog for observability and monitoring.
 */

interface PluginConfig {
  apiKey: string;
  endpoint?: string;
  syncInterval?: number;
}

interface PluginAPI {
  config: any;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  registerHook?: (event: string, handler: (ctx: any) => Promise<void>) => void;
}

// Plugin state
let agentId: string | null = null;
let pluginConfig: PluginConfig = { apiKey: '' };
let endpoint = 'https://agentdog.io/api/v1';
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Send data to AgentDog API
 */
async function sendToAgentDog(path: string, data: Record<string, unknown>): Promise<unknown> {
  if (!pluginConfig.apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pluginConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`[agentdog] API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[agentdog] Failed to send:', error);
    return null;
  }
}

/**
 * Register agent with AgentDog
 */
async function registerAgent(config: any): Promise<void> {
  const result = await sendToAgentDog('/agents/register', {
    name: 'clawdbot',
    type: 'clawdbot',
    metadata: {
      workspace: config?.agents?.defaults?.workspace,
    },
  }) as { agent_id?: string } | null;

  if (result?.agent_id) {
    agentId = result.agent_id;
    console.log(`[agentdog] Registered: ${agentId}`);
  }
}

/**
 * Send event to AgentDog
 */
async function sendEvent(type: string, sessionId: string | undefined, data: Record<string, unknown>): Promise<void> {
  if (!agentId) return;

  await sendToAgentDog('/events', {
    agent_id: agentId,
    type,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    data,
  });
}

/**
 * Sync metadata
 */
async function syncMetadata(config: any): Promise<void> {
  if (!agentId) return;

  await sendToAgentDog(`/agents/${agentId}/config`, {
    channels: config?.channels,
    model: config?.agents?.defaults?.model,
    workspace: config?.agents?.defaults?.workspace,
  });
}

/**
 * Plugin registration function
 */
export default function register(api: PluginAPI) {
  // Get plugin config
  const entries = api.config?.plugins?.entries?.agentdog;
  pluginConfig = entries?.config || {};
  endpoint = pluginConfig.endpoint || 'https://agentdog.io/api/v1';

  if (!pluginConfig.apiKey) {
    console.warn('[agentdog] No API key configured. Set plugins.entries.agentdog.config.apiKey');
    return;
  }

  console.log('[agentdog] Starting AgentDog plugin...');

  // Register agent on startup
  registerAgent(api.config).then(() => {
    // Initial sync
    syncMetadata(api.config);
    
    // Periodic sync
    const interval = (pluginConfig.syncInterval || 300) * 1000;
    syncIntervalId = setInterval(() => {
      syncMetadata(api.config);
    }, interval);
  });

  // Register hooks if available
  if (api.registerHook) {
    api.registerHook('message_received', async (ctx) => {
      await sendEvent('message', ctx.sessionId, {
        role: 'user',
        content: ctx.message?.content || ctx.text,
        channel: ctx.channel,
      });
    });

    api.registerHook('message_sent', async (ctx) => {
      await sendEvent('message', ctx.sessionId, {
        role: 'assistant',
        content: ctx.message?.content || ctx.text,
        provider: ctx.provider,
        model: ctx.model,
      });
    });

    api.registerHook('after_tool_call', async (ctx) => {
      await sendEvent('tool_call', ctx.sessionId, {
        name: ctx.toolName,
        arguments: ctx.arguments,
        result: ctx.result,
        is_error: ctx.isError,
      });
    });

    api.registerHook('agent_end', async (ctx) => {
      if (ctx.usage) {
        await sendEvent('usage', ctx.sessionId, {
          input_tokens: ctx.usage.input,
          output_tokens: ctx.usage.output,
          total_tokens: ctx.usage.totalTokens,
          total_cost: ctx.usage.cost?.total,
          provider: ctx.provider,
          model: ctx.model,
        });
      }
    });
  }

  console.log('[agentdog] Plugin initialized');
}

// Export plugin metadata
export const id = 'agentdog';
export const name = 'AgentDog';
export const version = '0.1.0';
