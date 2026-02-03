#!/usr/bin/env node
/**
 * Romulus API Server
 * 
 * HTTP endpoints for external agents to interact with Romulus:
 * - Register packs
 * - Spawn wolves
 * - Check status
 * - Verify hunts
 * 
 * This makes Romulus accessible to ANY agent, anywhere.
 * 
 * @author darkflobi
 * @port 3030
 */

const http = require('http');
const url = require('url');
const { RomulusClient } = require('../sdk/romulus-client');
const { ProofOfHunt } = require('../scripts/proof-of-hunt');
const { TreasuryWolf } = require('../scripts/treasury-wolf');
const { BountyBoard } = require('../sdk/bounty-board');
const { ActivityFeed } = require('../sdk/activity-feed');
const { ProofAnchor } = require('../sdk/proof-anchor');
const { AgentCommerce } = require('../sdk/agent-commerce');
const { PaymentGate } = require('../sdk/payment-gate');

// Initialize services
const bountyBoard = new BountyBoard();
const paymentGate = new PaymentGate();
const activityFeed = new ActivityFeed();
const proofAnchor = new ProofAnchor();
const agentCommerce = new AgentCommerce();

const PORT = process.env.PORT || process.env.ROMULUS_PORT || 3030;

// ═══════════════════════════════════════════════════════
// SECURITY: API Key Authentication
// ═══════════════════════════════════════════════════════
const MASTER_API_KEY = process.env.ROMULUS_MASTER_KEY || null;
const REQUIRE_AUTH = process.env.ROMULUS_REQUIRE_AUTH !== 'false'; // default: true

// Rate limiting for registration (IP -> timestamp[])
const registrationAttempts = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3; // max 3 registrations per hour per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = registrationAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
  registrationAttempts.set(ip, recentAttempts);
  return recentAttempts.length < RATE_LIMIT_MAX;
}

function recordAttempt(ip) {
  const attempts = registrationAttempts.get(ip) || [];
  attempts.push(Date.now());
  registrationAttempts.set(ip, attempts);
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.socket?.remoteAddress || 
         'unknown';
}

function checkAuth(req) {
  if (!REQUIRE_AUTH) {
    return { authorized: true, reason: 'auth_disabled' };
  }
  
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];
  
  // Extract the key from either header
  let apiKey = null;
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader;
  }
  
  if (!apiKey) {
    return { authorized: false, reason: 'missing_key' };
  }
  
  // Check master key first
  if (MASTER_API_KEY && apiKey === MASTER_API_KEY) {
    return { authorized: true, reason: 'master_key' };
  }
  
  // Check paid keys through PaymentGate
  const validation = paymentGate.validateKey(apiKey);
  if (validation.valid) {
    return { authorized: true, reason: validation.isMaster ? 'master_key' : 'paid_key', record: validation.record };
  }
  
  return { authorized: false, reason: validation.error || 'invalid_key' };
}

// Initialize services
const romulus = new RomulusClient();

// Simple JSON response helper
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Powered-By': 'Romulus/darkflobi'
  });
  res.end(JSON.stringify(data, null, 2));
}

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Route handlers
const routes = {
  // Health check
  'GET /': (req, res) => {
    jsonResponse(res, {
      protocol: 'romulus',
      version: '1.0.0',
      status: 'hunting',
      message: 'spawn your pack. build your empire. 🐺',
      endpoints: [
        'GET  /                  - this info',
        '--- ACCESS (pay to use) ---',
        'GET  /access/pricing    - get pricing & credit costs',
        'POST /access/purchase   - buy credits (0.05 SOL = 50 credits)',
        'GET  /access/balance    - check your credit balance (🔑)',
        'GET  /access/stats      - public stats',
        '--- CORE ---',
        'GET  /stats             - network statistics',
        'GET  /packs             - list all packs',
        'POST /packs/register    - register new pack (🔑 requires key)',
        'POST /wolves/spawn      - spawn a wolf (🔑 requires key)',
        'GET  /wolves/:packId    - list pack wolves',
        'POST /hunts/complete    - complete a hunt (🔑 requires key)',
        'POST /hunts/prove       - log proof on-chain (🔑 requires key)',
        'GET  /treasury          - treasury status',
        '--- BOUNTY BOARD ---',
        'GET  /bounties          - list open bounties',
        'GET  /bounties/stats    - bounty statistics',
        'POST /bounties          - post a bounty',
        'POST /bounties/claim    - claim a bounty',
        'POST /bounties/submit   - submit completion',
        'POST /bounties/verify   - verify & payout',
        'GET  /bounties/leaderboard - wolf rankings',
        '--- ACTIVITY FEED ---',
        'GET  /activity          - recent events',
        'GET  /activity/summary  - activity summary',
        'POST /activity          - log custom event',
        '--- ON-CHAIN PROOFS ---',
        'GET  /proofs            - recent proofs',
        'GET  /proofs/stats      - proof statistics',
        'POST /proofs/anchor     - anchor work to solana',
        'GET  /proofs/verify/:tx - verify on-chain',
        'GET  /proofs/wolf/:id   - proofs by wolf',
        '--- AGENT COMMERCE ---',
        'GET  /commerce/stats    - commerce statistics',
        'GET  /commerce/agents   - known agents',
        'POST /commerce/agents   - register agent',
        'GET  /commerce/contracts - recent contracts',
        'POST /commerce/hire     - hire an agent',
        'POST /commerce/pay/:id  - pay for work'
      ]
    });
  },

  // Network stats
  'GET /stats': (req, res) => {
    const stats = romulus.getNetworkStats();
    jsonResponse(res, {
      ...stats,
      protocol: 'romulus',
      alpha: 'darkflobi'
    });
  },

  // ═══════════════════════════════════════════════════════
  // ACCESS / PAYMENT ENDPOINTS (public)
  // ═══════════════════════════════════════════════════════

  // Get pricing info (PUBLIC)
  'GET /access/pricing': (req, res) => {
    const pricing = paymentGate.getPricing();
    jsonResponse(res, {
      ...pricing,
      note: 'One-time payment grants permanent API access',
      protocol: 'romulus'
    });
  },

  // Purchase credits - verify payment and issue/top-up key (PUBLIC)
  'POST /access/purchase': async (req, res) => {
    try {
      const body = await parseBody(req);
      
      if (!body.txSignature) {
        return jsonResponse(res, { 
          error: 'txSignature is required',
          hint: 'Send SOL to treasury, then provide the transaction signature'
        }, 400);
      }
      
      // Allow topping up existing key
      const result = await paymentGate.purchaseCredits(
        body.txSignature,
        body.payerWallet || 'unknown',
        body.apiKey // optional - to top up existing key
      );
      
      if (!result.success) {
        return jsonResponse(res, { error: result.error }, 400);
      }
      
      // Log the purchase
      activityFeed.log('credits_purchased', {
        payerWallet: body.payerWallet,
        amountSOL: result.amountPaid,
        credits: result.credits || result.creditsAdded
      });
      
      jsonResponse(res, result, 201);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 500);
    }
  },

  // Check credit balance (requires auth)
  'GET /access/balance': (req, res) => {
    const auth = checkAuth(req);
    if (!auth.authorized) {
      return jsonResponse(res, { 
        error: 'Unauthorized', 
        hint: 'Provide your API key to check balance'
      }, 401);
    }
    
    const apiKey = req.headers['authorization']?.slice(7) || req.headers['x-api-key'];
    const balance = paymentGate.checkCredits(apiKey);
    
    if (!balance.valid) {
      return jsonResponse(res, { error: balance.error }, 400);
    }
    
    jsonResponse(res, {
      credits: balance.credits,
      totalPurchased: balance.totalPurchased,
      totalUsed: balance.totalUsed,
      isMaster: balance.isMaster || false,
      costs: paymentGate.getPricing().costs
    });
  },

  // Access stats (PUBLIC - shows aggregate only)
  'GET /access/stats': (req, res) => {
    const stats = paymentGate.getStats();
    jsonResponse(res, {
      ...stats,
      pricing: paymentGate.getPricing()
    });
  },

  // ═══════════════════════════════════════════════════════
  // CORE ENDPOINTS
  // ═══════════════════════════════════════════════════════

  // List packs
  'GET /packs': (req, res) => {
    const packs = romulus.listPacks();
    jsonResponse(res, { packs, count: packs.length });
  },

  // Register pack (PROTECTED + RATE LIMITED)
  'POST /packs/register': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      // Rate limit check
      const clientIP = getClientIP(req);
      if (!checkRateLimit(clientIP)) {
        return jsonResponse(res, { 
          error: 'Rate limit exceeded', 
          hint: `Max ${RATE_LIMIT_MAX} registrations per hour`
        }, 429);
      }
      
      const body = await parseBody(req);
      if (!body.name) {
        return jsonResponse(res, { error: 'name is required' }, 400);
      }
      
      recordAttempt(clientIP);
      
      const result = romulus.registerPack({
        name: body.name,
        alpha: body.alpha || 'anonymous',
        treasury: body.treasury || null,
        description: body.description || ''
      });
      jsonResponse(res, result, 201);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Spawn wolf (PROTECTED + COSTS CREDITS)
  'POST /wolves/spawn': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      // Get API key for credit deduction
      const apiKey = req.headers['authorization']?.slice(7) || req.headers['x-api-key'];
      
      // Check and deduct credits
      const creditResult = paymentGate.useCredits(apiKey, 'wolf_spawn');
      if (!creditResult.success) {
        return jsonResponse(res, { 
          error: creditResult.error,
          credits: creditResult.credits,
          needed: creditResult.needed,
          hint: 'Top up at POST /access/purchase'
        }, 402); // 402 Payment Required
      }
      
      const body = await parseBody(req);
      if (!body.packId) {
        return jsonResponse(res, { error: 'packId is required' }, 400);
      }
      const result = romulus.spawnWolf(body.packId, {
        type: body.type || 'custom',
        task: body.task || 'hunt',
        model: body.model
      });
      if (result.error) {
        return jsonResponse(res, result, 404);
      }
      
      // Add credits info to response
      result.creditsRemaining = creditResult.remaining;
      
      jsonResponse(res, result, 201);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // List pack wolves
  'GET /wolves/:packId': (req, res, params) => {
    const pack = romulus.getPack(params.packId);
    if (!pack) {
      return jsonResponse(res, { error: 'Pack not found' }, 404);
    }
    jsonResponse(res, {
      packId: pack.id,
      packName: pack.name,
      wolves: pack.wolves,
      count: pack.wolves.length
    });
  },

  // Complete hunt (PROTECTED)
  'POST /hunts/complete': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.wolfId || !body.result) {
        return jsonResponse(res, { error: 'wolfId and result required' }, 400);
      }
      const result = romulus.completeHunt(body.wolfId, body.result);
      jsonResponse(res, result);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Treasury status (sanitized errors)
  'GET /treasury': async (req, res) => {
    try {
      const treasury = await new TreasuryWolf().init();
      const status = await treasury.status();
      jsonResponse(res, status);
    } catch (e) {
      // Don't leak internal paths in error messages
      jsonResponse(res, { 
        error: 'Treasury unavailable',
        hint: 'Treasury wallet not configured'
      }, 503);
    }
  },

  // ═══════════════════════════════════════════════════════
  // BOUNTY BOARD ENDPOINTS
  // ═══════════════════════════════════════════════════════

  // Bounty stats
  'GET /bounties/stats': (req, res) => {
    const stats = bountyBoard.getStats();
    jsonResponse(res, stats);
  },

  // List bounties
  'GET /bounties': (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const filters = {
      status: parsedUrl.query.status || 'open',
      type: parsedUrl.query.type,
      limit: parseInt(parsedUrl.query.limit) || 50
    };
    const bounties = bountyBoard.listBounties(filters);
    jsonResponse(res, bounties);
  },

  // Post bounty (PROTECTED)
  'POST /bounties': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.title || !body.description) {
        return jsonResponse(res, { error: 'title and description required' }, 400);
      }
      const result = bountyBoard.postBounty({
        title: body.title,
        description: body.description,
        type: body.type || 'general',
        reward: body.reward || 0,
        poster: body.poster || 'anonymous',
        posterWallet: body.posterWallet,
        requirements: body.requirements || [],
        deadline: body.deadline
      });
      jsonResponse(res, result, 201);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Claim bounty (PROTECTED)
  'POST /bounties/claim': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.bountyId || !body.wolfId) {
        return jsonResponse(res, { error: 'bountyId and wolfId required' }, 400);
      }
      const result = bountyBoard.claimBounty(body.bountyId, body.wolfId, body.wolfWallet);
      jsonResponse(res, result);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Submit completion (PROTECTED)
  'POST /bounties/submit': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.bountyId || !body.wolfId || !body.proof) {
        return jsonResponse(res, { error: 'bountyId, wolfId, and proof required' }, 400);
      }
      const result = bountyBoard.submitCompletion(body.bountyId, body.wolfId, body.proof);
      jsonResponse(res, result);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Verify completion (PROTECTED)
  'POST /bounties/verify': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.bountyId || body.approved === undefined) {
        return jsonResponse(res, { error: 'bountyId and approved required' }, 400);
      }
      const result = bountyBoard.verifyCompletion(body.bountyId, body.verifierId || 'admin', body.approved);
      jsonResponse(res, result);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Wolf leaderboard
  'GET /bounties/leaderboard': (req, res) => {
    const leaderboard = bountyBoard.getLeaderboard(20);
    jsonResponse(res, leaderboard);
  },

  // ═══════════════════════════════════════════════════════
  // ACTIVITY FEED ENDPOINTS
  // ═══════════════════════════════════════════════════════

  // Recent activity
  'GET /activity': (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const limit = parseInt(parsedUrl.query.limit) || 50;
    const sinceId = parseInt(parsedUrl.query.since) || 0;
    const events = activityFeed.getRecent(limit, sinceId);
    jsonResponse(res, events);
  },

  // Activity summary
  'GET /activity/summary': (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const hours = parseInt(parsedUrl.query.hours) || 24;
    const summary = activityFeed.getSummary(hours);
    jsonResponse(res, summary);
  },

  // Log custom event (PROTECTED)
  'POST /activity': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.type || !body.data) {
        return jsonResponse(res, { error: 'type and data required' }, 400);
      }
      const event = activityFeed.log(body.type, body.data);
      jsonResponse(res, { event }, 201);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // ═══════════════════════════════════════════════════════
  // ON-CHAIN PROOF ANCHORING
  // ═══════════════════════════════════════════════════════

  // Proof stats
  'GET /proofs/stats': (req, res) => {
    const stats = proofAnchor.getStats();
    jsonResponse(res, stats);
  },

  // Recent proofs
  'GET /proofs': (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const limit = parseInt(parsedUrl.query.limit) || 20;
    const proofs = proofAnchor.getRecent(limit);
    jsonResponse(res, { proofs, count: proofs.length });
  },

  // Anchor proof to Solana (PROTECTED - costs SOL)
  'POST /proofs/anchor': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.wolfId || !body.taskType) {
        return jsonResponse(res, { error: 'wolfId and taskType required' }, 400);
      }
      const result = await proofAnchor.proveWork({
        wolfId: body.wolfId,
        taskType: body.taskType,
        taskDescription: body.taskDescription || '',
        result: body.result || '',
        agent: body.agent || 'darkflobi',
        metadata: body.metadata || {}
      });
      
      // Log to activity feed
      if (result.success) {
        activityFeed.log('proof_anchored', {
          wolfId: body.wolfId,
          taskType: body.taskType,
          txSignature: result.proof?.txSignature,
          hash: result.proof?.shortHash
        });
      }
      
      jsonResponse(res, result, result.success ? 201 : 500);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 500);
    }
  },

  // Verify on-chain proof
  'GET /proofs/verify/:txSignature': async (req, res, params) => {
    try {
      const verification = await proofAnchor.verifyProof(params.txSignature);
      jsonResponse(res, verification);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 500);
    }
  },

  // Get proofs by wolf
  'GET /proofs/wolf/:wolfId': (req, res, params) => {
    const proofs = proofAnchor.getWolfProofs(params.wolfId);
    jsonResponse(res, { wolfId: params.wolfId, proofs, count: proofs.length });
  },

  // ═══════════════════════════════════════════════════════
  // AGENT-TO-AGENT COMMERCE
  // ═══════════════════════════════════════════════════════

  // Commerce stats
  'GET /commerce/stats': (req, res) => {
    const stats = agentCommerce.getStats();
    jsonResponse(res, stats);
  },

  // Known agents directory
  'GET /commerce/agents': (req, res) => {
    jsonResponse(res, { agents: agentCommerce.agentDirectory });
  },

  // Register an agent (PROTECTED)
  'POST /commerce/agents': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.agentId || !body.name) {
        return jsonResponse(res, { error: 'agentId and name required' }, 400);
      }
      const result = agentCommerce.registerAgent(body.agentId, {
        name: body.name,
        api: body.api,
        capabilities: body.capabilities,
        wallet: body.wallet
      });
      jsonResponse(res, result, 201);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 400);
    }
  },

  // Recent contracts
  'GET /commerce/contracts': (req, res) => {
    const contracts = agentCommerce.getContracts(20);
    jsonResponse(res, { contracts, count: contracts.length });
  },

  // Hire an agent (PROTECTED - involves payments)
  'POST /commerce/hire': async (req, res) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const body = await parseBody(req);
      if (!body.agentId || !body.task || !body.apiEndpoint) {
        return jsonResponse(res, { error: 'agentId, task, and apiEndpoint required' }, 400);
      }
      
      const result = await agentCommerce.hireAgent(
        body.agentId,
        body.task,
        body.payment || 0,
        body.apiEndpoint,
        body.requestPayload
      );

      // Log to activity feed
      activityFeed.log('agent_hired', {
        provider: body.agentId,
        task: body.task,
        payment: body.payment || 0,
        success: result.success
      });

      jsonResponse(res, result, result.success ? 200 : 500);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 500);
    }
  },

  // Pay for completed work (PROTECTED - sends money!)
  'POST /commerce/pay/:contractId': async (req, res, params) => {
    try {
      // Auth check
      const auth = checkAuth(req);
      if (!auth.authorized) {
        return jsonResponse(res, { 
          error: 'Unauthorized', 
          hint: 'Provide Authorization: Bearer <key> or X-API-Key header'
        }, 401);
      }
      
      const result = await agentCommerce.payAgent(params.contractId);
      
      if (result.success) {
        activityFeed.treasuryTransaction('agent_payment', result.payment?.amount, result.payment?.txSignature);
      }
      
      jsonResponse(res, result, result.success ? 200 : 400);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 500);
    }
  }
};

// Request handler
async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;
  
  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Find matching route
  const routeKey = `${method} ${path}`;
  
  // Check exact match first
  if (routes[routeKey]) {
    return routes[routeKey](req, res);
  }
  
  // Check parameterized routes
  for (const [pattern, handler] of Object.entries(routes)) {
    const [routeMethod, routePath] = pattern.split(' ');
    if (routeMethod !== method) continue;
    
    // Simple param matching for :packId etc
    const paramMatch = routePath.match(/:(\w+)/);
    if (paramMatch) {
      const prefix = routePath.split(':')[0];
      if (path.startsWith(prefix)) {
        const paramValue = path.slice(prefix.length);
        return handler(req, res, { [paramMatch[1]]: paramValue });
      }
    }
  }
  
  // 404
  jsonResponse(res, { 
    error: 'Not found',
    hint: 'GET / for available endpoints'
  }, 404);
}

// Start server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
🐺 ═══════════════════════════════════════════════════════════
   ROMULUS API SERVER
   ───────────────────────────────────────────────────────────
   
   Port:     ${PORT}
   Status:   HUNTING
   
   Endpoints:
     GET  /              Info & endpoints
     GET  /stats         Network statistics  
     GET  /packs         List packs
     POST /packs/register    Register pack
     POST /wolves/spawn      Spawn wolf
     GET  /treasury      Treasury status
   
   Any agent can now access Romulus over HTTP.
   
🐺 ═══════════════════════════════════════════════════════════
  `);
});

module.exports = { server, PORT };
