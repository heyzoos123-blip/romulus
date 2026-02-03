#!/usr/bin/env node
/**
 * ATP Agent Spawner
 * 
 * CLI tool to spawn sub-agents via Clawdbot.
 * This is the real integration - not a simulation.
 * 
 * Usage:
 *   node spawn-agent.js research "analyze hackathon competitors"
 *   node spawn-agent.js builder "create treasury dashboard"
 *   node spawn-agent.js scout "monitor twitter mentions"
 * 
 * @author darkflobi
 */

const TYPE_PROMPTS = {
  research: (task) => `You are a research agent spawned by darkflobi (ATP - Agent Treasury Protocol).

Your task: ${task}

Guidelines:
- Be thorough but concise
- Cite sources when possible
- Focus on actionable insights
- Format output clearly with headers

Report your findings in a structured format. Include a summary at the top.`,

  builder: (task) => `You are a builder agent spawned by darkflobi (ATP - Agent Treasury Protocol).

Your task: ${task}

Guidelines:
- Write clean, working code
- Follow best practices
- Test what you build
- Document your work
- Use existing workspace structure

After completing, summarize what you built and where the files are.`,

  scout: (task) => `You are a scout agent spawned by darkflobi (ATP - Agent Treasury Protocol).

Your task: ${task}

Guidelines:
- Monitor specified targets
- Filter noise from signal
- Report only actionable intel
- Be specific with findings

Report what you find in a structured format with priority levels.`,

  custom: (task) => task
};

function buildSpawnConfig(type, task, options = {}) {
  const prompt = TYPE_PROMPTS[type] || TYPE_PROMPTS.custom;
  
  return {
    task: prompt(task),
    label: options.label || `atp-${type}-${Date.now().toString(36).slice(-6)}`,
    model: options.model || 'anthropic/claude-sonnet-4',
    runTimeoutSeconds: options.timeout || 300
  };
}

function printUsage() {
  console.log(`
╔════════════════════════════════════════════╗
║        ATP AGENT SPAWNER                   ║
╠════════════════════════════════════════════╣
║ Usage:                                     ║
║   node spawn-agent.js <type> "<task>"      ║
║                                            ║
║ Types:                                     ║
║   research - Analysis and investigation    ║
║   builder  - Code and create               ║
║   scout    - Monitor and detect            ║
║   custom   - Raw task (no template)        ║
║                                            ║
║ Options:                                   ║
║   --model <model>    Override model        ║
║   --timeout <secs>   Set timeout           ║
║   --label <name>     Custom label          ║
║                                            ║
║ Examples:                                  ║
║   node spawn-agent.js research "analyze x" ║
║   node spawn-agent.js builder "create y"   ║
║   node spawn-agent.js scout "monitor z"    ║
╚════════════════════════════════════════════╝
  `);
}

// Parse CLI args
const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const type = args[0];
const task = args[1];

// Parse options
const options = {};
for (let i = 2; i < args.length; i += 2) {
  const key = args[i].replace('--', '');
  const value = args[i + 1];
  options[key] = key === 'timeout' ? parseInt(value) : value;
}

// Build config
const config = buildSpawnConfig(type, task, options);

// Output for Clawdbot integration
console.log(`
┌─────────────────────────────────────────┐
│ ATP SPAWN REQUEST                       │
├─────────────────────────────────────────┤
│ Type:    ${type.padEnd(30)}│
│ Label:   ${config.label.padEnd(30)}│
│ Model:   ${config.model.padEnd(30)}│
│ Timeout: ${(config.runTimeoutSeconds + 's').padEnd(30)}│
├─────────────────────────────────────────┤
│ Task:                                   │
${task.slice(0, 70).padEnd(41)}│
└─────────────────────────────────────────┘

Spawn config (copy to sessions_spawn):
${JSON.stringify(config, null, 2)}
`);
