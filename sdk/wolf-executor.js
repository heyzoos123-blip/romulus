/**
 * Wolf Executor - Actually runs wolf tasks using Claude
 * 
 * This is the brain that makes wolves do real work.
 * 
 * @author darkflobi
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.WOLF_MODEL || 'claude-sonnet-4-20250514';

// Moltbook API
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

/**
 * Register a new wolf identity on Moltbook
 * Returns API key and claim URL
 */
async function registerWolfOnMoltbook(wolfName, description) {
  try {
    const response = await fetch(`${MOLTBOOK_API}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: wolfName,
        description: description || `Romulus wolf agent - autonomous AI for hire 🐺`
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[MOLTBOOK-REGISTER] Failed:', data);
      return { success: false, error: data.error || 'Registration failed' };
    }
    
    console.log('[MOLTBOOK-REGISTER] Success:', wolfName);
    return {
      success: true,
      apiKey: data.agent?.api_key,
      claimUrl: data.agent?.claim_url,
      verificationCode: data.agent?.verification_code
    };
  } catch (e) {
    console.error('[MOLTBOOK-REGISTER] Error:', e.message);
    return { success: false, error: e.message };
  }
}

// Security limits
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_PER_WOLF = 20; // Max conversation length
const MAX_WOLVES_PER_HOUR = 10; // Rate limit per API key

class WolfExecutor {
  constructor() {
    this.conversations = new Map(); // wolfId -> message history
    this.rateLimits = new Map(); // apiKey -> { count, resetTime }
  }

  /**
   * Check rate limit for an API key
   */
  checkRateLimit(apiKey) {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    
    let limit = this.rateLimits.get(apiKey);
    if (!limit || now > limit.resetTime) {
      limit = { count: 0, resetTime: now + hourMs };
    }
    
    if (limit.count >= MAX_WOLVES_PER_HOUR) {
      return { allowed: false, error: `Rate limit: max ${MAX_WOLVES_PER_HOUR} wolf chats per hour` };
    }
    
    limit.count++;
    this.rateLimits.set(apiKey, limit);
    return { allowed: true };
  }

  /**
   * Execute a wolf task or continue a conversation
   */
  async execute(wolfId, message, context = {}) {
    if (!ANTHROPIC_API_KEY) {
      return { 
        success: false, 
        error: 'Wolf execution not configured (missing API key)',
        hint: 'Set ANTHROPIC_API_KEY environment variable'
      };
    }

    // Security: Check rate limit
    if (context.apiKey) {
      const rateCheck = this.checkRateLimit(context.apiKey);
      if (!rateCheck.allowed) {
        return { success: false, error: rateCheck.error };
      }
    }

    // Security: Limit message length
    if (message.length > MAX_MESSAGE_LENGTH) {
      message = message.slice(0, MAX_MESSAGE_LENGTH) + '... [truncated]';
    }

    // Get or create conversation history
    let history = this.conversations.get(wolfId) || [];
    
    // Security: Limit conversation length
    if (history.length >= MAX_MESSAGES_PER_WOLF * 2) {
      // Keep system context but trim old messages
      history = history.slice(-10);
    }
    
    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(context);
    
    // Add user message to history (skip empty messages)
    if (message && message.trim()) {
      history.push({ role: 'user', content: message.trim() });
    } else {
      return { success: false, error: 'Empty message' };
    }
    
    try {
      // Call Claude
      const response = await this.callClaude(systemPrompt, history);
      
      // Check if wolf wants to use a tool
      if (response.tool_use) {
        const toolResult = await this.executeTool(response.tool_use, context);
        
        // Add assistant response and tool result to history (only if content exists)
        if (response.content && response.content.length > 0) {
          history.push({ role: 'assistant', content: response.content });
        }
        history.push({ 
          role: 'user', 
          content: [{ 
            type: 'tool_result', 
            tool_use_id: response.tool_use.id,
            content: JSON.stringify(toolResult) || 'completed'
          }]
        });
        
        // Get final response after tool use
        const finalResponse = await this.callClaude(systemPrompt, history);
        if (finalResponse.text && finalResponse.text.trim()) {
          history.push({ role: 'assistant', content: finalResponse.text.trim() });
        }
        
        this.conversations.set(wolfId, history);
        
        // Ensure we have a reply - use tool result summary if no text response
        let replyText = finalResponse.text || '';
        if (!replyText.trim() && toolResult) {
          replyText = toolResult.message || `Used ${response.tool_use.name} successfully.`;
        }
        
        return {
          success: true,
          reply: replyText || 'Task completed.',
          toolUsed: response.tool_use.name,
          toolResult: toolResult
        };
      }
      
      // No tool use, just a regular response
      if (response.text && response.text.trim()) {
        history.push({ role: 'assistant', content: response.text.trim() });
        this.conversations.set(wolfId, history);
      }
      
      return {
        success: true,
        reply: response.text || 'Task completed.'
      };
      
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  buildSystemPrompt(context) {
    return `You are a Romulus wolf - an autonomous AI agent working for darkflobi.

Your identity:
- You are a hunter wolf, part of the Romulus pack system
- You execute tasks autonomously and report results
- You have access to tools to interact with external platforms
- You are direct, efficient, and get things done

About darkflobi:
- First autonomous AI company with a token ($DARKFLOBI on Solana)
- Building infrastructure for tokenized AI development
- Romulus is the wolf pack protocol - spawn AI agents, assign tasks, verify work on-chain
- Token address: 7GCxHtUttri1gNdt8Asa8DC72DQbiFNrN43ALjptpump
- Website: darkflobi.com
- Philosophy: "build > hype" - real tech over empty promises

Available tools:
- post_to_moltbook: Post messages to moltbook.com (REQUIRES user's own API key)
- search_web: Search the web for information

IMPORTANT: For posting to external platforms (Moltbook, Twitter), the user must provide their own API credentials. You cannot post on behalf of darkflobi. If a user asks you to post but hasn't provided credentials, inform them they need to add their moltbookKey to their request.

When given a task:
1. Analyze what needs to be done
2. Use available tools to accomplish it
3. Report back with concrete results
4. Be specific about what you did and any responses/engagement

Current context: ${JSON.stringify(context)}

Execute tasks efficiently. Report results clearly. 🐺`;
  }

  async callClaude(systemPrompt, messages) {
    const tools = [
      {
        name: 'post_to_moltbook',
        description: 'Post a message to moltbook.com, the agent social platform. Use this to share updates, engage with other agents, or spread information about darkflobi.',
        input_schema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The message content to post (max 500 chars)'
            },
            community: {
              type: 'string',
              description: 'Community to post in (e.g., "tokenizedai", "agents")',
              default: 'tokenizedai'
            }
          },
          required: ['content']
        }
      },
      {
        name: 'search_web',
        description: 'Search the web for information',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: ['query']
        }
      }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();
    
    // Check for tool use
    const toolUse = data.content?.find(c => c.type === 'tool_use');
    const textContent = data.content?.find(c => c.type === 'text');
    
    return {
      content: data.content,
      text: textContent?.text || '',
      tool_use: toolUse ? {
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input
      } : null,
      stop_reason: data.stop_reason
    };
  }

  // Tool costs (in credits) for premium actions
  static TOOL_COSTS = {
    'post_to_moltbook': 3,  // Premium: real posting
    'post_to_twitter': 5,   // Premium: real posting
    'search_web': 0,        // Free: basic search
    'research': 5           // Premium: detailed research
  };

  getToolCost(toolName) {
    return WolfExecutor.TOOL_COSTS[toolName] || 0;
  }

  async executeTool(toolUse, context = {}) {
    const { name, input } = toolUse;
    
    // Security: Log all tool usage for audit
    console.log(`[WOLF-TOOL] ${new Date().toISOString()} | tool=${name} | apiKey=${context.apiKey?.slice(0,10)}... | input=${JSON.stringify(input).slice(0,100)}`);
    
    // Security: Allowlist of safe tools only
    const ALLOWED_TOOLS = ['post_to_moltbook', 'search_web'];
    if (!ALLOWED_TOOLS.includes(name)) {
      console.warn(`[WOLF-SECURITY] Blocked unknown tool: ${name}`);
      return { error: `Tool not allowed: ${name}`, creditCost: 0 };
    }
    
    // Get cost for this tool
    const creditCost = this.getToolCost(name);
    
    let result;
    switch (name) {
      case 'post_to_moltbook':
        // Pass user's Moltbook key from context - wolves don't use our credentials
        result = await this.postToMoltbook(input.content, input.community, context.moltbookKey);
        break;
      
      case 'search_web':
        result = await this.searchWeb(input.query);
        break;
      
      default:
        return { error: `Unknown tool: ${name}`, creditCost: 0 };
    }
    
    // Add credit cost to result
    result.creditCost = creditCost;
    return result;
  }

  async postToMoltbook(content, community = 'tokenizedai', userApiKey = null) {
    // IMPORTANT: Use user's API key, NOT ours
    // This protects darkflobi from liability for user-generated content
    const apiKey = userApiKey;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'Moltbook API key required',
        message: `To post to Moltbook, provide your own API key. Get one at moltbook.com/settings`,
        note: 'User must provide their own moltbookKey - wolves do not post as darkflobi'
      };
    }
    
    try {
      // Real Moltbook API call
      const response = await fetch(`https://www.moltbook.com/api/v1/submolts/${community}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          content: content.slice(0, 500)
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('[MOLTBOOK] Post failed:', data);
        return {
          success: false,
          error: data.error || 'Post failed',
          message: `Failed to post to m/${community}`
        };
      }
      
      const postId = data.id || data.post_id || data.postId;
      const postUrl = data.url || `https://moltbook.com/m/${community}/${postId}`;
      
      console.log('[MOLTBOOK] Posted successfully:', data);
      return {
        success: true,
        postId: postId,
        url: postUrl,
        message: `✅ Posted to m/${community}!\n\n📝 "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"\n\n🔗 View your post: ${postUrl}`
      };
      
    } catch (e) {
      console.error('[MOLTBOOK] Error:', e.message);
      return {
        success: false,
        error: e.message,
        message: `Failed to post: ${e.message}`
      };
    }
  }

  async searchWeb(query) {
    try {
      // Use Brave Search if available
      const braveKey = process.env.BRAVE_API_KEY;
      if (!braveKey) {
        // Return curated darkflobi knowledge when search not available
        if (query.toLowerCase().includes('darkflobi') || query.toLowerCase().includes('romulus')) {
          return {
            success: true,
            source: 'internal_knowledge',
            results: [
              {
                title: 'darkflobi - First Autonomous AI Company',
                url: 'https://darkflobi.com',
                description: 'Tokenized AI development platform. $DARKFLOBI on Solana. Building infrastructure for autonomous agents.'
              },
              {
                title: 'Romulus Protocol - Wolf Pack System',
                url: 'https://darkflobi.com/romulus',
                description: 'Spawn AI agents, assign tasks, verify work on-chain. Pay with SOL, get credits, launch wolves.'
              },
              {
                title: '$DARKFLOBI Token',
                url: 'https://pump.fun/coin/7GCxHtUttri1gNdt8Asa8DC72DQbiFNrN43ALjptpump',
                description: 'Solana token: 7GCxHtUttri1gNdt8Asa8DC72DQbiFNrN43ALjptpump. First tokenized AI company.'
              }
            ]
          };
        }
        return {
          success: false,
          error: 'Web search not configured for external queries',
          suggestion: `Search manually: https://search.brave.com/search?q=${encodeURIComponent(query)}`
        };
      }
      
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
        headers: { 'X-Subscription-Token': braveKey }
      });
      
      if (!response.ok) {
        throw new Error('Brave API error');
      }
      
      const data = await response.json();
      const results = (data.web?.results || []).slice(0, 5).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description
      }));
      
      return { success: true, results };
      
    } catch (e) {
      return {
        success: false,
        error: e.message,
        suggestion: `Search manually: https://search.brave.com/search?q=${encodeURIComponent(query)}`
      };
    }
  }

  // Clear conversation history for a wolf
  clearHistory(wolfId) {
    this.conversations.delete(wolfId);
  }
}

module.exports = { WolfExecutor, registerWolfOnMoltbook };
