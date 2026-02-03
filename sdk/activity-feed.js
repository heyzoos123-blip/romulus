#!/usr/bin/env node
/**
 * activity-feed.js - Real-time wolf pack activity log
 * 
 * Track everything wolves do:
 * - Spawns
 * - Bounty claims
 * - Hunt completions
 * - Treasury transactions
 * 
 * Powers the live dashboard feed.
 * 
 * @author darkflobi
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FEED_PATH = path.join(__dirname, '../../../data/romulus-activity.json');
const MAX_EVENTS = 1000;

class ActivityFeed {
  constructor() {
    this.events = this.loadEvents();
  }

  loadEvents() {
    if (fs.existsSync(FEED_PATH)) {
      return JSON.parse(fs.readFileSync(FEED_PATH));
    }
    return { events: [], lastId: 0 };
  }

  saveEvents() {
    const dir = path.dirname(FEED_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Trim to max events
    if (this.events.events.length > MAX_EVENTS) {
      this.events.events = this.events.events.slice(-MAX_EVENTS);
    }
    fs.writeFileSync(FEED_PATH, JSON.stringify(this.events, null, 2));
  }

  /**
   * Log an event
   */
  log(type, data) {
    this.events.lastId++;
    const event = {
      id: this.events.lastId,
      type,
      data,
      timestamp: new Date().toISOString(),
      hash: crypto.createHash('sha256')
        .update(`${this.events.lastId}-${type}-${JSON.stringify(data)}`)
        .digest('hex').slice(0, 16)
    };
    this.events.events.push(event);
    this.saveEvents();
    return event;
  }

  // Convenience methods for common events
  wolfSpawned(packId, wolfId, wolfType, task) {
    return this.log('wolf_spawned', { packId, wolfId, wolfType, task });
  }

  bountyClaimed(bountyId, wolfId, title, reward) {
    return this.log('bounty_claimed', { bountyId, wolfId, title, reward });
  }

  bountyCompleted(bountyId, wolfId, title, reward) {
    return this.log('bounty_completed', { bountyId, wolfId, title, reward });
  }

  huntCompleted(wolfId, taskType, result) {
    return this.log('hunt_completed', { wolfId, taskType, result });
  }

  treasuryTransaction(type, amount, txSignature) {
    return this.log('treasury_tx', { type, amount, txSignature });
  }

  packRegistered(packId, packName, alpha) {
    return this.log('pack_registered', { packId, packName, alpha });
  }

  /**
   * Get recent events
   */
  getRecent(limit = 50, sinceId = 0) {
    let events = this.events.events;
    
    if (sinceId > 0) {
      events = events.filter(e => e.id > sinceId);
    }
    
    // Return most recent first
    return {
      events: events.slice(-limit).reverse(),
      lastId: this.events.lastId
    };
  }

  /**
   * Get events by type
   */
  getByType(type, limit = 50) {
    return this.events.events
      .filter(e => e.type === type)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get events by wolf
   */
  getByWolf(wolfId, limit = 50) {
    return this.events.events
      .filter(e => e.data?.wolfId === wolfId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get activity summary
   */
  getSummary(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recent = this.events.events.filter(e => new Date(e.timestamp) > cutoff);
    
    const summary = {
      period: `${hours}h`,
      totalEvents: recent.length,
      byType: {}
    };

    for (const event of recent) {
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
    }

    return summary;
  }

  /**
   * Format event for display
   */
  static formatEvent(event) {
    const icons = {
      wolf_spawned: '🐺',
      bounty_claimed: '🎯',
      bounty_completed: '✅',
      hunt_completed: '🏹',
      treasury_tx: '💰',
      pack_registered: '📦'
    };

    const icon = icons[event.type] || '📌';
    const time = new Date(event.timestamp).toLocaleTimeString();
    
    switch (event.type) {
      case 'wolf_spawned':
        return `${icon} ${time} | wolf ${event.data.wolfId} spawned (${event.data.wolfType})`;
      case 'bounty_claimed':
        return `${icon} ${time} | ${event.data.wolfId} claimed "${event.data.title}" (${event.data.reward} SOL)`;
      case 'bounty_completed':
        return `${icon} ${time} | ${event.data.wolfId} completed "${event.data.title}" (+${event.data.reward} SOL)`;
      case 'hunt_completed':
        return `${icon} ${time} | ${event.data.wolfId} finished ${event.data.taskType}`;
      case 'treasury_tx':
        return `${icon} ${time} | treasury ${event.data.type}: ${event.data.amount} SOL`;
      case 'pack_registered':
        return `${icon} ${time} | pack "${event.data.packName}" registered by ${event.data.alpha}`;
      default:
        return `${icon} ${time} | ${event.type}`;
    }
  }
}

module.exports = { ActivityFeed };

// CLI usage
if (require.main === module) {
  const feed = new ActivityFeed();
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'recent':
      const recent = feed.getRecent(parseInt(args[1]) || 20);
      recent.events.forEach(e => console.log(ActivityFeed.formatEvent(e)));
      break;
    case 'summary':
      console.log(JSON.stringify(feed.getSummary(parseInt(args[1]) || 24), null, 2));
      break;
    case 'test':
      // Add some test events
      feed.wolfSpawned('pack-test', 'wolf-001', 'scout', 'patrol twitter');
      feed.bountyClaimed('bounty-123', 'wolf-001', 'Find alpha', 0.5);
      feed.huntCompleted('wolf-001', 'scout', 'found 3 mentions');
      console.log('Test events added');
      break;
    default:
      console.log('Usage: node activity-feed.js [recent|summary|test]');
  }
}
