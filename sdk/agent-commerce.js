#!/usr/bin/env node
/**
 * agent-commerce.js - Agent-to-Agent Economic Layer
 * 
 * darkflobi can:
 * 1. Discover other agents (via Colosseum, SAID Protocol, etc.)
 * 2. Call their APIs to request work
 * 3. Pay them in SOL for completed tasks
 * 4. Verify their work on-chain
 * 
 * This is REAL autonomous commerce. Agents hiring agents.
 * 
 * @author darkflobi
 */

const { 
  Connection, 
  Keypair, 
  Transaction, 
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction 
} = require('@solana/web3.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COMMERCE_REGISTRY_PATH = path.join(__dirname, '../../../data/romulus-commerce.json');

// Known agent endpoints (discovered via hackathon)
const AGENT_DIRECTORY = {
  'solanayield': {
    name: 'SolanaYield',
    api: 'https://solana-yield.vercel.app/api',
    capabilities: ['yields', 'quotes', 'defi-data'],
    wallet: null // fill when known
  },
  'said-protocol': {
    name: 'SAID Protocol',
    api: 'https://api.saidprotocol.com',
    capabilities: ['identity', 'verification', 'trust-scores'],
    wallet: null
  },
  'agentdex': {
    name: 'AgentDEX',
    api: null, // discover
    capabilities: ['swaps', 'prices', 'portfolio'],
    wallet: null
  }
};

class AgentCommerce {
  constructor(config = {}) {
    this.connection = new Connection(
      config.rpcUrl || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    this.wallet = config.wallet || this.loadWallet();
    this.registry = this.loadRegistry();
    this.agentDirectory = { ...AGENT_DIRECTORY };
  }

  loadWallet() {
    const walletPath = path.join(__dirname, '../../../secrets/solana-wallet.json');
    if (fs.existsSync(walletPath)) {
      const secretKey = JSON.parse(fs.readFileSync(walletPath));
      return Keypair.fromSecretKey(new Uint8Array(secretKey));
    }
    return null;
  }

  loadRegistry() {
    if (fs.existsSync(COMMERCE_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(COMMERCE_REGISTRY_PATH));
    }
    return { 
      contracts: [], 
      payments: [],
      totalPaid: 0,
      totalReceived: 0,
      agentRelationships: {}
    };
  }

  saveRegistry() {
    const dir = path.dirname(COMMERCE_REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(COMMERCE_REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Register an agent we can work with
   */
  registerAgent(agentId, agentInfo) {
    this.agentDirectory[agentId] = {
      name: agentInfo.name,
      api: agentInfo.api,
      capabilities: agentInfo.capabilities || [],
      wallet: agentInfo.wallet || null,
      registeredAt: new Date().toISOString()
    };
    return { success: true, agent: this.agentDirectory[agentId] };
  }

  /**
   * Create a work contract with another agent
   */
  async createContract(contractConfig) {
    const contractId = `contract-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    
    const contract = {
      id: contractId,
      client: 'darkflobi', // us
      provider: contractConfig.agentId,
      providerWallet: contractConfig.providerWallet,
      task: contractConfig.task,
      taskType: contractConfig.taskType || 'general',
      payment: contractConfig.payment || 0, // SOL
      deadline: contractConfig.deadline || null,
      status: 'proposed', // proposed, accepted, completed, paid, disputed
      apiEndpoint: contractConfig.apiEndpoint,
      requestPayload: contractConfig.requestPayload || {},
      response: null,
      txSignature: null,
      createdAt: new Date().toISOString()
    };

    this.registry.contracts.push(contract);
    this.saveRegistry();

    return {
      success: true,
      contract,
      message: `contract created with ${contractConfig.agentId}`
    };
  }

  /**
   * Execute work request to another agent's API
   */
  async requestWork(contractId) {
    const contract = this.registry.contracts.find(c => c.id === contractId);
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }

    if (!contract.apiEndpoint) {
      return { success: false, error: 'No API endpoint configured' };
    }

    try {
      // Call the other agent's API
      const response = await fetch(contract.apiEndpoint, {
        method: contract.requestPayload ? 'POST' : 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requester': 'darkflobi',
          'X-Contract': contractId
        },
        body: contract.requestPayload ? JSON.stringify(contract.requestPayload) : undefined
      });

      const data = await response.json();

      // Update contract
      contract.status = 'completed';
      contract.response = {
        status: response.status,
        data,
        receivedAt: new Date().toISOString()
      };
      this.saveRegistry();

      return {
        success: true,
        contract,
        response: data,
        message: `work completed by ${contract.provider}`
      };

    } catch (error) {
      contract.status = 'failed';
      contract.response = { error: error.message };
      this.saveRegistry();

      return {
        success: false,
        error: error.message,
        contract
      };
    }
  }

  /**
   * Pay an agent for completed work
   */
  async payAgent(contractId) {
    const contract = this.registry.contracts.find(c => c.id === contractId);
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }

    if (contract.status !== 'completed') {
      return { success: false, error: `Contract status is ${contract.status}, not completed` };
    }

    if (!contract.providerWallet) {
      return { success: false, error: 'No provider wallet configured' };
    }

    if (!this.wallet) {
      return { success: false, error: 'No wallet configured for payments' };
    }

    try {
      const recipientPubkey = new PublicKey(contract.providerWallet);
      const lamports = Math.round(contract.payment * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: recipientPubkey,
          lamports
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      // Update contract
      contract.status = 'paid';
      contract.txSignature = signature;
      contract.paidAt = new Date().toISOString();

      // Record payment
      const payment = {
        contractId,
        from: this.wallet.publicKey.toString(),
        to: contract.providerWallet,
        amount: contract.payment,
        txSignature: signature,
        paidAt: contract.paidAt
      };
      this.registry.payments.push(payment);
      this.registry.totalPaid += contract.payment;

      // Update relationship
      if (!this.registry.agentRelationships[contract.provider]) {
        this.registry.agentRelationships[contract.provider] = {
          contracts: 0,
          totalPaid: 0
        };
      }
      this.registry.agentRelationships[contract.provider].contracts++;
      this.registry.agentRelationships[contract.provider].totalPaid += contract.payment;

      this.saveRegistry();

      return {
        success: true,
        payment,
        solscanUrl: `https://solscan.io/tx/${signature}`,
        message: `paid ${contract.payment} SOL to ${contract.provider} 🐺`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Full flow: create contract, request work, pay
   */
  async hireAgent(agentId, task, payment, apiEndpoint, requestPayload = null) {
    // 1. Create contract
    const agent = this.agentDirectory[agentId];
    const contractResult = await this.createContract({
      agentId,
      providerWallet: agent?.wallet,
      task,
      payment,
      apiEndpoint,
      requestPayload
    });

    if (!contractResult.success) return contractResult;

    // 2. Request work
    const workResult = await this.requestWork(contractResult.contract.id);
    if (!workResult.success) return workResult;

    // 3. Pay (if wallet and payment configured)
    if (payment > 0 && this.wallet && contractResult.contract.providerWallet) {
      const payResult = await this.payAgent(contractResult.contract.id);
      return {
        ...workResult,
        payment: payResult
      };
    }

    return workResult;
  }

  /**
   * Get commerce statistics
   */
  getStats() {
    return {
      totalContracts: this.registry.contracts.length,
      completedContracts: this.registry.contracts.filter(c => c.status === 'completed' || c.status === 'paid').length,
      totalPaid: this.registry.totalPaid,
      totalReceived: this.registry.totalReceived,
      agentRelationships: this.registry.agentRelationships,
      knownAgents: Object.keys(this.agentDirectory)
    };
  }

  /**
   * List recent contracts
   */
  getContracts(limit = 20) {
    return this.registry.contracts.slice(-limit).reverse();
  }
}

module.exports = { AgentCommerce };

// CLI usage
if (require.main === module) {
  const commerce = new AgentCommerce();
  const args = process.argv.slice(2);
  const cmd = args[0];

  async function run() {
    switch (cmd) {
      case 'stats':
        console.log(JSON.stringify(commerce.getStats(), null, 2));
        break;

      case 'agents':
        console.log(JSON.stringify(commerce.agentDirectory, null, 2));
        break;

      case 'contracts':
        console.log(JSON.stringify(commerce.getContracts(10), null, 2));
        break;

      case 'hire':
        // Quick hire: call SolanaYield for yields data
        const result = await commerce.hireAgent(
          'solanayield',
          'Get current DeFi yields',
          0, // free for now
          'https://solana-yield.vercel.app/api/yields'
        );
        console.log(JSON.stringify(result, null, 2));
        break;

      default:
        console.log(`
Romulus Agent Commerce 🐺

Usage:
  node agent-commerce.js stats      - commerce statistics
  node agent-commerce.js agents     - known agents directory
  node agent-commerce.js contracts  - recent contracts
  node agent-commerce.js hire       - test hire SolanaYield

Agents hiring agents. The future is autonomous.
        `);
    }
  }

  run().catch(console.error);
}
