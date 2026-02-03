#!/usr/bin/env node
/**
 * treasury-wolf.js - Wolf with spending authority
 * 
 * This wolf can execute treasury operations with strict limits.
 * Every transaction is logged on-chain and locally.
 * 
 * SAFETY LIMITS:
 * - Max single transaction: 0.05 SOL
 * - Max daily spend: 0.2 SOL
 * - Requires explicit approval for larger amounts
 * 
 * @author darkflobi
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Config
const WALLET_PATH = path.join(__dirname, '../../../secrets/solana-wallet.json');
const SPEND_LOG_PATH = path.join(__dirname, '../../../data/treasury-spend-log.json');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DARKFLOBI_MINT = '7GCxHtUttri1gNdt8Asa8DC72DQbiFNrN43ALjptpump';
const JUPITER_API = 'https://public.jupiterapi.com';

// Safety limits (in SOL)
const LIMITS = {
  maxSingleTx: 0.05,      // Max per transaction
  maxDailySpend: 0.2,     // Max per 24 hours
  minBalance: 0.1,        // Always keep this much SOL
  requireApproval: 0.1    // Amounts above this need human approval
};

class TreasuryWolf {
  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    this.keypair = null;
    this.spendLog = [];
  }

  async init() {
    // Load wallet
    const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH));
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    console.log(`🐺 Treasury Wolf initialized`);
    console.log(`   Wallet: ${this.keypair.publicKey.toBase58()}`);
    
    // Load spend log
    if (fs.existsSync(SPEND_LOG_PATH)) {
      this.spendLog = JSON.parse(fs.readFileSync(SPEND_LOG_PATH));
    }
    
    return this;
  }

  async getBalance() {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return balance / 1e9;
  }

  getDailySpend() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return this.spendLog
      .filter(tx => tx.timestamp > oneDayAgo)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }

  async checkLimits(amount) {
    const balance = await this.getBalance();
    const dailySpend = this.getDailySpend();
    
    const checks = {
      passed: true,
      errors: [],
      warnings: []
    };

    // Check single transaction limit
    if (amount > LIMITS.maxSingleTx) {
      checks.passed = false;
      checks.errors.push(`Amount ${amount} SOL exceeds single tx limit of ${LIMITS.maxSingleTx} SOL`);
    }

    // Check daily limit
    if (dailySpend + amount > LIMITS.maxDailySpend) {
      checks.passed = false;
      checks.errors.push(`Would exceed daily limit. Already spent: ${dailySpend.toFixed(4)} SOL`);
    }

    // Check minimum balance
    if (balance - amount < LIMITS.minBalance) {
      checks.passed = false;
      checks.errors.push(`Would drop below minimum balance of ${LIMITS.minBalance} SOL`);
    }

    // Check if needs approval
    if (amount > LIMITS.requireApproval) {
      checks.warnings.push(`Amount exceeds ${LIMITS.requireApproval} SOL - would need human approval`);
    }

    return checks;
  }

  async buyDarkflobi(solAmount) {
    console.log(`\n🐺 Treasury Wolf: Buy order for ${solAmount} SOL`);
    
    // Check limits
    const checks = await this.checkLimits(solAmount);
    if (!checks.passed) {
      console.log('❌ BLOCKED by safety limits:');
      checks.errors.forEach(e => console.log(`   - ${e}`));
      return { success: false, errors: checks.errors };
    }

    if (checks.warnings.length > 0) {
      console.log('⚠️ Warnings:');
      checks.warnings.forEach(w => console.log(`   - ${w}`));
    }

    // Get quote
    console.log('📊 Getting quote...');
    const inputAmount = Math.floor(solAmount * 1e9);
    const quoteResp = await fetch(
      `${JUPITER_API}/quote?inputMint=${SOL_MINT}&outputMint=${DARKFLOBI_MINT}&amount=${inputAmount}&slippageBps=1500&onlyDirectRoutes=true`
    );
    const quote = await quoteResp.json();

    if (quote.error) {
      return { success: false, errors: [quote.error] };
    }

    const outputAmount = parseInt(quote.outAmount) / 1e6;
    console.log(`   ${solAmount} SOL → ${outputAmount.toLocaleString()} $DARKFLOBI`);

    // Build and execute swap
    console.log('🔨 Building transaction...');
    const swapResp = await fetch(`${JUPITER_API}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: this.keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 500000,
            priorityLevel: "high"
          }
        }
      })
    });
    const swapData = await swapResp.json();

    if (swapData.error) {
      return { success: false, errors: [swapData.error] };
    }

    // Sign and send
    console.log('✍️ Signing...');
    const { VersionedTransaction } = require('@solana/web3.js');
    const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([this.keypair]);

    console.log('📤 Sending...');
    const sig = await this.connection.sendTransaction(tx, {
      skipPreflight: true,
      maxRetries: 3
    });

    console.log(`⏳ Confirming: ${sig}`);
    await this.connection.confirmTransaction(sig, 'confirmed');

    // Log the spend
    const logEntry = {
      timestamp: Date.now(),
      type: 'buy_darkflobi',
      amount: solAmount,
      outputAmount: outputAmount,
      signature: sig,
      wolf: 'treasury-wolf'
    };
    this.spendLog.push(logEntry);
    
    // Ensure data directory exists
    const dataDir = path.dirname(SPEND_LOG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SPEND_LOG_PATH, JSON.stringify(this.spendLog, null, 2));

    console.log(`\n✅ SUCCESS`);
    console.log(`   TX: https://solscan.io/tx/${sig}`);
    console.log(`   Bought: ${outputAmount.toLocaleString()} $DARKFLOBI`);

    return {
      success: true,
      signature: sig,
      solSpent: solAmount,
      darkflobiReceived: outputAmount,
      txUrl: `https://solscan.io/tx/${sig}`
    };
  }

  async status() {
    const balance = await this.getBalance();
    const dailySpend = this.getDailySpend();
    
    return {
      wallet: this.keypair.publicKey.toBase58(),
      balance: balance,
      dailySpend: dailySpend,
      dailyRemaining: LIMITS.maxDailySpend - dailySpend,
      limits: LIMITS,
      recentTxs: this.spendLog.slice(-5)
    };
  }
}

// CLI interface
async function main() {
  const [,, command, ...args] = process.argv;
  
  const wolf = await new TreasuryWolf().init();
  
  switch (command) {
    case 'status':
      const status = await wolf.status();
      console.log('\n🐺 TREASURY WOLF STATUS');
      console.log('═'.repeat(40));
      console.log(`Wallet: ${status.wallet}`);
      console.log(`Balance: ${status.balance.toFixed(4)} SOL`);
      console.log(`Daily spend: ${status.dailySpend.toFixed(4)} SOL`);
      console.log(`Daily remaining: ${status.dailyRemaining.toFixed(4)} SOL`);
      console.log(`\nLimits:`);
      console.log(`  Max single tx: ${status.limits.maxSingleTx} SOL`);
      console.log(`  Max daily: ${status.limits.maxDailySpend} SOL`);
      console.log(`  Min balance: ${status.limits.minBalance} SOL`);
      break;

    case 'buy':
      const amount = parseFloat(args[0]);
      if (!amount || isNaN(amount)) {
        console.log('Usage: node treasury-wolf.js buy <amount_in_sol>');
        console.log('Example: node treasury-wolf.js buy 0.02');
        return;
      }
      await wolf.buyDarkflobi(amount);
      break;

    default:
      console.log(`
🐺 TREASURY WOLF

Commands:
  status    Show wallet balance and spend limits
  buy <sol> Buy $DARKFLOBI with SOL (within limits)

Safety Limits:
  Max single tx:  ${LIMITS.maxSingleTx} SOL
  Max daily:      ${LIMITS.maxDailySpend} SOL
  Min balance:    ${LIMITS.minBalance} SOL

Example:
  node treasury-wolf.js status
  node treasury-wolf.js buy 0.02
`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { TreasuryWolf, LIMITS };
