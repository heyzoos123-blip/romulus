/**
 * Romulus Gateway
 * Token-gated AI agent orchestration
 */

import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const app = express();
app.use(express.json());

// Config
const ROMULUS_TOKEN = process.env.ROMULUS_TOKEN || '5ruEtrHGgqxE3Zo1UdRAvVrdetLwq6SFJvLjgth6pump';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const HYPERCORE_URL = process.env.HYPERCORE_URL || 'http://localhost:8443';
const PORT = process.env.PORT || 3000;

// Tier thresholds (in token units, assuming 6 decimals)
const TIERS = {
  basic:    { min: 100_000,   cores: 1, memory: 1024 },
  standard: { min: 500_000,   cores: 2, memory: 2048 },
  pro:      { min: 1_000_000, cores: 4, memory: 4096 },
  power:    { min: 5_000_000, cores: 8, memory: 8192 }
};

// In-memory state (replace with DB in production)
const activeAgents = new Map();
const usageStats = new Map();

const connection = new Connection(SOLANA_RPC);

/**
 * Get $ROMULUS balance for wallet
 */
async function getTokenBalance(wallet) {
  try {
    const walletPubkey = new PublicKey(wallet);
    const tokenMint = new PublicKey(ROMULUS_TOKEN);
    
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: tokenMint
    });

    if (tokenAccounts.value.length === 0) return 0;
    
    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance || 0;
  } catch (err) {
    console.error('Error fetching balance:', err.message);
    return 0;
  }
}

/**
 * Determine tier based on holdings
 */
function getTier(balance) {
  if (balance >= TIERS.power.min) return 'power';
  if (balance >= TIERS.pro.min) return 'pro';
  if (balance >= TIERS.standard.min) return 'standard';
  if (balance >= TIERS.basic.min) return 'basic';
  return null;
}

/**
 * Verify wallet signature
 */
function verifySignature(wallet, message, signature) {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(wallet);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Auth middleware
 */
async function authenticate(req, res, next) {
  const wallet = req.headers['x-wallet'];
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  if (!wallet || !signature || !timestamp) {
    return res.status(401).json({ error: 'Missing auth headers' });
  }

  // Check timestamp (5 min window)
  const ts = parseInt(timestamp);
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'Timestamp expired' });
  }

  // Verify signature
  const message = `romulus:${timestamp}`;
  if (!verifySignature(wallet, message, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Check token balance
  const balance = await getTokenBalance(wallet);
  const tier = getTier(balance);

  if (!tier) {
    return res.status(403).json({ 
      error: 'Insufficient $ROMULUS holdings',
      balance,
      required: TIERS.basic.min
    });
  }

  req.wallet = wallet;
  req.balance = balance;
  req.tier = tier;
  req.tierConfig = TIERS[tier];
  
  next();
}

/**
 * Spawn agent VM
 */
app.post('/spawn', authenticate, async (req, res) => {
  const { wallet, tier, tierConfig } = req;
  const { agent_type = 'chat', image_ref } = req.body;

  // Check if already has active agent
  if (activeAgents.has(wallet)) {
    return res.status(409).json({ 
      error: 'Already have active agent',
      agent_id: activeAgents.get(wallet).id
    });
  }

  // Default images per type
  const images = {
    chat: 'ghcr.io/romulus-ai/agent-chat:latest',
    coding: 'ghcr.io/romulus-ai/agent-coding:latest',
    browser: 'ghcr.io/romulus-ai/agent-browser:latest'
  };

  const imageToUse = image_ref || images[agent_type] || images.chat;

  try {
    // Call Hypercore spawn API
    const response = await fetch(`${HYPERCORE_URL}/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_ref: imageToUse,
        cores: tierConfig.cores,
        memory: tierConfig.memory,
        ports: { '443': 8080 },
        env: [
          `WALLET=${wallet}`,
          `TIER=${tier}`
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Spawn failed');
    }

    // Track active agent
    const agentInfo = {
      id: data.response.id,
      url: data.response.url,
      wallet,
      tier,
      spawned_at: Date.now()
    };
    activeAgents.set(wallet, agentInfo);

    // Initialize usage tracking
    if (!usageStats.has(wallet)) {
      usageStats.set(wallet, { total_uptime_ms: 0, spawns: 0 });
    }
    usageStats.get(wallet).spawns++;

    res.json({
      success: true,
      agent: agentInfo,
      tier_config: tierConfig
    });

  } catch (err) {
    console.error('Spawn error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Stop agent VM
 */
app.post('/stop/:id', authenticate, async (req, res) => {
  const { wallet } = req;
  const { id } = req.params;

  const agent = activeAgents.get(wallet);
  if (!agent || agent.id !== id) {
    return res.status(404).json({ error: 'Agent not found or not owned' });
  }

  try {
    const response = await fetch(`${HYPERCORE_URL}/stop?id=${id}`);
    
    if (!response.ok) {
      throw new Error('Stop failed');
    }

    // Update usage stats
    const uptime = Date.now() - agent.spawned_at;
    usageStats.get(wallet).total_uptime_ms += uptime;

    activeAgents.delete(wallet);

    res.json({ success: true, uptime_ms: uptime });

  } catch (err) {
    console.error('Stop error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get agent status
 */
app.get('/status/:id', authenticate, async (req, res) => {
  const { wallet } = req;
  const { id } = req.params;

  const agent = activeAgents.get(wallet);
  if (!agent || agent.id !== id) {
    return res.status(404).json({ error: 'Agent not found or not owned' });
  }

  res.json({
    agent,
    uptime_ms: Date.now() - agent.spawned_at
  });
});

/**
 * Get usage stats
 */
app.get('/usage/:wallet', async (req, res) => {
  const { wallet } = req.params;
  const stats = usageStats.get(wallet) || { total_uptime_ms: 0, spawns: 0 };
  const active = activeAgents.get(wallet);

  res.json({
    wallet,
    stats,
    active_agent: active ? {
      id: active.id,
      url: active.url,
      uptime_ms: Date.now() - active.spawned_at
    } : null
  });
});

/**
 * List all active agents (admin)
 */
app.get('/admin/agents', (req, res) => {
  const agents = Array.from(activeAgents.values());
  res.json({ count: agents.length, agents });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * Tier info
 */
app.get('/tiers', (req, res) => {
  res.json(TIERS);
});

app.listen(PORT, () => {
  console.log(`🚀 Romulus Gateway running on port ${PORT}`);
  console.log(`📍 Hypercore: ${HYPERCORE_URL}`);
  console.log(`🪙 Token: ${ROMULUS_TOKEN}`);
});
