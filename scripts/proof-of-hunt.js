#!/usr/bin/env node
/**
 * proof-of-hunt.js - On-chain verification of wolf work
 * 
 * Every wolf hunt can be logged on-chain as proof:
 * - Memo transaction with hunt details
 * - Verifiable on Solana explorer
 * - Immutable record of pack activity
 * 
 * Cost: ~0.000005 SOL per proof (basically free)
 * 
 * @author darkflobi
 */

const { 
  Connection, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  PublicKey,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WALLET_PATH = path.join(__dirname, '../../../secrets/solana-wallet.json');
const HUNT_LOG_PATH = path.join(__dirname, '../../../data/proof-of-hunt-log.json');
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

class ProofOfHunt {
  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    this.keypair = null;
    this.huntLog = [];
  }

  async init() {
    const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH));
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    
    if (fs.existsSync(HUNT_LOG_PATH)) {
      this.huntLog = JSON.parse(fs.readFileSync(HUNT_LOG_PATH));
    }
    
    console.log('🐺 Proof of Hunt initialized');
    console.log(`   Wallet: ${this.keypair.publicKey.toBase58()}`);
    return this;
  }

  /**
   * Create a hash of the hunt data
   */
  hashHunt(huntData) {
    const data = JSON.stringify(huntData);
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Log a hunt proof on-chain
   */
  async logHunt(wolfType, mission, result, metadata = {}) {
    const timestamp = Date.now();
    const huntId = `hunt-${timestamp.toString(36)}`;
    
    // Create hunt record
    const huntData = {
      id: huntId,
      wolf: wolfType,
      mission: mission.substring(0, 100),
      resultHash: this.hashHunt(result),
      timestamp,
      ...metadata
    };

    // Create memo string (max ~500 chars for memo)
    const memo = JSON.stringify({
      p: 'romulus',           // protocol
      v: '1',                 // version
      t: 'hunt',              // type
      w: wolfType,            // wolf type
      h: huntData.resultHash, // result hash
      ts: timestamp           // timestamp
    });

    console.log(`\n🐺 Logging hunt proof on-chain...`);
    console.log(`   Wolf: ${wolfType}`);
    console.log(`   Hunt ID: ${huntId}`);
    console.log(`   Result hash: ${huntData.resultHash}`);

    try {
      // Create memo instruction
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo)
      });

      // Build transaction
      const transaction = new Transaction().add(memoInstruction);
      transaction.feePayer = this.keypair.publicKey;
      
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Sign and send
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair],
        { commitment: 'confirmed' }
      );

      console.log(`   ✅ Proof logged!`);
      console.log(`   TX: https://solscan.io/tx/${signature}`);

      // Save to local log
      const logEntry = {
        ...huntData,
        signature,
        txUrl: `https://solscan.io/tx/${signature}`,
        memo
      };
      this.huntLog.push(logEntry);
      this.save();

      return {
        success: true,
        huntId,
        signature,
        txUrl: `https://solscan.io/tx/${signature}`,
        resultHash: huntData.resultHash
      };

    } catch (error) {
      console.log(`   ❌ Failed to log proof: ${error.message}`);
      
      // Still save locally even if on-chain fails
      const logEntry = {
        ...huntData,
        signature: null,
        error: error.message
      };
      this.huntLog.push(logEntry);
      this.save();

      return {
        success: false,
        huntId,
        error: error.message
      };
    }
  }

  /**
   * Verify a hunt by checking the on-chain memo
   */
  async verifyHunt(signature) {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) return { verified: false, error: 'Transaction not found' };

      // Find memo in transaction
      const memoInstruction = tx.transaction.message.compiledInstructions?.find(
        inst => tx.transaction.message.staticAccountKeys[inst.programIdIndex]?.toBase58() === MEMO_PROGRAM_ID.toBase58()
      );

      if (memoInstruction) {
        const memoData = Buffer.from(memoInstruction.data).toString();
        const parsed = JSON.parse(memoData);
        
        return {
          verified: true,
          protocol: parsed.p,
          type: parsed.t,
          wolf: parsed.w,
          resultHash: parsed.h,
          timestamp: parsed.ts,
          signature
        };
      }

      return { verified: false, error: 'No memo found in transaction' };

    } catch (error) {
      return { verified: false, error: error.message };
    }
  }

  /**
   * Get hunt history
   */
  getHistory(limit = 10) {
    return this.huntLog.slice(-limit);
  }

  /**
   * Get stats
   */
  getStats() {
    const wolves = {};
    this.huntLog.forEach(h => {
      wolves[h.wolf] = (wolves[h.wolf] || 0) + 1;
    });

    return {
      totalHunts: this.huntLog.length,
      onChainProofs: this.huntLog.filter(h => h.signature).length,
      byWolf: wolves,
      lastHunt: this.huntLog[this.huntLog.length - 1]
    };
  }

  save() {
    const dir = path.dirname(HUNT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HUNT_LOG_PATH, JSON.stringify(this.huntLog, null, 2));
  }
}

// CLI interface
async function main() {
  const [,, command, ...args] = process.argv;
  const proof = await new ProofOfHunt().init();

  switch (command) {
    case 'log':
      const wolfType = args[0] || 'scout';
      const mission = args[1] || 'test hunt';
      const result = args[2] || 'hunt completed successfully';
      await proof.logHunt(wolfType, mission, result);
      break;

    case 'verify':
      const sig = args[0];
      if (!sig) {
        console.log('Usage: node proof-of-hunt.js verify <signature>');
        return;
      }
      const verification = await proof.verifyHunt(sig);
      console.log('\n🐺 Verification result:');
      console.log(JSON.stringify(verification, null, 2));
      break;

    case 'history':
      const history = proof.getHistory(parseInt(args[0]) || 10);
      console.log('\n🐺 Hunt History:');
      history.forEach(h => {
        console.log(`  ${h.id} | ${h.wolf} | ${h.signature ? '✅ on-chain' : '❌ local only'}`);
      });
      break;

    case 'stats':
      const stats = proof.getStats();
      console.log('\n🐺 PROOF OF HUNT STATS');
      console.log('═'.repeat(40));
      console.log(`Total hunts: ${stats.totalHunts}`);
      console.log(`On-chain proofs: ${stats.onChainProofs}`);
      console.log(`By wolf type:`);
      Object.entries(stats.byWolf).forEach(([wolf, count]) => {
        console.log(`  ${wolf}: ${count}`);
      });
      break;

    default:
      console.log(`
🐺 PROOF OF HUNT - On-chain wolf verification

Commands:
  log <wolf> <mission> <result>   Log a hunt proof on-chain
  verify <signature>              Verify a hunt from blockchain
  history [limit]                 Show recent hunts
  stats                           Show hunt statistics

Example:
  node proof-of-hunt.js log scout "twitter patrol" "found 5 mentions"
  node proof-of-hunt.js verify 5Vptr4hq5VLd8Nrsn3QtVjkjRDBH...
`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ProofOfHunt };
