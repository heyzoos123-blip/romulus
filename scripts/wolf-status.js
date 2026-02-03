#!/usr/bin/env node
/**
 * wolf-status.js - Query active Romulus wolf sessions
 * 
 * Displays the status of all active wolf/subagent sessions
 * with cool terminal formatting.
 * 
 * Usage:
 *   node wolf-status.js           # Show all wolves
 *   node wolf-status.js --active  # Show recently active only (last 10 min)
 *   node wolf-status.js --json    # Output as JSON
 * 
 * @author darkflobi
 * @pack Romulus
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Wolf registry file for tracking labels
const REGISTRY_PATH = path.join(__dirname, '../.wolf-registry.json');

// ASCII Art
const WOLF_BANNER = `
\x1b[33m    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🐺  R O M U L U S   W O L F   P A C K  🐺               ║
    ║                                                           ║
    ║      "We hunt together. We build together."               ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝\x1b[0m
`;

const LONE_WOLF = `
\x1b[90m         /\\
        /  \\
       / /\\ \\
      / /  \\ \\    No wolves active.
     / /    \\ \\   The pack sleeps...
    /_/      \\_\\
\x1b[0m`;

const WOLF_ICONS = {
  active: '🟢',
  recent: '🟡', 
  stale: '🔴',
  main: '👑',
};

// Time formatting
function formatAge(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function formatTokens(tokens) {
  if (!tokens) return '-';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

function getStatus(ageMs) {
  const minutes = ageMs / 60000;
  if (minutes < 2) return { icon: WOLF_ICONS.active, label: 'HUNTING', color: '\x1b[32m' };
  if (minutes < 10) return { icon: WOLF_ICONS.recent, label: 'PROWLING', color: '\x1b[33m' };
  return { icon: WOLF_ICONS.stale, label: 'RESTING', color: '\x1b[90m' };
}

// Load wolf registry (maps session UUIDs to labels)
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
  } catch (e) {}
  return { wolves: {} };
}

// Extract wolf label from session key
function getWolfLabel(key, registry) {
  // Check registry first
  const uuid = key.match(/subagent:([a-f0-9-]+)/)?.[1];
  if (uuid && registry.wolves[uuid]) {
    return registry.wolves[uuid];
  }
  
  // Parse key for hints
  if (key === 'agent:main:main') return '👑 ALPHA (main)';
  if (key.includes('subagent:')) {
    const shortId = uuid ? uuid.slice(0, 8) : 'unknown';
    return `wolf-${shortId}`;
  }
  if (key.includes('telegram:')) return '📱 telegram';
  if (key.includes('discord:')) return '💬 discord';
  
  return key.split(':').pop();
}

// Get sessions from clawdbot
function getSessions(activeMinutes = null) {
  try {
    let cmd = 'clawdbot sessions --json';
    if (activeMinutes) cmd += ` --active ${activeMinutes}`;
    
    const output = execSync(cmd, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(output);
  } catch (e) {
    console.error('\x1b[31mError fetching sessions:\x1b[0m', e.message);
    return null;
  }
}

// Filter for wolf sessions (subagents)
function filterWolves(sessions) {
  return sessions.filter(s => s.key.includes('subagent:'));
}

// Display wolves in table format
function displayWolves(sessions, options = {}) {
  const registry = loadRegistry();
  const wolves = filterWolves(sessions);
  const mainSession = sessions.find(s => s.key === 'agent:main:main');
  
  console.log(WOLF_BANNER);
  
  // Alpha status
  if (mainSession) {
    const status = getStatus(mainSession.ageMs);
    console.log(`\x1b[1m  👑 ALPHA STATUS\x1b[0m`);
    console.log(`     ${status.icon} ${status.color}${status.label}\x1b[0m | Last: ${formatAge(mainSession.ageMs)} | Tokens: ${formatTokens(mainSession.totalTokens)}`);
    console.log();
  }
  
  if (wolves.length === 0) {
    console.log(LONE_WOLF);
    console.log('\x1b[90m  Spawn wolves with: node spawn-wolf.js <type> <task>\x1b[0m\n');
    return;
  }
  
  console.log(`\x1b[1m  🐺 ACTIVE WOLVES (${wolves.length})\x1b[0m`);
  console.log('\x1b[90m  ─────────────────────────────────────────────────────────\x1b[0m');
  
  // Sort by most recently active
  wolves.sort((a, b) => a.ageMs - b.ageMs);
  
  wolves.forEach((wolf, i) => {
    const status = getStatus(wolf.ageMs);
    const label = getWolfLabel(wolf.key, registry);
    const model = wolf.model?.replace('claude-', '').replace('-20250514', '') || 'unknown';
    const tokens = formatTokens(wolf.totalTokens);
    const age = formatAge(wolf.ageMs);
    
    console.log();
    console.log(`  ${status.icon} \x1b[1m${label}\x1b[0m`);
    console.log(`     ${status.color}${status.label}\x1b[0m | ${age} | ${model} | ${tokens} tokens`);
  });
  
  console.log();
  console.log('\x1b[90m  ─────────────────────────────────────────────────────────\x1b[0m');
  console.log(`\x1b[90m  Pack Total: ${wolves.length} wolves | ${formatTokens(wolves.reduce((sum, w) => sum + (w.totalTokens || 0), 0))} tokens burned\x1b[0m`);
  console.log();
}

// JSON output
function displayJson(sessions) {
  const wolves = filterWolves(sessions);
  const registry = loadRegistry();
  
  const output = {
    timestamp: new Date().toISOString(),
    pack: 'Romulus',
    alpha: 'darkflobi',
    wolfCount: wolves.length,
    wolves: wolves.map(w => ({
      label: getWolfLabel(w.key, registry),
      key: w.key,
      status: getStatus(w.ageMs).label,
      lastActivity: formatAge(w.ageMs),
      ageMs: w.ageMs,
      model: w.model,
      totalTokens: w.totalTokens || 0,
      sessionId: w.sessionId
    }))
  };
  
  console.log(JSON.stringify(output, null, 2));
}

// Main
function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const activeOnly = args.includes('--active');
  const showHelp = args.includes('--help') || args.includes('-h');
  
  if (showHelp) {
    console.log(`
🐺 ROMULUS WOLF STATUS

Usage: node wolf-status.js [options]

Options:
  --active    Show only recently active wolves (last 10 min)
  --json      Output as JSON
  --help      Show this help

Examples:
  node wolf-status.js           # Show all wolves
  node wolf-status.js --active  # Show active wolves
  node wolf-status.js --json    # JSON output for scripting

Part of the Romulus pack infrastructure.
Alpha: darkflobi 🐺
`);
    return;
  }
  
  const data = getSessions(activeOnly ? 10 : null);
  
  if (!data || !data.sessions) {
    console.error('\x1b[31mFailed to fetch session data\x1b[0m');
    process.exit(1);
  }
  
  if (isJson) {
    displayJson(data.sessions);
  } else {
    displayWolves(data.sessions);
  }
}

main();
