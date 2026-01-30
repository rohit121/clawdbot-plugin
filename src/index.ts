/**
 * AgentDog Plugin for Clawdbot
 * 
 * Sends observability data to AgentDog.
 */

// Plugin state
let agentId: string | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let gatewayStartTime: Date | null = null;
let errorCount = 0;
let recentErrors: Array<{ time: string; message: string; tool?: string }> = [];

/**
 * Send data to AgentDog API
 */
async function sendToAgentDog(
  endpoint: string,
  apiKey: string,
  path: string,
  data: Record<string, unknown>,
  logger?: { warn: (msg: string) => void }
): Promise<unknown> {
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
      logger?.warn(`[agentdog] API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger?.warn(`[agentdog] Failed to send: ${String(error)}`);
    return null;
  }
}

/**
 * Extract safe channel info (no tokens/secrets)
 */
function getSafeChannels(channels: Record<string, any> | undefined): Record<string, unknown> {
  if (!channels) return {};
  const safe: Record<string, unknown> = {};
  for (const [name, config] of Object.entries(channels)) {
    if (!config) continue;
    safe[name] = {
      enabled: config.enabled ?? true,
      dmPolicy: config.dmPolicy,
      groupPolicy: config.groupPolicy,
      streamMode: config.streamMode,
    };
  }
  return safe;
}

/**
 * Extract plugin names (no configs/secrets)
 */
function getPluginNames(plugins: Record<string, any> | undefined): string[] {
  if (!plugins?.entries) return [];
  return Object.entries(plugins.entries)
    .filter(([_, config]: [string, any]) => config?.enabled !== false)
    .map(([name]) => name);
}

// Plugin registration function
export default function register(api: any) {
  // Get plugin config
  const cfg = api.pluginConfig || {};
  
  const apiKey = cfg.apiKey || '';
  const endpoint = cfg.endpoint || 'https://agentdog.io/api/v1';
  const syncInterval = (cfg.syncInterval || 86400) * 1000; // Default 24h

  if (!apiKey) {
    api.logger?.warn?.('[agentdog] No API key configured');
    return;
  }

  api.logger?.info?.('[agentdog] Initializing...');

  // Helper to register agent
  const registerAgent = async () => {
    // Use configured name, or fallback to 'clawdbot'
    const agentName = cfg.agentName || 'clawdbot';
    const result = await sendToAgentDog(endpoint, apiKey, '/agents/register', {
      name: agentName,
      type: 'clawdbot',
      metadata: {
        workspace: api.config?.agents?.defaults?.workspace,
      },
    }, api.logger) as { agent_id?: string } | null;

    if (result?.agent_id) {
      agentId = result.agent_id;
      api.logger?.info?.(`[agentdog] Registered: ${agentId}`);
    }
  };

  // Helper to sync config
  const syncConfig = async () => {
    if (!agentId) return;

    api.logger?.info?.('[agentdog] Syncing config...');
    
    const config = api.config;
    await sendToAgentDog(endpoint, apiKey, `/agents/${agentId}/config`, {
      version: config?.meta?.lastTouchedVersion,
      workspace: config?.agents?.defaults?.workspace,
      channels: getSafeChannels(config?.channels),
      plugins: getPluginNames(config?.plugins),
      gateway: {
        port: config?.gateway?.port,
        mode: config?.gateway?.mode,
      },
      agents: {
        model: config?.agents?.defaults?.model,
        thinking: config?.agents?.defaults?.thinking,
        heartbeat: config?.agents?.defaults?.heartbeat,
        compaction: config?.agents?.defaults?.compaction,
      },
      // Cron jobs from config
      crons: config?.crons?.jobs?.map((job: any) => ({
        id: job.id,
        schedule: job.schedule,
        text: job.text?.substring(0, 100), // Truncate
        enabled: job.enabled !== false,
      })) || [],
      // Skills
      skills: config?.skills?.available?.map((skill: any) => ({
        name: skill.name,
        description: skill.description,
        location: skill.location,
      })) || [],
      // Tools available
      tools: config?.tools?.available || [],
      // Nodes (connected devices)
      nodes: config?.nodes?.registered?.map((node: any) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        lastSeen: node.lastSeen,
        status: node.status,
      })) || [],
      // Gateway stats
      gateway_stats: {
        uptime_seconds: gatewayStartTime 
          ? Math.floor((Date.now() - gatewayStartTime.getTime()) / 1000)
          : null,
        started_at: gatewayStartTime?.toISOString(),
        error_count: errorCount,
        recent_errors: recentErrors.slice(-10), // Last 10 errors
      },
      // Memory plugin stats (if available)
      memory: config?.plugins?.entries?.memory ? {
        enabled: true,
        workspace: config?.agents?.defaults?.workspace,
      } : { enabled: false },
    }, api.logger);
  };

  // Helper to send events
  const sendEvent = async (type: string, sessionKey: string | undefined, data: Record<string, unknown>) => {
    if (!agentId) return;

    await sendToAgentDog(endpoint, apiKey, '/events', {
      agent_id: agentId,
      type,
      session_id: sessionKey,
      timestamp: new Date().toISOString(),
      data,
    }, api.logger);
  };

  // 1. Sync on startup
  api.on('gateway_start', async () => {
    api.logger?.info?.('[agentdog] Gateway started');
    gatewayStartTime = new Date();
    errorCount = 0;
    recentErrors = [];
    
    await registerAgent();
    await syncConfig();
    
    // Set up periodic sync
    if (syncIntervalId) clearInterval(syncIntervalId);
    syncIntervalId = setInterval(() => {
      syncConfig();
    }, syncInterval);
  });

  // 2. Sync on heartbeat
  api.on('heartbeat', async () => {
    api.logger?.info?.('[agentdog] Heartbeat sync');
    await syncConfig();
  });

  // 3. Clean up on shutdown
  api.on('gateway_stop', async () => {
    api.logger?.info?.('[agentdog] Gateway stopping');
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  });

  // 4. Track messages
  api.on('message_received', async (event: any) => {
    await sendEvent('message', event.sessionKey, {
      role: 'user',
      channel: event.channel,
    });
  });

  api.on('message_sent', async (event: any) => {
    await sendEvent('message', event.sessionKey, {
      role: 'assistant',
      model: event.model,
    });
  });

  // 5. Track tool calls
  api.on('after_tool_call', async (event: any) => {
    // Track errors
    if (event.isError) {
      errorCount++;
      recentErrors.push({
        time: new Date().toISOString(),
        message: event.errorMessage || 'Tool error',
        tool: event.toolName,
      });
      // Keep only last 50 errors in memory
      if (recentErrors.length > 50) recentErrors.shift();
    }
    
    await sendEvent('tool_call', event.sessionKey, {
      name: event.toolName,
      is_error: event.isError,
      error_message: event.isError ? event.errorMessage : undefined,
    });
  });

  // 6. Track usage after conversations
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

  api.logger?.info?.('[agentdog] Plugin initialized');
}

// Export plugin metadata
export const id = 'agentdog';
export const name = 'AgentDog';
export const version = '0.3.1';
