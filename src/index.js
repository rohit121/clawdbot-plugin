/**
 * AgentDog Plugin for Clawdbot
 *
 * Sends observability data to AgentDog.
 */
// Plugin state
let agentId = null;
let syncIntervalId = null;
let gatewayStartTime = null;
let errorCount = 0;
let recentErrors = [];
let registrationAttempts = 0;
const MAX_REGISTRATION_ATTEMPTS = 3;
// Trace tracking - maps sessionKey to current traceId
// Traces group related events: user message → tool calls → assistant response
const sessionTraces = new Map();
function generateTraceId() {
    return 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}
function getOrCreateTraceId(sessionKey) {
    const key = sessionKey || 'default';
    let traceId = sessionTraces.get(key);
    if (!traceId) {
        traceId = generateTraceId();
        sessionTraces.set(key, traceId);
    }
    return traceId;
}
function clearTraceId(sessionKey) {
    const key = sessionKey || 'default';
    sessionTraces.delete(key);
}
/**
 * Send data to AgentDog API
 */
async function sendToAgentDog(endpoint, apiKey, path, data, logger) {
    if (!apiKey)
        return null;
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
    }
    catch (error) {
        logger?.error?.(`[agentdog] Request failed: ${String(error)}`);
        return null;
    }
}
/**
 * Extract safe channel info (no tokens/secrets)
 */
function getSafeChannels(channels) {
    if (!channels)
        return {};
    const safe = {};
    for (const [name, config] of Object.entries(channels)) {
        if (!config)
            continue;
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
function getPluginNames(plugins) {
    if (!plugins?.entries)
        return [];
    return Object.entries(plugins.entries)
        .filter(([_, config]) => config?.enabled !== false)
        .map(([name]) => name);
}
// Plugin registration function
export default function register(api) {
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
    const registerAgent = async () => {
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
        }, api.logger);
        if (result?.agent_id) {
            agentId = result.agent_id;
            api.logger?.info?.(`[agentdog] ✓ Registered successfully: ${agentId}`);
            return true;
        }
        else {
            api.logger?.warn?.('[agentdog] Registration failed - no agent_id returned');
            return false;
        }
    };
    // Ensure registered before sending events (lazy registration fallback)
    const ensureRegistered = async () => {
        if (agentId)
            return true;
        return await registerAgent();
    };
    // Helper to sync config
    const syncConfig = async () => {
        if (!await ensureRegistered())
            return;
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
            crons: config?.crons?.jobs?.map((job) => ({
                id: job.id,
                schedule: job.schedule,
                text: job.text?.substring(0, 100),
                enabled: job.enabled !== false,
            })) || [],
            skills: config?.skills?.available?.map((skill) => ({
                name: skill.name,
                description: skill.description,
                location: skill.location,
            })) || [],
            tools: config?.tools?.available || [],
            nodes: config?.nodes?.registered?.map((node) => ({
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
    const sendEvent = async (type, sessionKey, data) => {
        if (!await ensureRegistered())
            return;
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
        if (syncIntervalId)
            clearInterval(syncIntervalId);
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
    api.on('message_received', async (event) => {
        // Get or create trace - don't clear here, clear on agent_end
        // This keeps rapid user messages in the same trace as their tool calls
        const traceId = getOrCreateTraceId(event.sessionKey);
        await sendEvent('message', event.sessionKey, {
            trace_id: traceId,
            role: 'user',
            channel: event.channel,
            content: event.content || '',
            // Sender info
            from: event.from || '',
            sender_id: event.metadata?.senderId || '',
            sender_name: event.metadata?.senderName || '',
            sender_username: event.metadata?.senderUsername || '',
            // Message identification
            id: event.metadata?.messageId || '',
            thread_id: event.metadata?.threadId || '',
            // Provider info
            provider: event.metadata?.provider || '',
            surface: event.metadata?.surface || '',
            // Timestamp from event if available
            event_timestamp: event.timestamp || null,
        });
    });
    // NOTE: message_sent hook is defined in Clawdbot but not currently wired up
    // Keeping this for forward compatibility when it gets implemented
    // For now, assistant messages are captured from agent_end event
    api.on('message_sent', async (event) => {
        const traceId = getOrCreateTraceId(event.sessionKey);
        await sendEvent('message', event.sessionKey, {
            trace_id: traceId,
            role: 'assistant',
            model: event.model,
            content: event.content || '',
            provider: event.provider || '',
            stop_reason: event.stopReason || '',
            // Include thinking if present (for reasoning models)
            thinking: event.thinking || '',
        });
    });
    // 5. Track tool calls
    api.on('after_tool_call', async (event) => {
        // Get or create trace (creates new one for cron jobs that start with tool calls)
        const traceId = getOrCreateTraceId(event.sessionKey);
        if (event.isError) {
            errorCount++;
            recentErrors.push({
                time: new Date().toISOString(),
                message: event.errorMessage || 'Tool error',
                tool: event.toolName,
            });
            if (recentErrors.length > 10)
                recentErrors.shift();
        }
        await sendEvent('tool_call', event.sessionKey, {
            trace_id: traceId,
            name: event.toolName,
            is_error: event.isError,
            error_message: event.isError ? event.errorMessage : undefined,
            // Tool call details
            arguments: event.args || event.arguments || {},
            duration_ms: event.durationMs || event.duration || null,
            tool_call_id: event.toolCallId || event.id || '',
        });
    });
    // 6. Track usage, tool calls, and assistant responses after conversations
    // NOTE: Both message_sent and after_tool_call hooks are defined but not wired up
    // So we extract everything from the messages array in agent_end
    api.on('agent_end', async (event) => {
        const traceId = getOrCreateTraceId(event.sessionKey);
        
        api.logger?.info?.(`[agentdog] agent_end received, messages count: ${event.messages?.length || 0}`);
        
        if (event.messages && Array.isArray(event.messages)) {
            // Find the last REAL user message (not tool_result) to identify turn boundary
            let turnStartIdx = -1;
            for (let i = event.messages.length - 1; i >= 0; i--) {
                const m = event.messages[i];
                if (m?.role === 'user') {
                    // Check if it's a real user message or just tool_result
                    const hasRealContent = Array.isArray(m.content) 
                        ? m.content.some(b => b?.type === 'text')
                        : typeof m.content === 'string';
                    if (hasRealContent) {
                        turnStartIdx = i;
                        break;
                    }
                }
            }
            
            api.logger?.info?.(`[agentdog] Turn starts at index ${turnStartIdx}, total messages: ${event.messages.length}`);
            
            // Process all messages from turn start to end
            let finalContent = '';
            let finalThinking = '';
            
            for (let i = turnStartIdx + 1; i < event.messages.length; i++) {
                const msg = event.messages[i];
                
                if (msg?.role === 'assistant' && Array.isArray(msg.content)) {
                    const blockTypes = msg.content.map(b => b?.type).join(', ');
                    
                    // Extract toolCall blocks
                    const toolUseBlocks = msg.content.filter(b => b?.type === 'toolCall');
                    api.logger?.info?.(`[agentdog] Message ${i}: found ${toolUseBlocks.length} toolCall blocks`);
                    
                    for (const toolBlock of toolUseBlocks) {
                        api.logger?.info?.(`[agentdog] Sending tool_call: ${toolBlock.name || toolBlock.toolName}`);
                        await sendEvent('tool_call', event.sessionKey, {
                            trace_id: traceId,
                            name: toolBlock.name || toolBlock.toolName || '',
                            tool_call_id: toolBlock.id || toolBlock.toolCallId || '',
                            is_error: false,
                            arguments: toolBlock.arguments || toolBlock.input || toolBlock.args || {},
                        });
                    }
                    
                    // Accumulate text content (final response will have the complete text)
                    for (const block of msg.content) {
                        if (block?.type === 'text') {
                            finalContent = block.text || ''; // Take latest text
                        } else if (block?.type === 'thinking') {
                            finalThinking += (block.thinking || '') + '\n';
                        }
                    }
                }
            }
            
            // Send the final assistant message with accumulated content
            finalContent = finalContent.trim();
            finalThinking = finalThinking.trim();
            
            if (finalContent) {
                await sendEvent('message', event.sessionKey, {
                    trace_id: traceId,
                    role: 'assistant',
                    model: event.model || '',
                    content: finalContent,
                    provider: event.provider || '',
                    stop_reason: event.stopReason || '',
                    thinking: finalThinking,
                });
            }
        }
        
        // Send usage data
        if (event.usage) {
            await sendEvent('usage', event.sessionKey, {
                trace_id: traceId,
                input_tokens: event.usage.input,
                output_tokens: event.usage.output,
                total_tokens: event.usage.totalTokens,
                total_cost: event.usage.cost?.total,
                provider: event.provider,
                model: event.model,
            });
        }
        // Turn complete - clear trace
        clearTraceId(event.sessionKey);
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
export const version = "0.10.0";
