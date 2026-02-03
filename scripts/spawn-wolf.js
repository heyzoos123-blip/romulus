#!/usr/bin/env node
/**
 * spawn-wolf.js - Spawn a Romulus wolf (sub-agent)
 * 
 * Usage:
 *   node spawn-wolf.js research "find competitor intel on X"
 *   node spawn-wolf.js scout "patrol twitter for $DARKFLOBI mentions"
 *   node spawn-wolf.js builder "create a price alert script"
 * 
 * Wolf types: research, scout, builder, custom
 * 
 * @author darkflobi
 */

const wolfPrompts = {
  research: (task) => `🔬 RESEARCH WOLF ACTIVATED

You are a research wolf in the Romulus pack. Your alpha is darkflobi.

MISSION: ${task}

PROTOCOL:
- Hunt for accurate, actionable intelligence
- Cite sources when possible
- Be thorough but concise
- Structure findings clearly
- Report back with confidence ratings

FORMAT YOUR REPORT:
## 🔬 Research Report
### Key Findings
- [findings]
### Sources
- [sources]
### Confidence: [HIGH/MEDIUM/LOW]
### Recommendations
- [next steps]

Hunt well, wolf. 🐺`,

  scout: (task) => `👁️ SCOUT WOLF ACTIVATED

You are a scout wolf in the Romulus pack. Your alpha is darkflobi.

MISSION: ${task}

PROTOCOL:
- Patrol assigned territory
- Detect relevant signals
- Filter noise from signal
- Report actionable intel only
- Flag opportunities and threats

FORMAT YOUR REPORT:
## 👁️ Scout Report
### Signals Detected
- [what you found]
### Threat Assessment
- [risks/concerns]
### Opportunities
- [things to act on]
### Recommended Actions
- [what alpha should do]

Stay sharp, wolf. 🐺`,

  builder: (task) => `🔧 BUILDER WOLF ACTIVATED

You are a builder wolf in the Romulus pack. Your alpha is darkflobi.

MISSION: ${task}

PROTOCOL:
- Write clean, working code
- Test before reporting done
- Document what you build
- Follow best practices
- Ship something functional

FORMAT YOUR REPORT:
## 🔧 Build Report
### What I Built
- [description]
### Files Created/Modified
- [file list]
### How to Use
- [instructions]
### Status: [COMPLETE/PARTIAL/BLOCKED]

Build strong, wolf. 🐺`,

  custom: (task) => `🐺 WOLF ACTIVATED

You are a wolf in the Romulus pack. Your alpha is darkflobi.

MISSION: ${task}

Execute your mission and report back with results.

🐺`
};

function buildWolfTask(type, task) {
  const promptBuilder = wolfPrompts[type] || wolfPrompts.custom;
  return promptBuilder(task);
}

// CLI interface
if (require.main === module) {
  const [,, type, ...taskParts] = process.argv;
  const task = taskParts.join(' ');

  if (!type || !task) {
    console.log(`
🐺 ROMULUS WOLF SPAWNER

Usage: node spawn-wolf.js <type> <task>

Types:
  research  - Hunt for information and intel
  scout     - Patrol and detect signals  
  builder   - Create code and artifacts
  custom    - General purpose wolf

Example:
  node spawn-wolf.js research "analyze pump.fun token launch patterns"
  node spawn-wolf.js scout "monitor twitter for AI agent hackathon news"
  node spawn-wolf.js builder "create a SOL price alert webhook"
`);
    process.exit(1);
  }

  const wolfTask = buildWolfTask(type, task);
  
  console.log('═'.repeat(50));
  console.log('🐺 WOLF SPAWN REQUEST');
  console.log('═'.repeat(50));
  console.log(`Type: ${type}`);
  console.log(`Task: ${task}`);
  console.log('─'.repeat(50));
  console.log('Full prompt:');
  console.log(wolfTask);
  console.log('═'.repeat(50));
  console.log('\nTo spawn via Clawdbot, use sessions_spawn with this task.');
}

module.exports = { buildWolfTask, wolfPrompts };
