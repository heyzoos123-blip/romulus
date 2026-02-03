#!/usr/bin/env node
/**
 * wolf-pipeline.js - Coordinated wolf operations
 * 
 * Wolves that work together:
 * 1. Research wolf hunts intel
 * 2. Passes findings to next wolf
 * 3. Builder/action wolf executes based on intel
 * 
 * This is pack intelligence - not isolated tasks.
 * 
 * @author darkflobi
 */

const fs = require('fs');
const path = require('path');

const PIPELINE_STATE_PATH = path.join(__dirname, '../../../data/wolf-pipeline-state.json');

class WolfPipeline {
  constructor() {
    this.state = {
      activePipelines: [],
      completedPipelines: [],
      wolfHandoffs: []
    };
    this.load();
  }

  load() {
    if (fs.existsSync(PIPELINE_STATE_PATH)) {
      this.state = JSON.parse(fs.readFileSync(PIPELINE_STATE_PATH));
    }
  }

  save() {
    const dir = path.dirname(PIPELINE_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PIPELINE_STATE_PATH, JSON.stringify(this.state, null, 2));
  }

  /**
   * Create a new pipeline
   * @param {string} name - Pipeline name
   * @param {Array} stages - Array of stage definitions
   */
  createPipeline(name, stages) {
    const pipeline = {
      id: `pipeline-${Date.now().toString(36)}`,
      name,
      stages: stages.map((stage, i) => ({
        ...stage,
        index: i,
        status: i === 0 ? 'ready' : 'waiting',
        result: null,
        startedAt: null,
        completedAt: null
      })),
      status: 'ready',
      createdAt: Date.now(),
      currentStage: 0
    };

    this.state.activePipelines.push(pipeline);
    this.save();

    return pipeline;
  }

  /**
   * Get the current stage task for a pipeline
   */
  getCurrentTask(pipelineId) {
    const pipeline = this.state.activePipelines.find(p => p.id === pipelineId);
    if (!pipeline) return null;

    const stage = pipeline.stages[pipeline.currentStage];
    if (!stage) return null;

    // Build task with context from previous stages
    const previousResults = pipeline.stages
      .slice(0, pipeline.currentStage)
      .filter(s => s.result)
      .map(s => `[${s.wolfType} wolf reported]: ${s.result}`)
      .join('\n\n');

    const contextPrompt = previousResults 
      ? `\n\nPREVIOUS WOLF FINDINGS:\n${previousResults}\n\nUse this intel for your mission.`
      : '';

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      stageIndex: stage.index,
      wolfType: stage.wolfType,
      task: stage.task + contextPrompt,
      isFirstStage: stage.index === 0,
      isLastStage: stage.index === pipeline.stages.length - 1
    };
  }

  /**
   * Complete a stage and advance pipeline
   */
  completeStage(pipelineId, stageIndex, result) {
    const pipeline = this.state.activePipelines.find(p => p.id === pipelineId);
    if (!pipeline) return null;

    const stage = pipeline.stages[stageIndex];
    if (!stage) return null;

    // Record result
    stage.status = 'completed';
    stage.result = result;
    stage.completedAt = Date.now();

    // Log the handoff
    this.state.wolfHandoffs.push({
      pipelineId,
      pipelineName: pipeline.name,
      fromWolf: stage.wolfType,
      toWolf: pipeline.stages[stageIndex + 1]?.wolfType || 'alpha',
      result: result.substring(0, 500), // Truncate for log
      timestamp: Date.now()
    });

    // Advance to next stage or complete
    if (stageIndex < pipeline.stages.length - 1) {
      pipeline.currentStage = stageIndex + 1;
      pipeline.stages[stageIndex + 1].status = 'ready';
      pipeline.stages[stageIndex + 1].startedAt = Date.now();
    } else {
      // Pipeline complete
      pipeline.status = 'completed';
      pipeline.completedAt = Date.now();
      
      // Move to completed
      this.state.activePipelines = this.state.activePipelines.filter(p => p.id !== pipelineId);
      this.state.completedPipelines.push(pipeline);
    }

    this.save();
    return pipeline;
  }

  /**
   * Get pipeline status
   */
  getStatus(pipelineId) {
    return this.state.activePipelines.find(p => p.id === pipelineId) ||
           this.state.completedPipelines.find(p => p.id === pipelineId);
  }

  /**
   * List all pipelines
   */
  list() {
    return {
      active: this.state.activePipelines,
      completed: this.state.completedPipelines.slice(-10),
      handoffs: this.state.wolfHandoffs.slice(-20)
    };
  }
}

// Pre-built pipeline templates
const PIPELINE_TEMPLATES = {
  // Research → Build pipeline
  researchAndBuild: (topic, buildTask) => [
    {
      wolfType: 'research',
      task: `🔬 RESEARCH WOLF: Hunt for intel on: ${topic}. Find actionable insights, data, and opportunities. Your findings will be passed to a builder wolf.`
    },
    {
      wolfType: 'builder', 
      task: `🔧 BUILDER WOLF: Based on the research wolf's findings, ${buildTask}. Use the intel provided to create something valuable.`
    }
  ],

  // Scout → Research → Action pipeline
  fullRecon: (target) => [
    {
      wolfType: 'scout',
      task: `👁️ SCOUT WOLF: Quick recon on ${target}. Identify key signals, opportunities, and threats. Pass your findings to the research wolf.`
    },
    {
      wolfType: 'research',
      task: `🔬 RESEARCH WOLF: Deep dive on the scout's findings. Analyze, verify, and expand on the intel. Prepare actionable recommendations.`
    },
    {
      wolfType: 'builder',
      task: `🔧 BUILDER WOLF: Execute on the research. Create a deliverable based on the pack's intel.`
    }
  ],

  // Competitor analysis pipeline
  competitorAnalysis: (competitor) => [
    {
      wolfType: 'scout',
      task: `👁️ SCOUT WOLF: Find ${competitor}'s recent activity - social posts, announcements, code commits. Quick surface scan.`
    },
    {
      wolfType: 'research',
      task: `🔬 RESEARCH WOLF: Analyze the scout's findings. What is ${competitor} building? What are their strengths/weaknesses? How can we differentiate?`
    }
  ]
};

// CLI interface
async function main() {
  const [,, command, ...args] = process.argv;
  const pipeline = new WolfPipeline();

  switch (command) {
    case 'create':
      const template = args[0];
      const param = args.slice(1).join(' ');
      
      if (!template || !PIPELINE_TEMPLATES[template]) {
        console.log('Available templates:');
        Object.keys(PIPELINE_TEMPLATES).forEach(t => console.log(`  - ${t}`));
        return;
      }
      
      const stages = PIPELINE_TEMPLATES[template](param);
      const newPipeline = pipeline.createPipeline(`${template}: ${param}`, stages);
      console.log(`\n🐺 Pipeline created: ${newPipeline.id}`);
      console.log(`   Name: ${newPipeline.name}`);
      console.log(`   Stages: ${stages.length}`);
      stages.forEach((s, i) => console.log(`     ${i + 1}. ${s.wolfType} wolf`));
      break;

    case 'status':
      const pipelineId = args[0];
      if (pipelineId) {
        const status = pipeline.getStatus(pipelineId);
        if (status) {
          console.log(`\n🐺 Pipeline: ${status.name}`);
          console.log(`   Status: ${status.status}`);
          status.stages.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.wolfType}: ${s.status}`);
            if (s.result) console.log(`      Result: ${s.result.substring(0, 100)}...`);
          });
        }
      } else {
        const all = pipeline.list();
        console.log(`\n🐺 WOLF PIPELINES`);
        console.log(`   Active: ${all.active.length}`);
        console.log(`   Completed: ${all.completed.length}`);
        console.log(`   Handoffs: ${all.handoffs.length}`);
      }
      break;

    case 'next':
      const pid = args[0];
      const task = pipeline.getCurrentTask(pid);
      if (task) {
        console.log(`\n🐺 Next task for pipeline ${task.pipelineName}:`);
        console.log(`   Wolf: ${task.wolfType}`);
        console.log(`   Stage: ${task.stageIndex + 1}`);
        console.log(`   Task:\n${task.task}`);
      } else {
        console.log('Pipeline not found or completed');
      }
      break;

    case 'complete':
      const completeId = args[0];
      const stageIdx = parseInt(args[1]);
      const result = args.slice(2).join(' ');
      pipeline.completeStage(completeId, stageIdx, result);
      console.log(`Stage ${stageIdx} completed`);
      break;

    default:
      console.log(`
🐺 WOLF PIPELINE - Coordinated Operations

Commands:
  create <template> <params>  Create a new pipeline
  status [pipelineId]         Show pipeline status
  next <pipelineId>           Get next task for pipeline
  complete <id> <stage> <result>  Mark stage complete

Templates:
  researchAndBuild <topic> <buildTask>
  fullRecon <target>
  competitorAnalysis <competitor>

Example:
  node wolf-pipeline.js create competitorAnalysis "Solana Agent Kit"
`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WolfPipeline, PIPELINE_TEMPLATES };
