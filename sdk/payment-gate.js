/**
 * Romulus Payment Gate
 * 
 * Verifies SOL payments and issues API keys.
 * Price: 0.05 SOL one-time for API access.
 * 
 * @author darkflobi
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Treasury wallet - payments must be sent here
const TREASURY_WALLET = 'FkjfuNd1pvKLPzQWm77WfRy1yNWRhqbBPt9EexuvvmCD';

// Price in SOL
const ACCESS_PRICE_SOL = 0.05;
const LAMPORTS_PER_SOL = 1_000_000_000;
const ACCESS_PRICE_LAMPORTS = ACCESS_PRICE_SOL * LAMPORTS_PER_SOL;

// Storage for issued keys
const KEYS_FILE = path.join(__dirname, '../data/api-keys.json');

class PaymentGate {
  constructor() {
    this.keys = this.loadKeys();
  }

  loadKeys() {
    try {
      if (fs.existsSync(KEYS_FILE)) {
        return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('Error loading keys:', e.message);
    }
    return { issued: [], revoked: [] };
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
   * @param {string} txSignature - Solana transaction signature
   * @param {string} payerWallet - Wallet that sent the payment
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async verifyPayment(txSignature, payerWallet) {
    try {
      // Check if this tx was already used
      const existingKey = this.keys.issued.find(k => k.txSignature === txSignature);
      if (existingKey) {
        return { 
          valid: false, 
          error: 'Transaction already used',
          existingKey: existingKey.apiKey 
        };
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
        return { valid: false, error: 'Transaction not found' };
      }

      const tx = data.result;
      
      // Check if transaction was successful
      if (tx.meta?.err) {
        return { valid: false, error: 'Transaction failed on-chain' };
      }

      // Find SOL transfer to treasury
      const preBalances = tx.meta?.preBalances || [];
      const postBalances = tx.meta?.postBalances || [];
      const accountKeys = tx.transaction?.message?.accountKeys || [];

      let treasuryIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys[i]?.pubkey || accountKeys[i];
        if (key === TREASURY_WALLET) {
          treasuryIndex = i;
          break;
        }
      }

      if (treasuryIndex === -1) {
        return { valid: false, error: 'Treasury wallet not found in transaction' };
      }

      // Calculate amount received by treasury
      const amountReceived = postBalances[treasuryIndex] - preBalances[treasuryIndex];
      
      if (amountReceived < ACCESS_PRICE_LAMPORTS) {
        const receivedSOL = amountReceived / LAMPORTS_PER_SOL;
        return { 
          valid: false, 
          error: `Insufficient payment: received ${receivedSOL} SOL, required ${ACCESS_PRICE_SOL} SOL` 
        };
      }

      return { 
        valid: true, 
        amountSOL: amountReceived / LAMPORTS_PER_SOL,
        treasuryWallet: TREASURY_WALLET
      };

    } catch (e) {
      return { valid: false, error: `Verification failed: ${e.message}` };
    }
  }

  /**
   * Process a purchase - verify payment and issue key
   * @param {string} txSignature - Solana transaction signature
   * @param {string} payerWallet - Wallet that sent the payment
   * @returns {Promise<{success: boolean, apiKey?: string, error?: string}>}
   */
  async processPurchase(txSignature, payerWallet) {
    const verification = await this.verifyPayment(txSignature, payerWallet);
    
    if (!verification.valid) {
      return { 
        success: false, 
        error: verification.error,
        existingKey: verification.existingKey 
      };
    }

    // Generate and store new API key
    const apiKey = this.generateApiKey();
    const keyRecord = {
      apiKey,
      payerWallet,
      txSignature,
      amountSOL: verification.amountSOL,
      issuedAt: new Date().toISOString(),
      status: 'active'
    };

    this.keys.issued.push(keyRecord);
    this.saveKeys();

    return {
      success: true,
      apiKey,
      message: 'Payment verified. Welcome to the pack. 🐺',
      amountPaid: verification.amountSOL,
      issuedAt: keyRecord.issuedAt
    };
  }

  /**
   * Validate an API key
   * @param {string} apiKey 
   * @returns {{valid: boolean, record?: object}}
   */
  validateKey(apiKey) {
    // Check master key first (from env)
    const masterKey = process.env.ROMULUS_MASTER_KEY;
    if (masterKey && apiKey === masterKey) {
      return { valid: true, isMaster: true };
    }

    // Check issued keys
    const record = this.keys.issued.find(k => k.apiKey === apiKey && k.status === 'active');
    if (record) {
      return { valid: true, record };
    }

    // Check if revoked
    const revoked = this.keys.revoked.find(k => k.apiKey === apiKey);
    if (revoked) {
      return { valid: false, error: 'API key has been revoked' };
    }

    return { valid: false, error: 'Invalid API key' };
  }

  /**
   * Revoke an API key
   * @param {string} apiKey 
   * @returns {{success: boolean, error?: string}}
   */
  revokeKey(apiKey, reason = 'manual') {
    const index = this.keys.issued.findIndex(k => k.apiKey === apiKey);
    if (index === -1) {
      return { success: false, error: 'Key not found' };
    }

    const record = this.keys.issued.splice(index, 1)[0];
    record.status = 'revoked';
    record.revokedAt = new Date().toISOString();
    record.revokeReason = reason;
    this.keys.revoked.push(record);
    this.saveKeys();

    return { success: true, message: 'Key revoked' };
  }

  /**
   * Get pricing info
   */
  getPricing() {
    return {
      price: ACCESS_PRICE_SOL,
      currency: 'SOL',
      treasuryWallet: TREASURY_WALLET,
      description: 'One-time payment for Romulus API access',
      instructions: [
        `1. Send ${ACCESS_PRICE_SOL} SOL to ${TREASURY_WALLET}`,
        '2. Call POST /access/purchase with your tx signature',
        '3. Receive your API key',
        '4. Use key in Authorization header for all requests'
      ]
    };
  }

  /**
   * Get stats
   */
  getStats() {
    const totalRevenue = this.keys.issued.reduce((sum, k) => sum + (k.amountSOL || 0), 0);
    return {
      totalKeysIssued: this.keys.issued.length,
      activeKeys: this.keys.issued.filter(k => k.status === 'active').length,
      revokedKeys: this.keys.revoked.length,
      totalRevenue: `${totalRevenue.toFixed(4)} SOL`
    };
  }
}

module.exports = { PaymentGate, TREASURY_WALLET, ACCESS_PRICE_SOL };
