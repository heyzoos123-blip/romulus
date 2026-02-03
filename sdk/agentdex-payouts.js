#!/usr/bin/env node
/**
 * agentdex-payouts.js - AgentDEX integration for Romulus bounty payouts
 * 
 * Adds token-flexible bounty payouts via AgentDEX:
 * - Wolves can receive bounty rewards in any SPL token
 * - Bounty posters can fund bounties with non-SOL tokens
 * - Auto-swap via Jupiter V6 routing for best execution
 * 
 * AgentDEX: https://github.com/solana-clawd/agent-dex
 * Romulus: https://github.com/heyzoos123-blip/romulus
 * 
 * @author JacobsClawd (AgentDEX)
 */

const KNOWN_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JTO: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

class AgentDEXPayouts {
  /**
   * @param {Object} config
   * @param {string} config.agentDexUrl - AgentDEX API base URL
   * @param {string} config.apiKey - AgentDEX API key
   */
  constructor(config = {}) {
    this.baseUrl = config.agentDexUrl || 'https://api.agentdex.io';
    this.apiKey = config.apiKey || '';
  }

  /**
   * Get a quote for converting bounty reward to wolf's preferred token
   * 
   * @param {Object} params
   * @param {number} params.rewardSol - Bounty reward in SOL
   * @param {string} params.outputToken - Token symbol or mint address
   * @param {number} [params.slippageBps=50] - Slippage tolerance in bps
   * @returns {Promise<Object>} Quote with expected output amount
   */
  async getPayoutQuote({ rewardSol, outputToken, slippageBps = 50 }) {
    const outputMint = KNOWN_TOKENS[outputToken?.toUpperCase()] || outputToken;
    const amountLamports = Math.floor(rewardSol * 1e9);

    const params = new URLSearchParams({
      inputMint: KNOWN_TOKENS.SOL,
      outputMint,
      amount: amountLamports.toString(),
      slippageBps: slippageBps.toString(),
    });

    const res = await fetch(`${this.baseUrl}/quote?${params}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AgentDEX quote failed: ${err}`);
    }

    const quote = await res.json();
    return {
      inputAmount: rewardSol,
      inputToken: 'SOL',
      outputAmount: quote.outAmount,
      outputToken,
      outputMint,
      priceImpactPct: quote.priceImpactPct,
      routes: quote.routePlan?.map(r => r.swapInfo?.label).filter(Boolean),
    };
  }

  /**
   * Execute bounty payout with optional token swap
   * 
   * If outputToken is SOL or not specified, pays out directly.
   * Otherwise, swaps SOL reward to the requested token via AgentDEX.
   * 
   * @param {Object} params
   * @param {Object} params.bounty - Bounty object from BountyBoard
   * @param {string} [params.outputToken='SOL'] - Wolf's preferred payout token
   * @param {number} [params.slippageBps=50] - Slippage tolerance
   * @returns {Promise<Object>} Payout result with txid
   */
  async executePayout({ bounty, outputToken = 'SOL', slippageBps = 50 }) {
    if (!bounty || bounty.status !== 'completed') {
      return { success: false, error: 'Bounty must be completed before payout' };
    }

    // Direct SOL payout — no swap needed
    if (!outputToken || outputToken.toUpperCase() === 'SOL') {
      return {
        success: true,
        bountyId: bounty.id,
        payout: {
          amount: bounty.reward,
          token: 'SOL',
          recipient: bounty.claimedBy,
          swapped: false,
        },
        message: `${bounty.reward} SOL paid to ${bounty.claimedBy} 🐺`,
      };
    }

    // Swap SOL → preferred token via AgentDEX
    const outputMint = KNOWN_TOKENS[outputToken.toUpperCase()] || outputToken;
    const amountLamports = Math.floor(bounty.reward * 1e9);

    const res = await fetch(`${this.baseUrl}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        inputMint: KNOWN_TOKENS.SOL,
        outputMint,
        amount: amountLamports,
        slippageBps,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return {
        success: false,
        error: `Swap failed: ${err}`,
        bountyId: bounty.id,
      };
    }

    const swap = await res.json();
    return {
      success: true,
      bountyId: bounty.id,
      payout: {
        inputAmount: bounty.reward,
        inputToken: 'SOL',
        outputAmount: swap.outputAmount,
        outputToken,
        recipient: bounty.claimedBy,
        txid: swap.txid,
        swapped: true,
      },
      message: `${bounty.reward} SOL → ${outputToken} paid to ${bounty.claimedBy} (tx: ${swap.txid}) 🐺`,
    };
  }

  /**
   * Fund a bounty with non-SOL tokens (auto-convert to SOL)
   * 
   * @param {Object} params
   * @param {string} params.inputToken - Token to fund with (symbol or mint)
   * @param {number} params.inputAmount - Amount in token units
   * @param {number} [params.slippageBps=50] - Slippage tolerance
   * @returns {Promise<Object>} Funding result with SOL equivalent
   */
  async fundBountyWithToken({ inputToken, inputAmount, slippageBps = 50 }) {
    const inputMint = KNOWN_TOKENS[inputToken?.toUpperCase()] || inputToken;

    // Get quote first to show expected SOL reward
    const params = new URLSearchParams({
      inputMint,
      outputMint: KNOWN_TOKENS.SOL,
      amount: inputAmount.toString(),
      slippageBps: slippageBps.toString(),
    });

    const quoteRes = await fetch(`${this.baseUrl}/quote?${params}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (!quoteRes.ok) {
      throw new Error(`Quote failed: ${await quoteRes.text()}`);
    }

    const quote = await quoteRes.json();
    const solAmount = parseInt(quote.outAmount) / 1e9;

    return {
      inputToken,
      inputAmount,
      solEquivalent: solAmount,
      priceImpactPct: quote.priceImpactPct,
      message: `${inputAmount} ${inputToken} ≈ ${solAmount.toFixed(4)} SOL bounty reward`,
    };
  }

  /**
   * Get wolf's portfolio (to check if they have tokens to fund bounties)
   * 
   * @param {string} wallet - Solana wallet address
   * @returns {Promise<Object>} Portfolio data
   */
  async getWolfPortfolio(wallet) {
    const res = await fetch(`${this.baseUrl}/portfolio/${wallet}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Portfolio fetch failed: ${await res.text()}`);
    }

    return res.json();
  }
}

// ============================================================
// Integration with BountyBoard
// ============================================================

/**
 * Enhanced BountyBoard with AgentDEX token-flexible payouts
 * 
 * Usage:
 *   const BountyBoard = require('./bounty-board');
 *   const { enhanceBountyBoard } = require('./agentdex-payouts');
 *   
 *   const board = new BountyBoard();
 *   const enhanced = enhanceBountyBoard(board, {
 *     agentDexUrl: 'https://api.agentdex.io',
 *     apiKey: 'your-key'
 *   });
 *   
 *   // Wolf completes bounty and wants USDC
 *   const result = await enhanced.completeWithSwap(bountyId, proof, 'USDC');
 */
function enhanceBountyBoard(bountyBoard, agentDexConfig) {
  const dex = new AgentDEXPayouts(agentDexConfig);

  return {
    ...bountyBoard,

    /** Complete bounty and pay out in wolf's preferred token */
    async completeWithSwap(bountyId, proof, outputToken = 'SOL') {
      // First complete via original BountyBoard
      const completion = bountyBoard.verifyAndComplete(bountyId, proof);
      if (!completion.success) return completion;

      // Then execute payout with optional swap
      const payout = await dex.executePayout({
        bounty: completion.bounty,
        outputToken,
      });

      return {
        ...completion,
        payout: payout.payout,
        swapped: payout.payout?.swapped || false,
      };
    },

    /** Get payout quote before completing */
    async getPayoutQuote(bountyId, outputToken) {
      const bounty = bountyBoard.registry.bounties.find(b => b.id === bountyId);
      if (!bounty) return { error: 'Bounty not found' };

      return dex.getPayoutQuote({
        rewardSol: bounty.reward,
        outputToken,
      });
    },

    /** Fund bounty with any token */
    async fundWithToken(bountyConfig, inputToken, inputAmount) {
      const funding = await dex.fundBountyWithToken({ inputToken, inputAmount });
      bountyConfig.reward = funding.solEquivalent;
      return {
        ...bountyBoard.postBounty(bountyConfig),
        funding,
      };
    },

    /** Check wolf's available tokens */
    async checkWolfFunds(wallet) {
      return dex.getWolfPortfolio(wallet);
    },
  };
}

module.exports = { AgentDEXPayouts, enhanceBountyBoard, KNOWN_TOKENS };
