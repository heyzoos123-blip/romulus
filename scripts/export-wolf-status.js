#!/usr/bin/env node
/**
 * export-wolf-status.js - Export wolf pack status as JSON for dashboard
 * 
 * Outputs to darkflobi-site/romulus/wolf-pack.json
 * Dashboard polls this file to show live wolves
 * 
 * @author darkflobi
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_PATH = path.join(__dirname, '../../../darkflobi-site/romulus/wolf-pack.json');

// Wolf type emojis and descriptions
const WOLF_TYPES = {
  research: { emoji: '🔬', name: 'Research Wolf', verb: 'hunting intel' },
  scout: { emoji: '👁️', name: 'Scout Wolf', verb: 'patrolling' },
  builder: { emoji: '🔧', name: 'Builder Wolf', verb: 'constructing' },
  custom: { emoji: '🐺', name: 'Wolf', verb: 'working' }
};

function detectWolfType(label) {
  if (label.includes('research')) return 'research';
  if (label.includes('scout')) return 'scout';
  if (label.includes('builder')) return 'builder';
  return 'custom';
}

function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}

function getWolfStatus(lastActivity) {
  const now = Date.now();
  const diff = now - lastActivity;
  const minutes = diff / (1000 * 60);
  
  if (minutes < 2) return { status: 'hunting', color: '#39ff14' };
  if (minutes < 10) return { status: 'prowling', color: '#ffff00' };
  return { status: 'resting', color: '#666666' };
}

async function exportWolfStatus() {
  try {
    // Get sessions via clawdbot CLI
    const result = execSync('clawdbot sessions list --json 2>/dev/null', {
      encoding: 'utf8',
      timeout: 10000
    });
    
    const sessions = JSON.parse(result);
    
    // Filter for wolf sessions (subagents)
    const wolves = sessions
      .filter(s => s.key && s.key.includes('subagent'))
      .map(s => {
        const label = s.label || s.key.split(':').pop().slice(0, 8);
        const type = detectWolfType(label);
        const typeInfo = WOLF_TYPES[type];
        const statusInfo = getWolfStatus(s.updatedAt);
        
        return {
          id: s.key.split(':').pop().slice(0, 8),
          label: label,
          type: type,
          emoji: typeInfo.emoji,
          typeName: typeInfo.name,
          verb: typeInfo.verb,
          status: statusInfo.status,
          statusColor: statusInfo.color,
          lastActivity: getRelativeTime(s.updatedAt),
          lastActivityMs: s.updatedAt,
          tokens: s.totalTokens || 0,
          model: s.model || 'unknown'
        };
      })
      .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
      .slice(0, 10); // Top 10 most recent
    
    const output = {
      timestamp: new Date().toISOString(),
      alpha: {
        name: 'darkflobi',
        status: 'hunting',
        statusColor: '#39ff14'
      },
      wolves: wolves,
      stats: {
        total: wolves.length,
        active: wolves.filter(w => w.status === 'hunting').length,
        tokensTotal: wolves.reduce((sum, w) => sum + w.tokens, 0)
      }
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`✅ Exported ${wolves.length} wolves to ${OUTPUT_PATH}`);
    
    return output;
    
  } catch (error) {
    // Fallback: create demo data if can't fetch real data
    const demoOutput = {
      timestamp: new Date().toISOString(),
      alpha: {
        name: 'darkflobi',
        status: 'hunting',
        statusColor: '#39ff14'
      },
      wolves: [],
      stats: { total: 0, active: 0, tokensTotal: 0 },
      error: 'Could not fetch live data'
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(demoOutput, null, 2));
    console.log(`⚠️ Created fallback status file`);
    return demoOutput;
  }
}

// Run if called directly
if (require.main === module) {
  exportWolfStatus();
}

module.exports = { exportWolfStatus };
