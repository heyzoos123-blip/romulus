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

// Initialize bounty board
const bountyBoard = new BountyBoard();

const PORT = process.env.ROMULUS_PORT || 3030;

// Initialize services
const romulus = new RomulusClient();

// Simple JSON response helper
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Powered-By': 'Romulus/darkflobi 🐺'
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
        'GET  /stats             - network statistics',
        'GET  /packs             - list all packs',
        'POST /packs/register    - register new pack',
        'POST /wolves/spawn      - spawn a wolf',
        'GET  /wolves/:packId    - list pack wolves',
        'POST /hunts/complete    - complete a hunt',
        'POST /hunts/prove       - log proof on-chain',
        'GET  /treasury          - treasury status',
        '--- BOUNTY BOARD ---',
        'GET  /bounties          - list open bounties',
        'GET  /bounties/stats    - bounty statistics',
        'POST /bounties          - post a bounty',
        'POST /bounties/claim    - claim a bounty',
        'POST /bounties/submit   - submit completion',
        'POST /bounties/verify   - verify & payout',
        'GET  /bounties/leaderboard - wolf rankings'
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

  // List packs
  'GET /packs': (req, res) => {
    const packs = romulus.listPacks();
    jsonResponse(res, { packs, count: packs.length });
  },

  // Register pack
  'POST /packs/register': async (req, res) => {
    try {
      const body = await parseBody(req);
      if (!body.name) {
        return jsonResponse(res, { error: 'name is required' }, 400);
      }
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

  // Spawn wolf
  'POST /wolves/spawn': async (req, res) => {
    try {
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

  // Complete hunt
  'POST /hunts/complete': async (req, res) => {
    try {
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

  // Treasury status
  'GET /treasury': async (req, res) => {
    try {
      const treasury = await new TreasuryWolf().init();
      const status = await treasury.status();
      jsonResponse(res, status);
    } catch (e) {
      jsonResponse(res, { error: e.message }, 500);
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

  // Post bounty
  'POST /bounties': async (req, res) => {
    try {
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

  // Claim bounty
  'POST /bounties/claim': async (req, res) => {
    try {
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

  // Submit completion
  'POST /bounties/submit': async (req, res) => {
    try {
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

  // Verify completion
  'POST /bounties/verify': async (req, res) => {
    try {
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
