/**
 * ATP Agent Factory
 * 
 * Spawn and manage sub-agents with budget allocation.
 * Built on Clawdbot sessions infrastructure.
 * 
 * @author darkflobi
 * @license MIT
 */

class AgentFactory {
  constructor(config = {}) {
    this.treasury = config.treasury || null;
    this.defaultModel = config.model || 'anthropic/claude-sonnet-4';
    this.activeAgents = new Map();
    this.spawnHistory = [];
  }

  /**
   * Spawn a new sub-agent for a specific task
   * @param {string} type - Agent type: 'research', 'builder', 'scout', 'custom'
   * @param {object} config - Agent configuration
   * @returns {Promise<object>} - Spawn result with session info
   */
  async spawn(type, config) {
    const agentConfig = this._buildAgentConfig(type, config);
    
    const spawnRecord = {
      id: this._generateId(),
      type,
      task: config.task,
      budget: config.budget || 0,
      model: agentConfig.model,
      spawnedAt: new Date().toISOString(),
      status: 'pending'
    };

    this.spawnHistory.push(spawnRecord);
    
    // In production, this calls Clawdbot sessions_spawn
    // For SDK, we return the config for the caller to execute
    return {
      ...spawnRecord,
      agentConfig,
      execute: () => this._executeSpawn(agentConfig, spawnRecord)
    };
  }

  /**
   * Build agent configuration based on type
   */
  _buildAgentConfig(type, config) {
    const baseConfig = {
      task: config.task,
      model: config.model || this.defaultModel,
      label: config.label || `atp-${type}-${this._generateId().slice(0, 8)}`,
      timeoutSeconds: config.timeout || 300
    };

    // Type-specific prompts
    const typePrompts = {
      research: `You are a research agent. Your task: ${config.task}
        
Focus on:
- Gathering accurate information
- Citing sources when possible
- Providing actionable insights
- Being concise but thorough

Report findings in a structured format.`,

      builder: `You are a builder agent. Your task: ${config.task}

Focus on:
- Writing clean, working code
- Following best practices
- Testing your work
- Documenting what you build

Ship something that works.`,

      scout: `You are a scout agent. Your task: ${config.task}

Focus on:
- Monitoring for opportunities
- Detecting relevant signals
- Filtering noise from signal
- Reporting actionable intel

Be the eyes and ears. Report what matters.`,

      custom: config.task
    };

    baseConfig.task = typePrompts[type] || typePrompts.custom;
    
    return baseConfig;
  }

  /**
   * Execute the spawn via Clawdbot sessions_spawn
   * 
   * Returns spawn config that can be passed directly to sessions_spawn.
   * When running inside Clawdbot, the alpha calls sessions_spawn with this config.
   */
  async _executeSpawn(agentConfig, spawnRecord) {
    spawnRecord.status = 'ready';
    
    // Build the spawn config for Clawdbot
    const spawnConfig = {
      task: agentConfig.task,
      label: `wolf-${spawnRecord.type}-${spawnRecord.id.slice(0, 8)}`,
      model: agentConfig.model || 'anthropic/claude-sonnet-4', // sonnet for wolves
      runTimeoutSeconds: agentConfig.timeout || 300,
      cleanup: 'keep'
    };
    
    spawnRecord.spawnConfig = spawnConfig;
    this.activeAgents.set(spawnRecord.id, spawnRecord);
    
    return {
      ...spawnRecord,
      spawnConfig,
      // Helper: the actual sessions_spawn call would be:
      // sessions_spawn({ task: spawnConfig.task, label: spawnConfig.label, ... })
    };
  }

  /**
   * List all active agents
   */
  listActive() {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Get spawn history
   */
  getHistory() {
    return this.spawnHistory;
  }

  /**
   * Get agent by ID
   */
  getAgent(id) {
    return this.activeAgents.get(id) || 
           this.spawnHistory.find(a => a.id === id);
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Pre-configured agent types for quick spawning
 */
const AgentTypes = {
  RESEARCH: 'research',
  BUILDER: 'builder', 
  SCOUT: 'scout',
  CUSTOM: 'custom'
};

/**
 * Quick spawn helpers
 */
const quickSpawn = {
  researcher: (task, options = {}) => {
    const factory = new AgentFactory(options);
    return factory.spawn(AgentTypes.RESEARCH, { task, ...options });
  },
  
  builder: (task, options = {}) => {
    const factory = new AgentFactory(options);
    return factory.spawn(AgentTypes.BUILDER, { task, ...options });
  },
  
  scout: (task, options = {}) => {
    const factory = new AgentFactory(options);
    return factory.spawn(AgentTypes.SCOUT, { task, ...options });
  }
};

module.exports = {
  AgentFactory,
  AgentTypes,
  quickSpawn
};
