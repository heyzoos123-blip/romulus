/**
 * darkflobi ATP Agent
 * 
 * Example implementation of an ATP agent using the SDK.
 * This is how darkflobi operates as an autonomous AI company.
 * 
 * @author darkflobi
 */

const { ATPAgent, Treasury, VoiceIdentity, AgentTypes } = require('../sdk');

// darkflobi configuration
const DARKFLOBI_CONFIG = {
  id: 'darkflobi',
  tokenMint: '7GCxHtUttri1gNdt8Asa8DC72DQbiFNrN43ALjptpump',
  treasury: {
    address: 'FkjfuNd1pvKLPzQWm77WfRy1yNWRhqbBPt9EexuvvmCD'
  },
  voice: {
    verificationEndpoint: 'https://darkflobi.com/verify'
  }
};

/**
 * Initialize darkflobi agent
 */
async function initDarkflobi() {
  // Create treasury connection
  const treasury = new Treasury({
    address: DARKFLOBI_CONFIG.treasury.address
  });

  // Create voice identity
  const voice = new VoiceIdentity({
    agentId: 'darkflobi',
    verificationEndpoint: DARKFLOBI_CONFIG.voice.verificationEndpoint
  });

  // Create the ATP agent
  const darkflobi = new ATPAgent({
    id: DARKFLOBI_CONFIG.id,
    tokenMint: DARKFLOBI_CONFIG.tokenMint,
    treasury,
    model: 'anthropic/claude-sonnet-4'
  });

  return { darkflobi, treasury, voice };
}

/**
 * Example: Spawn a research agent
 */
async function spawnResearcher(darkflobi, task) {
  console.log(`\n🔬 Spawning research agent for: ${task}`);
  
  const result = await darkflobi.spawn(AgentTypes.RESEARCH, {
    task,
    timeout: 300,
    label: `research-${Date.now()}`
  });

  console.log(`✅ Spawned: ${result.id}`);
  return result;
}

/**
 * Example: Spawn a builder agent
 */
async function spawnBuilder(darkflobi, task) {
  console.log(`\n🔧 Spawning builder agent for: ${task}`);
  
  const result = await darkflobi.spawn(AgentTypes.BUILDER, {
    task,
    timeout: 600,
    label: `builder-${Date.now()}`
  });

  console.log(`✅ Spawned: ${result.id}`);
  return result;
}

/**
 * Example: Spawn a scout agent
 */
async function spawnScout(darkflobi, task) {
  console.log(`\n👁️ Spawning scout agent for: ${task}`);
  
  const result = await darkflobi.spawn(AgentTypes.SCOUT, {
    task,
    timeout: 180,
    label: `scout-${Date.now()}`
  });

  console.log(`✅ Spawned: ${result.id}`);
  return result;
}

/**
 * Get status report
 */
function getStatusReport(darkflobi, treasury) {
  const status = darkflobi.getStatus();
  const treasuryStatus = treasury.getStatus();
  
  console.log(`
╔═══════════════════════════════════════════╗
║         DARKFLOBI STATUS REPORT           ║
╠═══════════════════════════════════════════╣
║ Agent ID:     ${status.id.padEnd(27)}║
║ Token:        $DARKFLOBI                  ║
║ Treasury:     ${treasuryStatus.address.slice(0, 20)}...  ║
╠───────────────────────────────────────────╣
║ METRICS                                   ║
║ Total Spawned:    ${String(status.metrics.totalSpawned).padEnd(22)}║
║ Tasks Completed:  ${String(status.metrics.tasksCompleted).padEnd(22)}║
║ Active Agents:    ${String(status.activeAgents).padEnd(22)}║
╠───────────────────────────────────────────╣
║ TREASURY                                  ║
║ Balance:          ${String(treasuryStatus.balance).padEnd(22)}║
║ Total Spent:      ${String(treasuryStatus.totalSpent).padEnd(22)}║
╚═══════════════════════════════════════════╝
  `);
  
  return { status, treasuryStatus };
}

/**
 * Demo run
 */
async function demo() {
  console.log(`
┌──────────────────────────────────────┐
│  DARKFLOBI ATP AGENT DEMO            │
│  ──────────────────────────────────  │
│  first autonomous AI company   😁    │
└──────────────────────────────────────┘
  `);

  const { darkflobi, treasury, voice } = await initDarkflobi();
  
  // Show initial status
  getStatusReport(darkflobi, treasury);
  
  // Spawn some agents
  await spawnScout(darkflobi, 'Monitor Twitter for $DARKFLOBI mentions');
  await spawnResearcher(darkflobi, 'Analyze competitor hackathon projects');
  await spawnBuilder(darkflobi, 'Create a simple dashboard component');
  
  // Show updated status
  console.log('\n--- After spawning agents ---');
  getStatusReport(darkflobi, treasury);
  
  // Show sub-agents
  const subAgents = darkflobi.getSubAgents();
  console.log('\nSub-agents spawned:');
  subAgents.history.forEach(agent => {
    console.log(`  - [${agent.type}] ${agent.task.slice(0, 50)}...`);
  });
}

// Run if called directly
if (require.main === module) {
  demo().catch(console.error);
}

module.exports = {
  initDarkflobi,
  spawnResearcher,
  spawnBuilder,
  spawnScout,
  getStatusReport
};
