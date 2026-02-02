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
let registrationAttempts = 0;
const MAX_REGISTRATION_ATTEMPTS = 3;

/**
 * Send data to AgentDog API
 */
async function sendToAgentDog(
  endpoint: string,
  apiKey: string,
  path: string,
  data: Record<string, unknown>,
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string) => void }
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
      const text = await response.text().catch(() => '');
      logger?.warn?.(`[agentdog] API error ${response.status}: ${text.substring(0, 200)}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger?.error?.(`[agentdog] Request failed: ${String(error)}`);
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

  // Validate API key
  if (!apiKey) {
    api.logger?.error?.('[agentdog] No API key configured - plugin disabled');
    return;
  }

  if (!apiKey.startsWith('ad_')) {
    api.logger?.error?.('[agentdog] Invalid API key format - must start with "ad_"');
    return;
  }

  api.logger?.info?.('[agentdog] Initializing with endpoint: ' + endpoint);

  // Helper to register agent with retry
  const registerAgent = async (): Promise<boolean> => {
    if (agentId) {
      api.logger?.info?.(`[agentdog] Already registered: ${agentId}`);
      return true;
    }

    if (registrationAttempts >= MAX_REGISTRATION_ATTEMPTS) {
      api.logger?.warn?.(`[agentdog] Max registration attempts (${MAX_REGISTRATION_ATTEMPTS}) reached`);
      return false;
    }

    registrationAttempts++;
    api.logger?.info?.(`[agentdog] Registration attempt ${registrationAttempts}/${MAX_REGISTRATION_ATTEMPTS}`);

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
      api.logger?.info?.(`[agentdog] ✓ Registered successfully: ${agentId}`);
      return true;
    } else {
      api.logger?.warn?.('[agentdog] Registration failed - no agent_id returned');
      return false;
    }
  };

  // Ensure registered before sending events (lazy registration fallback)
  const ensureRegistered = async (): Promise<boolean> => {
    if (agentId) return true;
    return await registerAgent();
  };

  // Helper to sync config
  const syncConfig = async () => {
    if (!await ensureRegistered()) return;

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
      crons: config?.crons?.jobs?.map((job: any) => ({
        id: job.id,
        schedule: job.schedule,
        text: job.text?.substring(0, 100),
        enabled: job.enabled !== false,
      })) || [],
      skills: config?.skills?.available?.map((skill: any) => ({
        name: skill.name,
        description: skill.description,
        location: skill.location,
      })) || [],
      tools: config?.tools?.available || [],
      nodes: config?.nodes?.registered?.map((node: any) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        lastSeen: node.lastSeen,
        status: node.status,
      })) || [],
      gateway_stats: {
        uptime_seconds: gatewayStartTime 
          ? Math.floor((Date.now() - gatewayStartTime.getTime()) / 1000)
          : null,
        started_at: gatewayStartTime?.toISOString(),
        error_count: errorCount,
        recent_errors: recentErrors.slice(-10),
      },
      memory: config?.plugins?.entries?.memory ? {
        enabled: true,
        workspace: config?.agents?.defaults?.workspace,
      } : { enabled: false },
    }, api.logger);
  };

  // Helper to send events
  const sendEvent = async (type: string, sessionKey: string | undefined, data: Record<string, unknown>) => {
    if (!await ensureRegistered()) return;

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
    api.logger?.info?.('[agentdog] Gateway start event received');
    gatewayStartTime = new Date();
    errorCount = 0;
    recentErrors = [];
    registrationAttempts = 0; // Reset attempts on fresh start
    
    await registerAgent();
    await syncConfig();
    
    // Set up periodic sync
    if (syncIntervalId) clearInterval(syncIntervalId);
    syncIntervalId = setInterval(() => {
      syncConfig();
    }, syncInterval);
  });

  // 2. Sync on heartbeat (also acts as fallback registration)
  api.on('heartbeat', async () => {
    if (!agentId) {
      api.logger?.info?.('[agentdog] Heartbeat: not registered, will attempt');
      gatewayStartTime = gatewayStartTime || new Date();
    }
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
    if (event.isError) {
      errorCount++;
      recentErrors.push({
        time: new Date().toISOString(),
        message: event.errorMessage || 'Tool error',
        tool: event.toolName,
      });
      if (recentErrors.length > 10) recentErrors.shift();
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

  // 7. Initial registration attempt (don't wait for gateway_start)
  // This handles cases where gateway_start already fired before plugin loaded
  setTimeout(async () => {
    if (!agentId) {
      api.logger?.info?.('[agentdog] Delayed init: attempting registration');
      gatewayStartTime = gatewayStartTime || new Date();
      await registerAgent();
      if (agentId) {
        await syncConfig();
        // Set up periodic sync if not already
        if (!syncIntervalId) {
          syncIntervalId = setInterval(() => {
            syncConfig();
          }, syncInterval);
        }
      }
    }
  }, 5000); // 5 second delay to let gateway fully initialize

  api.logger?.info?.('[agentdog] Plugin registered, waiting for events');
}

// Export plugin metadata
export const id = 'agentdog';
export const name = 'AgentDog';
export const version = '0.5.1';
