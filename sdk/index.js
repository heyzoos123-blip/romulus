/**
 * Agent Treasury Protocol SDK
 * 
 * The economic layer for autonomous AI agents.
 * 
 * @author darkflobi
 * @license MIT
 */

const { AgentFactory, AgentTypes, quickSpawn } = require('./agent-factory');
const { RomulusClient, initializeGenesisPack } = require('./romulus-client');
const { ManagedIdentity } = require('./managed-identity');

/**
 * ATP Agent - Main class for creating treasury-backed agents
 */
class ATPAgent {
  constructor(config) {
    this.id = config.id || `atp-${Date.now().toString(36)}`;
    this.treasury = config.treasury || null;
    this.tokenMint = config.tokenMint || null;
    this.factory = new AgentFactory({ 
      treasury: this.treasury,
      model: config.model 
    });
    
    // Metrics
    this.metrics = {
      totalSpawned: 0,
      totalSpent: 0,
      tasksCompleted: 0,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Spawn a sub-agent with optional budget allocation
   */
  async spawn(type, config) {
    // Check treasury if budget specified
    if (config.budget && this.treasury) {
      const canSpend = await this.treasury.checkBudget(config.budget);
      if (!canSpend) {
        throw new Error(`Insufficient treasury balance for budget: ${config.budget}`);
      }
    }

    const result = await this.factory.spawn(type, config);
    this.metrics.totalSpawned++;
    
    if (config.budget) {
      this.metrics.totalSpent += config.budget;
    }

    return result;
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      id: this.id,
      treasury: this.treasury?.address || 'not configured',
      token: this.tokenMint || 'not configured',
      metrics: this.metrics,
      activeAgents: this.factory.listActive().length
    };
  }

  /**
   * Get all sub-agents
   */
  getSubAgents() {
    return {
      active: this.factory.listActive(),
      history: this.factory.getHistory()
    };
  }
}

/**
 * Treasury interface (to be connected to Solana contract)
 */
class Treasury {
  constructor(config) {
    this.address = config.address;
    this.rpc = config.rpc || 'https://api.mainnet-beta.solana.com';
    this.balance = 0;
    this.spent = 0;
    this.categories = config.categories || [
      { name: 'compute', budget: 0, spent: 0 },
      { name: 'api', budget: 0, spent: 0 },
      { name: 'infra', budget: 0, spent: 0 }
    ];
  }

  async checkBudget(amount) {
    // In production, this queries on-chain balance
    return this.balance >= amount;
  }

  async spend(amount, category = 'compute') {
    // In production, this creates a Solana transaction
    const cat = this.categories.find(c => c.name === category);
    if (cat) {
      cat.spent += amount;
    }
    this.spent += amount;
    this.balance -= amount;
    
    return {
      success: true,
      txId: `sim-${Date.now()}`,
      remaining: this.balance
    };
  }

  async getTransactions() {
    // In production, this fetches from Solana
    return [];
  }

  getStatus() {
    return {
      address: this.address,
      balance: this.balance,
      totalSpent: this.spent,
      categories: this.categories
    };
  }
}

/**
 * Voice Identity layer
 */
class VoiceIdentity {
  constructor(config) {
    this.agentId = config.agentId;
    this.verificationEndpoint = config.verificationEndpoint || 'https://darkflobi.com/verify';
  }

  async generateHash(content) {
    // Simple hash for demo - in production use crypto
    const hash = Buffer.from(content).toString('base64').slice(0, 32);
    return `voice-${this.agentId}-${hash}`;
  }

  async verify(hash) {
    // Check against verification log
    return {
      valid: true,
      hash,
      verificationUrl: `${this.verificationEndpoint}?hash=${hash}`
    };
  }
}

// Export everything
module.exports = {
  ATPAgent,
  Treasury,
  VoiceIdentity,
  AgentFactory,
  AgentTypes,
  quickSpawn,
  RomulusClient,
  ManagedIdentity,
  initializeGenesisPack
};
