#!/usr/bin/env node
/**
 * proof-anchor.js - Anchor AI work proofs to Solana blockchain
 * 
 * Every wolf task completion gets:
 * 1. Hashed (SHA-256)
 * 2. Anchored to Solana via memo instruction
 * 3. Permanently verifiable on-chain
 * 
 * This is PROOF that AI did WORK. Immutable. Verifiable. Forever.
 * 
 * @author darkflobi
 */

const { 
  Connection, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  PublicKey,
  sendAndConfirmTransaction 
} = require('@solana/web3.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const PROOF_REGISTRY_PATH = path.join(__dirname, '../../../data/romulus-proofs.json');

class ProofAnchor {
  constructor(config = {}) {
    this.connection = new Connection(
      config.rpcUrl || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    this.wallet = config.wallet || this.loadWallet();
    this.registry = this.loadRegistry();
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
    if (fs.existsSync(PROOF_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(PROOF_REGISTRY_PATH));
    }
    return { proofs: [], totalAnchored: 0 };
  }

  saveRegistry() {
    const dir = path.dirname(PROOF_REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROOF_REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Create proof hash from work data
   */
  createProofHash(workData) {
    const payload = {
      timestamp: new Date().toISOString(),
      agent: workData.agent || 'darkflobi',
      wolfId: workData.wolfId,
      taskType: workData.taskType,
      taskDescription: workData.taskDescription,
      result: workData.result,
      metadata: workData.metadata || {}
    };

    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    return {
      hash,
      payload,
      shortHash: hash.slice(0, 16)
    };
  }

  /**
   * Anchor proof to Solana via memo instruction
   */
  async anchorToSolana(proofHash, workData) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'No wallet configured',
        offchainOnly: true,
        hash: proofHash.hash
      };
    }

    try {
      // Create memo content
      const memoContent = JSON.stringify({
        protocol: 'romulus',
        version: '1.0',
        type: 'proof_of_work',
        hash: proofHash.shortHash,
        agent: workData.agent || 'darkflobi',
        wolf: workData.wolfId,
        task: workData.taskType
      });

      // Create memo instruction
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoContent)
      });

      // Build and send transaction
      const transaction = new Transaction().add(memoInstruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      // Record in registry
      const proof = {
        id: `proof-${Date.now().toString(36)}`,
        hash: proofHash.hash,
        shortHash: proofHash.shortHash,
        payload: proofHash.payload,
        txSignature: signature,
        solscanUrl: `https://solscan.io/tx/${signature}`,
        anchoredAt: new Date().toISOString(),
        status: 'anchored'
      };

      this.registry.proofs.push(proof);
      this.registry.totalAnchored++;
      this.saveRegistry();

      return {
        success: true,
        proof,
        message: `work proof anchored to solana 🐺`,
        verify: `https://solscan.io/tx/${signature}`
      };

    } catch (error) {
      // Still record locally even if on-chain fails
      const proof = {
        id: `proof-${Date.now().toString(36)}`,
        hash: proofHash.hash,
        shortHash: proofHash.shortHash,
        payload: proofHash.payload,
        txSignature: null,
        anchoredAt: new Date().toISOString(),
        status: 'pending',
        error: error.message
      };

      this.registry.proofs.push(proof);
      this.saveRegistry();

      return {
        success: false,
        error: error.message,
        proof,
        message: 'proof recorded locally, on-chain anchor pending'
      };
    }
  }

  /**
   * Full proof flow: hash + anchor
   */
  async proveWork(workData) {
    const proofHash = this.createProofHash(workData);
    const result = await this.anchorToSolana(proofHash, workData);
    return result;
  }

  /**
   * Verify a proof exists on-chain
   */
  async verifyProof(txSignature) {
    try {
      const tx = await this.connection.getTransaction(txSignature, {
        commitment: 'confirmed'
      });

      if (!tx) {
        return { verified: false, error: 'Transaction not found' };
      }

      // Check for memo instruction
      const memoInstruction = tx.transaction.message.instructions.find(
        ix => tx.transaction.message.accountKeys[ix.programIdIndex].equals(MEMO_PROGRAM_ID)
      );

      if (!memoInstruction) {
        return { verified: false, error: 'No memo found in transaction' };
      }

      const memoData = Buffer.from(memoInstruction.data).toString();
      
      return {
        verified: true,
        txSignature,
        memoData,
        slot: tx.slot,
        blockTime: tx.blockTime,
        solscanUrl: `https://solscan.io/tx/${txSignature}`
      };

    } catch (error) {
      return { verified: false, error: error.message };
    }
  }

  /**
   * Get all proofs for a wolf
   */
  getWolfProofs(wolfId) {
    return this.registry.proofs.filter(p => p.payload?.wolfId === wolfId);
  }

  /**
   * Get proof statistics
   */
  getStats() {
    const anchored = this.registry.proofs.filter(p => p.status === 'anchored').length;
    const pending = this.registry.proofs.filter(p => p.status === 'pending').length;

    return {
      totalProofs: this.registry.proofs.length,
      anchored,
      pending,
      recentProofs: this.registry.proofs.slice(-10).reverse()
    };
  }

  /**
   * Get recent proofs
   */
  getRecent(limit = 20) {
    return this.registry.proofs.slice(-limit).reverse();
  }
}

module.exports = { ProofAnchor };

// CLI usage
if (require.main === module) {
  const anchor = new ProofAnchor();
  const args = process.argv.slice(2);
  const cmd = args[0];

  async function run() {
    switch (cmd) {
      case 'stats':
        console.log(JSON.stringify(anchor.getStats(), null, 2));
        break;

      case 'prove':
        // node proof-anchor.js prove wolf-001 research "found competitor data"
        const result = await anchor.proveWork({
          wolfId: args[1] || 'wolf-test',
          taskType: args[2] || 'test',
          taskDescription: 'CLI test proof',
          result: args[3] || 'test result'
        });
        console.log(JSON.stringify(result, null, 2));
        break;

      case 'verify':
        // node proof-anchor.js verify <tx-signature>
        const verification = await anchor.verifyProof(args[1]);
        console.log(JSON.stringify(verification, null, 2));
        break;

      case 'recent':
        console.log(JSON.stringify(anchor.getRecent(10), null, 2));
        break;

      default:
        console.log(`
Romulus Proof Anchor 🐺

Usage:
  node proof-anchor.js stats           - proof statistics
  node proof-anchor.js prove <wolf> <type> <result>  - anchor proof to solana
  node proof-anchor.js verify <tx>     - verify on-chain proof
  node proof-anchor.js recent          - recent proofs

Every wolf task becomes permanent, verifiable proof on Solana.
        `);
    }
  }

  run().catch(console.error);
}
