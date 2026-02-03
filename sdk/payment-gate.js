/**
 * Romulus Payment Gate v2
 * 
 * Credit-based system:
 * - 0.05 SOL = 50 wolf spawn credits
 * - Each spawn costs 1 credit
 * - Top up anytime with more SOL
 * 
 * @author darkflobi
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Treasury wallet - payments must be sent here
const TREASURY_WALLET = 'FkjfuNd1pvKLPzQWm77WfRy1yNWRhqbBPt9EexuvvmCD';

// Pricing (optimized for profit)
const CREDITS_PER_SOL = 500;   // 1 SOL = 500 credits ($0.40/spawn at $200 SOL)
const MIN_PURCHASE_SOL = 0.05; // Minimum purchase
const MIN_CREDITS = MIN_PURCHASE_SOL * CREDITS_PER_SOL; // 25 credits minimum
const LAMPORTS_PER_SOL = 1_000_000_000;

// Cost per operation (in credits)
const COSTS = {
  wolf_spawn: 1,
  bounty_post: 1,
  proof_anchor: 2,  // on-chain costs more
  agent_hire: 1
};

// Storage
const KEYS_FILE = path.join(__dirname, '../data/api-keys.json');

class PaymentGate {
  constructor() {
    this.keys = this.loadKeys();
  }

  loadKeys() {
    try {
      if (fs.existsSync(KEYS_FILE)) {
        const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        
        // Migrate: build walletToKey mapping from existing records
        if (!keys.walletToKey) {
          keys.walletToKey = {};
          let migrated = 0;
          for (const record of (keys.issued || [])) {
            if (record.payerWallet && record.payerWallet !== 'unknown' && record.status === 'active') {
              keys.walletToKey[record.payerWallet] = record.apiKey;
              migrated++;
            }
          }
          if (migrated > 0) {
            console.log(`[PaymentGate] Migrated ${migrated} wallet→key mappings`);
            // Save the migration
            fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
          }
        }
        
        // Migrate: build txToKey mapping from txHistory
        if (!keys.txToKey) {
          keys.txToKey = {};
          let migrated = 0;
          for (const record of (keys.issued || [])) {
            if (record.txHistory) {
              for (const tx of record.txHistory) {
                keys.txToKey[tx] = record.apiKey;
                migrated++;
              }
            }
          }
          if (migrated > 0) {
            console.log(`[PaymentGate] Migrated ${migrated} tx→key mappings`);
            fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
          }
        }
        
        return keys;
      }
    } catch (e) {
      console.error('Error loading keys:', e.message);
    }
    return { issued: [], revoked: [], transactions: [], walletToKey: {}, txToKey: {} };
  }

  saveKeys() {
    const dir = path.dirname(KEYS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(KEYS_FILE, JSON.stringify(this.keys, null, 2));
  }

  generateApiKey() {
    const random = crypto.randomBytes(24).toString('hex');
    return `rml_${random}`;
  }

  /**
   * Verify a SOL payment transaction
   * Returns: { valid, amountSOL, payerWallet }
   */
  async verifyPayment(txSignature) {
    try {
      // Check if tx already used
      if (this.keys.transactions?.includes(txSignature)) {
        return { valid: false, error: 'Transaction already used' };
      }

      // Fetch transaction from Solana RPC
      const response = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            txSignature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
          ]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        return { valid: false, error: `RPC error: ${data.error.message}` };
      }

      if (!data.result) {
        return { valid: false, error: 'Transaction not found (may need a few seconds to confirm)' };
      }

      const tx = data.result;
      
      if (tx.meta?.err) {
        return { valid: false, error: 'Transaction failed on-chain' };
      }

      // Find SOL transfer to treasury
      const preBalances = tx.meta?.preBalances || [];
      const postBalances = tx.meta?.postBalances || [];
      const accountKeys = tx.transaction?.message?.accountKeys || [];

      let treasuryIndex = -1;
      let payerWallet = null;
      
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys[i]?.pubkey || accountKeys[i];
        if (key === TREASURY_WALLET) {
          treasuryIndex = i;
        }
      }
      
      // First signer is typically the payer
      if (accountKeys.length > 0) {
        payerWallet = accountKeys[0]?.pubkey || accountKeys[0];
      }

      if (treasuryIndex === -1) {
        return { valid: false, error: 'Payment must be sent to treasury: ' + TREASURY_WALLET };
      }

      const amountLamports = postBalances[treasuryIndex] - preBalances[treasuryIndex];
      const amountSOL = amountLamports / LAMPORTS_PER_SOL;
      
      if (amountSOL < MIN_PURCHASE_SOL) {
        return { 
          valid: false, 
          error: `Minimum purchase is ${MIN_PURCHASE_SOL} SOL (received ${amountSOL.toFixed(4)} SOL)` 
        };
      }

      return { valid: true, amountSOL, payerWallet };

    } catch (e) {
      return { valid: false, error: `Verification failed: ${e.message}` };
    }
  }

  /**
   * Purchase credits - wallet is the identity
   * Same wallet always maps to same API key (auto top-up)
   */
  async purchaseCredits(txSignature, _payerWalletIgnored = null, _existingApiKeyIgnored = null) {
    const verification = await this.verifyPayment(txSignature);
    
    if (!verification.valid) {
      return { success: false, error: verification.error };
    }

    const payerWallet = verification.payerWallet;
    if (!payerWallet) {
      return { success: false, error: 'Could not determine payer wallet from transaction' };
    }

    const creditsToAdd = Math.floor(verification.amountSOL * CREDITS_PER_SOL);
    
    // Initialize mappings
    if (!this.keys.transactions) this.keys.transactions = [];
    if (!this.keys.txToKey) this.keys.txToKey = {};
    if (!this.keys.walletToKey) this.keys.walletToKey = {};
    this.keys.transactions.push(txSignature);

    // Check if wallet already has a key (auto top-up)
    const existingApiKey = this.keys.walletToKey[payerWallet];
    if (existingApiKey) {
      const record = this.keys.issued.find(k => k.apiKey === existingApiKey && k.status === 'active');
      if (record) {
        record.credits += creditsToAdd;
        record.totalPurchased = (record.totalPurchased || 0) + verification.amountSOL;
        record.lastTopUp = new Date().toISOString();
        if (!record.txHistory) record.txHistory = [];
        record.txHistory.push(txSignature);
        // Map this tx to the key for recovery
        this.keys.txToKey[txSignature] = existingApiKey;
        this.saveKeys();
        
        return {
          success: true,
          apiKey: existingApiKey,
          creditsAdded: creditsToAdd,
          totalCredits: record.credits,
          amountPaid: verification.amountSOL,
          wallet: payerWallet,
          message: `Added ${creditsToAdd} credits to your account 🐺`
        };
      }
    }

    // New wallet - create new key
    const apiKey = this.generateApiKey();
    const keyRecord = {
      apiKey,
      payerWallet,
      credits: creditsToAdd,
      totalPurchased: verification.amountSOL,
      totalUsed: 0,
      issuedAt: new Date().toISOString(),
      status: 'active',
      txHistory: [txSignature]
    };

    // Map tx and wallet to key for recovery
    this.keys.txToKey[txSignature] = apiKey;
    this.keys.walletToKey[payerWallet] = apiKey;
    
    this.keys.issued.push(keyRecord);
    this.saveKeys();

    return {
      success: true,
      apiKey,
      credits: creditsToAdd,
      amountPaid: verification.amountSOL,
      wallet: payerWallet,
      message: `Welcome to the pack. ${creditsToAdd} credits loaded. 🐺`
    };
  }

  /**
   * Use credits for an operation
   */
  useCredits(apiKey, operation = 'wolf_spawn') {
    const cost = COSTS[operation] || 1;
    
    // Master key has unlimited credits
    const masterKey = process.env.ROMULUS_MASTER_KEY;
    if (masterKey && apiKey === masterKey) {
      return { success: true, isMaster: true, remaining: Infinity };
    }

    const record = this.keys.issued.find(k => k.apiKey === apiKey && k.status === 'active');
    if (!record) {
      return { success: false, error: 'Invalid API key' };
    }

    if (record.credits < cost) {
      return { 
        success: false, 
        error: `Insufficient credits. Need ${cost}, have ${record.credits}. Top up at /access/pricing`,
        credits: record.credits,
        needed: cost
      };
    }

    record.credits -= cost;
    record.totalUsed = (record.totalUsed || 0) + cost;
    this.saveKeys();

    return { 
      success: true, 
      creditsUsed: cost,
      remaining: record.credits 
    };
  }

  /**
   * Check credits without using them
   */
  checkCredits(apiKey) {
    const masterKey = process.env.ROMULUS_MASTER_KEY;
    if (masterKey && apiKey === masterKey) {
      return { valid: true, credits: Infinity, isMaster: true };
    }

    const record = this.keys.issued.find(k => k.apiKey === apiKey && k.status === 'active');
    if (!record) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { 
      valid: true, 
      credits: record.credits,
      totalPurchased: record.totalPurchased,
      totalUsed: record.totalUsed
    };
  }

  /**
   * Validate key exists (for auth check)
   */
  validateKey(apiKey) {
    const masterKey = process.env.ROMULUS_MASTER_KEY;
    if (masterKey && apiKey === masterKey) {
      return { valid: true, isMaster: true };
    }

    const record = this.keys.issued.find(k => k.apiKey === apiKey && k.status === 'active');
    if (record) {
      return { valid: true, record, credits: record.credits };
    }

    const revoked = this.keys.revoked?.find(k => k.apiKey === apiKey);
    if (revoked) {
      return { valid: false, error: 'API key has been revoked' };
    }

    return { valid: false, error: 'Invalid API key' };
  }

  /**
   * Recover API key from transaction signature
   * We fetch the tx on-chain to get the payer wallet, then return their key
   */
  async recoverKey(txSignature) {
    // First check direct tx mapping (fast path)
    if (this.keys.txToKey && this.keys.txToKey[txSignature]) {
      const apiKey = this.keys.txToKey[txSignature];
      const record = this.keys.issued.find(k => k.apiKey === apiKey);
      
      if (!record) {
        return { success: false, error: 'Key record not found (may have been revoked)' };
      }
      
      if (record.status !== 'active') {
        return { success: false, error: 'This API key has been revoked' };
      }
      
      return {
        success: true,
        apiKey: record.apiKey,
        credits: record.credits,
        totalPurchased: record.totalPurchased,
        wallet: record.payerWallet,
        message: 'Key recovered. Welcome back 🐺'
      };
    }
    
    // Fetch tx from chain to get the wallet
    try {
      const response = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            txSignature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
          ]
        })
      });

      const data = await response.json();
      
      if (!data.result) {
        return { success: false, error: 'Transaction not found on-chain' };
      }

      // Get payer wallet from tx
      const accountKeys = data.result.transaction?.message?.accountKeys || [];
      const payerWallet = accountKeys[0]?.pubkey || accountKeys[0];
      
      if (!payerWallet) {
        return { success: false, error: 'Could not determine wallet from transaction' };
      }
      
      // Look up by wallet
      if (this.keys.walletToKey && this.keys.walletToKey[payerWallet]) {
        const apiKey = this.keys.walletToKey[payerWallet];
        const record = this.keys.issued.find(k => k.apiKey === apiKey);
        
        if (record && record.status === 'active') {
          // Update mappings for future
          if (!this.keys.txToKey) this.keys.txToKey = {};
          this.keys.txToKey[txSignature] = apiKey;
          this.saveKeys();
          
          return {
            success: true,
            apiKey: record.apiKey,
            credits: record.credits,
            totalPurchased: record.totalPurchased,
            wallet: payerWallet,
            message: 'Key recovered. Welcome back 🐺'
          };
        }
      }
      
      // Wallet not in our system
      return { 
        success: false, 
        error: `No API key found for wallet ${payerWallet.slice(0,8)}...${payerWallet.slice(-4)}. Have you purchased credits?` 
      };
      
    } catch (e) {
      return { success: false, error: `Recovery failed: ${e.message}` };
    }
  }
  
  /**
   * Recover by wallet address directly (alternative method)
   */
  recoverByWallet(walletAddress) {
    if (!this.keys.walletToKey) {
      return { success: false, error: 'No wallet mappings found' };
    }
    
    const apiKey = this.keys.walletToKey[walletAddress];
    if (!apiKey) {
      return { success: false, error: 'No API key found for this wallet' };
    }
    
    const record = this.keys.issued.find(k => k.apiKey === apiKey);
    if (!record) {
      return { success: false, error: 'Key record not found' };
    }
    
    if (record.status !== 'active') {
      return { success: false, error: 'This API key has been revoked' };
    }
    
    return {
      success: true,
      apiKey: record.apiKey,
      credits: record.credits,
      totalPurchased: record.totalPurchased,
      wallet: walletAddress,
      message: 'Key recovered. Welcome back 🐺'
    };
  }

  /**
   * Get pricing info
   */
  getPricing() {
    return {
      creditsPerSOL: CREDITS_PER_SOL,
      minPurchase: MIN_PURCHASE_SOL,
      minCredits: MIN_CREDITS,
      costs: COSTS,
      treasuryWallet: TREASURY_WALLET,
      example: `${MIN_PURCHASE_SOL} SOL = ${MIN_CREDITS} credits = ${MIN_CREDITS} wolf spawns (~$0.40/spawn)`,
      instructions: [
        `1. Send ${MIN_PURCHASE_SOL}+ SOL to ${TREASURY_WALLET}`,
        '2. Call POST /access/purchase with {"txSignature": "your-tx-sig"}',
        '3. Receive API key with credits',
        '4. Each wolf spawn uses 1 credit',
        '5. Top up anytime by sending more SOL'
      ]
    };
  }

  /**
   * Get stats
   */
  getStats() {
    const totalRevenue = this.keys.issued.reduce((sum, k) => sum + (k.totalPurchased || 0), 0);
    const totalCreditsUsed = this.keys.issued.reduce((sum, k) => sum + (k.totalUsed || 0), 0);
    return {
      totalKeysIssued: this.keys.issued.length,
      activeKeys: this.keys.issued.filter(k => k.status === 'active').length,
      totalRevenue: `${totalRevenue.toFixed(4)} SOL`,
      totalCreditsUsed,
      creditsPerSOL: CREDITS_PER_SOL
    };
  }
}

module.exports = { PaymentGate, TREASURY_WALLET, CREDITS_PER_SOL, MIN_PURCHASE_SOL, COSTS };
