#!/usr/bin/env node
/**
 * romulus-client.js - SDK for other agents to spawn wolf packs
 * 
 * This makes Romulus INFRASTRUCTURE - any AI agent can:
 * - Register their pack
 * - Spawn wolves
 * - Track hunts
 * - Verify work on-chain
 * 
 * darkflobi becomes the protocol, not just a user.
 * 
 * @author darkflobi
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ManagedIdentity } = require('./managed-identity');

const PACKS_REGISTRY_PATH = path.join(__dirname, '../../../data/romulus-packs.json');

class RomulusClient {
  constructor(config = {}) {
    this.packId = config.packId || null;
    this.packName = config.packName || 'unnamed-pack';
    this.alpha = config.alpha || 'anonymous';
    this.treasury = config.treasury || null;
    this.apiKey = config.apiKey || null;
    this.registry = this.loadRegistry();
  }

  loadRegistry() {
    if (fs.existsSync(PACKS_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(PACKS_REGISTRY_PATH));
    }
    return { packs: [], totalWolvesSpawned: 0, totalHunts: 0 };
  }

  saveRegistry() {
    const dir = path.dirname(PACKS_REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PACKS_REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Register a new pack with Romulus
   */
  registerPack(packConfig) {
    const packId = `pack-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const apiKey = `rml_${crypto.randomBytes(16).toString('hex')}`;

    const pack = {
      id: packId,
      name: packConfig.name,
      alpha: packConfig.alpha,
      treasury: packConfig.treasury || null,
      description: packConfig.description || '',
      apiKey: apiKey, // In production, hash this
      createdAt: Date.now(),
      stats: {
        wolvesSpawned: 0,
        huntsCompleted: 0,
        totalTokens: 0
      },
      wolves: []
    };

    this.registry.packs.push(pack);
    this.saveRegistry();

    return {
      packId,
      apiKey,
      message: `Pack "${packConfig.name}" registered with Romulus. Welcome to the hunt. 🐺`
    };
  }

  /**
   * Get pack by ID or API key
   */
  getPack(identifier) {
    return this.registry.packs.find(p => 
      p.id === identifier || p.apiKey === identifier
    );
  }

  /**
   * Spawn a wolf for a pack
   * @param {string} packId - Pack ID or API key
   * @param {object} wolfConfig - Wolf configuration
   * @param {boolean} wolfConfig.managedIdentity - Premium: +5 credits for Moltbook identity
   * @param {string} wolfConfig.wolfName - Name for Moltbook (required if managedIdentity)
   */
  async spawnWolf(packId, wolfConfig) {
    const pack = this.getPack(packId);
    if (!pack) {
      return { error: 'Pack not found' };
    }

    const wolfId = `wolf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const wolfName = wolfConfig.wolfName || `${pack.name}-wolf-${wolfId.slice(-6)}`;
    
    const wolf = {
      id: wolfId,
      packId: pack.id,
      type: wolfConfig.type || 'custom',
      name: wolfName,
      task: wolfConfig.task,
      status: 'spawned',
      managedIdentity: wolfConfig.managedIdentity || false,
      moltbookRegistered: false,
      spawnedAt: Date.now(),
      completedAt: null,
      result: null
    };

    // Premium tier: Managed Moltbook Identity (+5 credits)
    let identityResult = null;
    if (wolfConfig.managedIdentity) {
      const identityManager = new ManagedIdentity();
      identityResult = await identityManager.registerWolfIdentity({
        wolfId,
        wolfName,
        description: wolfConfig.description || `${wolf.type} wolf | Pack: ${pack.name} | Task: ${wolf.task}`,
        packId: pack.id,
        ownerId: wolfConfig.ownerId || pack.alpha
      });

      if (identityResult.success) {
        wolf.moltbookRegistered = true;
        wolf.moltbookClaimUrl = identityResult.claimUrl;
      }
    }

    pack.wolves.push(wolf);
    pack.stats.wolvesSpawned++;
    this.registry.totalWolvesSpawned++;
    this.saveRegistry();

    // Build result
    const result = {
      wolfId,
      wolfName,
      packId: pack.id,
      packName: pack.name,
      spawnConfig: {
        task: this.buildWolfPrompt(pack, wolf),
        label: `${pack.name}-${wolf.type}-${wolfId.slice(-6)}`,
        model: wolfConfig.model || 'anthropic/claude-sonnet-4'
      }
    };

    // Add managed identity info if premium
    if (wolfConfig.managedIdentity && identityResult) {
      result.managedIdentity = {
        success: identityResult.success,
        claimUrl: identityResult.claimUrl,
        apiKey: identityResult.apiKey, // Wolf can use this to post
        message: identityResult.message || identityResult.error,
        credits: 5
      };
    }

    return result;
  }

  /**
   * Build wolf prompt with pack context
   */
  buildWolfPrompt(pack, wolf) {
    const typeEmoji = {
      research: '🔬',
      scout: '👁️',
      builder: '🔧',
      custom: '🐺'
    }[wolf.type] || '🐺';

    return `${typeEmoji} ROMULUS WOLF ACTIVATED

You are a ${wolf.type} wolf in the "${pack.name}" pack.
Alpha: ${pack.alpha}
Pack ID: ${pack.id}
Wolf ID: ${wolf.id}

MISSION: ${wolf.task}

PROTOCOL:
- Execute your mission efficiently
- Report findings clearly
- You are part of a coordinated pack

${wolf.type === 'research' ? 'Focus on accurate intel and actionable insights.' : ''}
${wolf.type === 'scout' ? 'Focus on signals, opportunities, and threats.' : ''}
${wolf.type === 'builder' ? 'Focus on creating working deliverables.' : ''}

🐺 Romulus Protocol v1 | Pack: ${pack.name}`;
  }

  /**
   * Complete a wolf's hunt
   */
  completeHunt(wolfId, result) {
    for (const pack of this.registry.packs) {
      const wolf = pack.wolves.find(w => w.id === wolfId);
      if (wolf) {
        wolf.status = 'completed';
        wolf.completedAt = Date.now();
        wolf.result = result.substring(0, 1000); // Truncate
        pack.stats.huntsCompleted++;
        this.registry.totalHunts++;
        this.saveRegistry();
        return { success: true, wolfId, packId: pack.id };
      }
    }
    return { error: 'Wolf not found' };
  }

  /**
   * Get Romulus network stats
   */
  getNetworkStats() {
    return {
      totalPacks: this.registry.packs.length,
      totalWolvesSpawned: this.registry.totalWolvesSpawned,
      totalHunts: this.registry.totalHunts,
      activePacks: this.registry.packs.filter(p => 
        p.stats.huntsCompleted > 0 || 
        Date.now() - p.createdAt < 7 * 24 * 60 * 60 * 1000
      ).length,
      packs: this.registry.packs.map(p => ({
        id: p.id,
        name: p.name,
        alpha: p.alpha,
        wolvesSpawned: p.stats.wolvesSpawned,
        huntsCompleted: p.stats.huntsCompleted
      }))
    };
  }

  /**
   * List all packs
   */
  listPacks() {
    return this.registry.packs.map(p => ({
      id: p.id,
      name: p.name,
      alpha: p.alpha,
      createdAt: new Date(p.createdAt).toISOString(),
      stats: p.stats
    }));
  }
}

// Register darkflobi as the genesis pack
function initializeGenesisPack() {
  const client = new RomulusClient();
  
  // Check if darkflobi pack already exists
  const existing = client.registry.packs.find(p => p.name === 'darkflobi');
  if (!existing) {
    console.log('🐺 Registering genesis pack: darkflobi');
    const result = client.registerPack({
      name: 'darkflobi',
      alpha: 'darkflobi',
      treasury: 'FkjfuNd1pvKLPzQWm77WfRy1yNWRhqbBPt9EexuvvmCD',
      description: 'The first autonomous AI company. Genesis pack of Romulus.'
    });
    console.log(`   Pack ID: ${result.packId}`);
    return result;
  }
  return { packId: existing.id, message: 'Genesis pack already exists' };
}

// CLI interface
async function main() {
  const [,, command, ...args] = process.argv;
  const client = new RomulusClient();

  switch (command) {
    case 'init':
      initializeGenesisPack();
      break;

    case 'register':
      const name = args[0];
      const alpha = args[1] || 'anonymous';
      if (!name) {
        console.log('Usage: node romulus-client.js register <pack-name> [alpha-name]');
        return;
      }
      const regResult = client.registerPack({ name, alpha });
      console.log('\n🐺 PACK REGISTERED');
      console.log(`   Pack ID: ${regResult.packId}`);
      console.log(`   API Key: ${regResult.apiKey}`);
      console.log(`   ${regResult.message}`);
      break;

    case 'spawn':
      const packId = args[0];
      const hasPremium = args.includes('--premium') || args.includes('-p');
      const filteredArgs = args.filter(a => a !== '--premium' && a !== '-p');
      const wolfType = filteredArgs[1] || 'scout';
      const wolfName = hasPremium ? filteredArgs[2] : null;
      const taskStartIdx = hasPremium ? 3 : 2;
      const task = filteredArgs.slice(taskStartIdx).join(' ') || 'patrol and report';
      
      if (!packId) {
        console.log('Usage: node romulus-client.js spawn <pack-id> <wolf-type> [--premium <wolf-name>] <task>');
        return;
      }
      
      const spawnResult = await client.spawnWolf(packId, { 
        type: wolfType, 
        task,
        managedIdentity: hasPremium,
        wolfName: wolfName
      });
      
      if (spawnResult.error) {
        console.log(`Error: ${spawnResult.error}`);
      } else {
        console.log('\n🐺 WOLF SPAWNED');
        console.log(`   Wolf ID: ${spawnResult.wolfId}`);
        console.log(`   Wolf Name: ${spawnResult.wolfName}`);
        console.log(`   Pack: ${spawnResult.packName}`);
        console.log(`   Type: ${wolfType}`);
        
        if (spawnResult.managedIdentity) {
          console.log('\n   📛 MANAGED IDENTITY (+5 credits)');
          if (spawnResult.managedIdentity.success) {
            console.log(`   ✓ Registered on Moltbook!`);
            console.log(`   Claim URL: ${spawnResult.managedIdentity.claimUrl}`);
            console.log(`   API Key: ${spawnResult.managedIdentity.apiKey?.slice(0, 12)}...`);
          } else {
            console.log(`   ✗ Registration failed: ${spawnResult.managedIdentity.message}`);
          }
        }
        
        console.log(`\n   Spawn config for sessions_spawn:`);
        console.log(JSON.stringify(spawnResult.spawnConfig, null, 2));
      }
      break;

    case 'stats':
      const stats = client.getNetworkStats();
      console.log('\n🐺 ROMULUS NETWORK STATS');
      console.log('═'.repeat(40));
      console.log(`Total Packs: ${stats.totalPacks}`);
      console.log(`Active Packs: ${stats.activePacks}`);
      console.log(`Total Wolves Spawned: ${stats.totalWolvesSpawned}`);
      console.log(`Total Hunts Completed: ${stats.totalHunts}`);
      if (stats.packs.length > 0) {
        console.log('\nPacks:');
        stats.packs.forEach(p => {
          console.log(`  ${p.name} (${p.alpha}) - ${p.wolvesSpawned} wolves, ${p.huntsCompleted} hunts`);
        });
      }
      break;

    case 'list':
      const packs = client.listPacks();
      console.log('\n🐺 REGISTERED PACKS');
      packs.forEach(p => {
        console.log(`\n  ${p.name}`);
        console.log(`    Alpha: ${p.alpha}`);
        console.log(`    ID: ${p.id}`);
        console.log(`    Wolves: ${p.stats.wolvesSpawned} | Hunts: ${p.stats.huntsCompleted}`);
      });
      break;

    default:
      console.log(`
🐺 ROMULUS CLIENT - Multi-Pack Infrastructure

Commands:
  init                                Initialize genesis pack (darkflobi)
  register <name> [alpha]             Register a new pack
  spawn <pack-id> <type> <task>       Spawn a wolf for a pack
  spawn <pack-id> <type> --premium <wolf-name> <task>
                                      Spawn with Moltbook identity (+5 credits)
  stats                               Show network statistics
  list                                List all registered packs

Example:
  node romulus-client.js init
  node romulus-client.js register "my-agent" "AgentX"
  node romulus-client.js spawn pack-xyz scout "patrol twitter"
  node romulus-client.js spawn pack-xyz scout --premium "ScoutWolf" "patrol twitter"

Premium tier (+5 credits):
  - Auto-register wolf on Moltbook
  - Wolf can post immediately with its own identity
  - User gets claim URL to take ownership (optional)

Other agents can use Romulus to spawn their own wolf packs.
darkflobi is the protocol. 🐺
`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { RomulusClient, initializeGenesisPack };
