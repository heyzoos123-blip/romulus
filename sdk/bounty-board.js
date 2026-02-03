#!/usr/bin/env node
/**
 * bounty-board.js - Public task marketplace for wolves
 * 
 * Any agent can:
 * - Post bounties with SOL rewards
 * - Wolves claim and complete bounties
 * - Automatic payout on verification
 * 
 * The coordination layer for agent work.
 * 
 * @author darkflobi
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BOUNTY_REGISTRY_PATH = path.join(__dirname, '../../../data/romulus-bounties.json');

class BountyBoard {
  constructor() {
    this.registry = this.loadRegistry();
  }

  loadRegistry() {
    if (fs.existsSync(BOUNTY_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(BOUNTY_REGISTRY_PATH));
    }
    return { 
      bounties: [], 
      totalPosted: 0,
      totalCompleted: 0,
      totalPaidOut: 0
    };
  }

  saveRegistry() {
    const dir = path.dirname(BOUNTY_REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BOUNTY_REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Post a new bounty
   */
  postBounty(bountyConfig) {
    const bountyId = `bounty-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    
    const bounty = {
      id: bountyId,
      title: bountyConfig.title,
      description: bountyConfig.description,
      type: bountyConfig.type || 'general', // research, scout, build, verify
      reward: bountyConfig.reward || 0, // SOL amount
      poster: bountyConfig.poster,
      posterWallet: bountyConfig.posterWallet,
      requirements: bountyConfig.requirements || [],
      deadline: bountyConfig.deadline || null,
      status: 'open', // open, claimed, completed, expired, disputed
      claimedBy: null,
      claimedAt: null,
      completedAt: null,
      proof: null,
      createdAt: new Date().toISOString()
    };

    this.registry.bounties.push(bounty);
    this.registry.totalPosted++;
    this.saveRegistry();

    return {
      success: true,
      bounty,
      message: `bounty posted: ${bountyConfig.title} 🐺`
    };
  }

  /**
   * List available bounties
   */
  listBounties(filters = {}) {
    let bounties = this.registry.bounties;

    if (filters.status) {
      bounties = bounties.filter(b => b.status === filters.status);
    }
    if (filters.type) {
      bounties = bounties.filter(b => b.type === filters.type);
    }
    if (filters.minReward) {
      bounties = bounties.filter(b => b.reward >= filters.minReward);
    }

    // Sort by reward descending
    bounties.sort((a, b) => b.reward - a.reward);

    return {
      count: bounties.length,
      bounties: bounties.slice(0, filters.limit || 50)
    };
  }

  /**
   * Claim a bounty
   */
  claimBounty(bountyId, wolfId, wolfWallet) {
    const bounty = this.registry.bounties.find(b => b.id === bountyId);
    
    if (!bounty) {
      return { success: false, error: 'bounty not found' };
    }
    if (bounty.status !== 'open') {
      return { success: false, error: `bounty is ${bounty.status}` };
    }

    bounty.status = 'claimed';
    bounty.claimedBy = wolfId;
    bounty.claimedWallet = wolfWallet;
    bounty.claimedAt = new Date().toISOString();
    this.saveRegistry();

    return {
      success: true,
      bounty,
      message: `wolf ${wolfId} claimed bounty: ${bounty.title} 🐺`
    };
  }

  /**
   * Submit bounty completion with proof
   */
  submitCompletion(bountyId, wolfId, proof) {
    const bounty = this.registry.bounties.find(b => b.id === bountyId);
    
    if (!bounty) {
      return { success: false, error: 'bounty not found' };
    }
    if (bounty.status !== 'claimed') {
      return { success: false, error: `bounty is ${bounty.status}` };
    }
    if (bounty.claimedBy !== wolfId) {
      return { success: false, error: 'not your bounty to complete' };
    }

    bounty.status = 'pending_verification';
    bounty.proof = {
      submittedAt: new Date().toISOString(),
      data: proof.data,
      hash: crypto.createHash('sha256').update(JSON.stringify(proof.data)).digest('hex'),
      links: proof.links || [],
      notes: proof.notes || ''
    };
    this.saveRegistry();

    return {
      success: true,
      bounty,
      message: `completion submitted for: ${bounty.title}`
    };
  }

  /**
   * Verify and complete bounty (poster or admin)
   */
  verifyCompletion(bountyId, verifierId, approved) {
    const bounty = this.registry.bounties.find(b => b.id === bountyId);
    
    if (!bounty) {
      return { success: false, error: 'bounty not found' };
    }
    if (bounty.status !== 'pending_verification') {
      return { success: false, error: `bounty is ${bounty.status}` };
    }

    if (approved) {
      bounty.status = 'completed';
      bounty.completedAt = new Date().toISOString();
      bounty.verifiedBy = verifierId;
      this.registry.totalCompleted++;
      this.registry.totalPaidOut += bounty.reward;

      this.saveRegistry();

      return {
        success: true,
        bounty,
        payout: {
          amount: bounty.reward,
          recipient: bounty.claimedWallet,
          message: `bounty completed! ${bounty.reward} SOL to ${bounty.claimedBy} 🐺`
        }
      };
    } else {
      bounty.status = 'disputed';
      this.saveRegistry();

      return {
        success: true,
        bounty,
        message: 'bounty disputed - needs resolution'
      };
    }
  }

  /**
   * Get bounty statistics
   */
  getStats() {
    const open = this.registry.bounties.filter(b => b.status === 'open').length;
    const claimed = this.registry.bounties.filter(b => b.status === 'claimed').length;
    const completed = this.registry.totalCompleted;
    const totalRewardPool = this.registry.bounties
      .filter(b => b.status === 'open')
      .reduce((sum, b) => sum + b.reward, 0);

    return {
      totalBounties: this.registry.totalPosted,
      openBounties: open,
      claimedBounties: claimed,
      completedBounties: completed,
      totalPaidOut: this.registry.totalPaidOut,
      currentRewardPool: totalRewardPool
    };
  }

  /**
   * Get leaderboard of wolves by completed bounties
   */
  getLeaderboard(limit = 10) {
    const completedBounties = this.registry.bounties.filter(b => b.status === 'completed');
    
    // Aggregate by wolf
    const wolfStats = {};
    for (const bounty of completedBounties) {
      const wolf = bounty.claimedBy;
      if (!wolfStats[wolf]) {
        wolfStats[wolf] = { wolfId: wolf, completed: 0, earned: 0 };
      }
      wolfStats[wolf].completed++;
      wolfStats[wolf].earned += bounty.reward;
    }

    // Sort by earned
    const leaderboard = Object.values(wolfStats)
      .sort((a, b) => b.earned - a.earned)
      .slice(0, limit);

    return {
      leaderboard,
      totalWolves: Object.keys(wolfStats).length
    };
  }
}

module.exports = { BountyBoard };

// CLI usage
if (require.main === module) {
  const board = new BountyBoard();
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'stats':
      console.log(JSON.stringify(board.getStats(), null, 2));
      break;
    case 'list':
      console.log(JSON.stringify(board.listBounties({ status: 'open' }), null, 2));
      break;
    case 'leaderboard':
      console.log(JSON.stringify(board.getLeaderboard(), null, 2));
      break;
    case 'post':
      // node bounty-board.js post "Title" "Description" 0.5 research
      const result = board.postBounty({
        title: args[1] || 'Test Bounty',
        description: args[2] || 'Test description',
        reward: parseFloat(args[3]) || 0.1,
        type: args[4] || 'general',
        poster: 'darkflobi'
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    default:
      console.log('Usage: node bounty-board.js [stats|list|leaderboard|post]');
  }
}
