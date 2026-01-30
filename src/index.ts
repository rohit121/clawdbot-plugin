/**
 * AgentDog Plugin for Clawdbot
 * 
 * Sends observability data to AgentDog.
 * 
 * Config sync triggers:
 * 1. On startup (gateway_start hook)
 * 2. After conversations (agent_end hook) 
 * 3. Periodic backup (every 24h by default)
 */

// Plugin state
let agentId: string | null = null;
let endpoint = 'https://agentdog.io/api/v1';
let apiKey = '';
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Send data to AgentDog API
 */
async function sendToAgentDog(path: string, data: Record<string, unknown>): Promise<unknown> {
  if (!apiKey) return null;

  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
    name: config?.agents?.defaults?.workspace || 'clawdbot',
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
 * Extract safe channel info (no tokens)
 */
function getSafeChannels(channels: any): Record<string, unknown> {
  if (!channels) return {};
  const safe: Record<string, unknown> = {};
  for (const [name, config] of Object.entries(channels as Record<string, any>)) {
    safe[name] = {
      enabled: config?.enabled ?? true,
      dmPolicy: config?.dmPolicy,
      groupPolicy: config?.groupPolicy,
      streamMode: config?.streamMode,
    };
  }
  return safe;
}

/**
 * Extract plugin names (no configs)
 */
function getPluginNames(plugins: any): string[] {
  if (!plugins?.entries) return [];
  return Object.entries(plugins.entries)
    .filter(([_, config]: [string, any]) => config?.enabled !== false)
    .map(([name]) => name);
}

/**
 * Sync config to AgentDog
 */
async function syncConfig(config: any): Promise<void> {
  if (!agentId) return;

  console.log('[agentdog] Syncing config...');
  
  await sendToAgentDog(`/agents/${agentId}/config`, {
    // Meta
    version: config?.meta?.lastTouchedVersion,
    
    // Workspace
    workspace: config?.agents?.defaults?.workspace,
    
    // Channels (safe - no tokens)
    channels: getSafeChannels(config?.channels),
    
    // Plugins (names only)
    plugins: getPluginNames(config?.plugins),
    
    // Gateway (no secrets)
    gateway: {
      port: config?.gateway?.port,
      mode: config?.gateway?.mode,
    },
    
    // Agent settings
    agents: {
      model: config?.agents?.defaults?.model,
      heartbeat: config?.agents?.defaults?.heartbeat,
      compaction: config?.agents?.defaults?.compaction,
      thinking: config?.agents?.defaults?.thinking,
    },
  });
  
  console.log('[agentdog] Config synced');
}

/**
 * Plugin definition using Clawdbot Plugin API
 */
const plugin = {
  id: 'agentdog',
  name: 'AgentDog Observability',
  description: 'Send observability data to AgentDog (agentdog.io)',
  version: '0.2.0',
  
  configSchema: {
    type: 'object',
    properties: {
      apiKey: { type: 'string', description: 'AgentDog API key' },
      endpoint: { type: 'string', description: 'API endpoint (default: https://agentdog.io/api/v1)' },
      syncInterval: { type: 'number', description: 'Config sync interval in seconds (default: 86400 = 24h)' },
    },
    required: ['apiKey'],
  },

  register(api: any) {
    // Get plugin config
    const pluginConfig = api.config?.plugins?.entries?.agentdog?.config || {};
    apiKey = pluginConfig.apiKey || '';
    endpoint = pluginConfig.endpoint || 'https://agentdog.io/api/v1';
    const syncInterval = (pluginConfig.syncInterval || 86400) * 1000; // Default 24h

    if (!apiKey) {
      console.warn('[agentdog] No API key configured. Set plugins.entries.agentdog.config.apiKey');
      return;
    }

    console.log('[agentdog] Initializing...');

    // 1. Sync on startup
    api.on('gateway_start', async () => {
      console.log('[agentdog] Gateway started, registering and syncing...');
      await registerAgent(api.config);
      await syncConfig(api.config);
      
      // Set up periodic sync (backup)
      if (syncIntervalId) clearInterval(syncIntervalId);
      syncIntervalId = setInterval(() => {
        syncConfig(api.config);
      }, syncInterval);
    });

    // 2. Clean up on shutdown
    api.on('gateway_stop', async () => {
      console.log('[agentdog] Gateway stopping, cleaning up...');
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
    });

    // 3. Track messages
    api.on('message_received', async (event: any) => {
      await sendEvent('message', event.sessionKey, {
        role: 'user',
        content: event.text || event.message?.content,
        channel: event.channel,
      });
    });

    api.on('message_sent', async (event: any) => {
      await sendEvent('message', event.sessionKey, {
        role: 'assistant',
        content: event.text || event.message?.content,
        model: event.model,
      });
    });

    // 4. Track tool calls
    api.on('after_tool_call', async (event: any) => {
      await sendEvent('tool_call', event.sessionKey, {
        name: event.toolName,
        arguments: event.arguments,
        is_error: event.isError,
      });
    });

    // 5. Track usage after conversations
    api.on('agent_end', async (event: any) => {
      if (event.usage) {
        await sendEvent('usage', event.sessionKey, {
          input_tokens: event.usage.input,
          output_tokens: event.usage.output,
          total_tokens: event.usage.totalTokens,
          total_cost: event.usage.cost?.total,
          provider: event.provider,
          model: event.model,
        });
      }
    });

    console.log('[agentdog] Plugin initialized');
  },
};

export default plugin;
