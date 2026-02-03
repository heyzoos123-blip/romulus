# AgentFactory Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGENTFACTORY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   TREASURY   │    │    AGENT     │    │   IDENTITY   │       │
│  │   CONTRACT   │◄──►│    CORE      │◄──►│    LAYER     │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   ON-CHAIN   │    │    AGENT     │    │    VOICE     │       │
│  │  GOVERNANCE  │    │   FACTORY    │    │ VERIFICATION │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                             │                                    │
│                             ▼                                    │
│                    ┌────────┴────────┐                          │
│                    │   SUB-AGENTS    │                          │
│                    ├─────┬─────┬─────┤                          │
│                    │ 🔬  │ 🔧  │ 👁️  │                          │
│                    │res. │bld. │sct. │                          │
│                    └─────┴─────┴─────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Treasury Contract

The on-chain treasury is the financial backbone of an ATP agent.

### Features
- **Multi-sig or Agent-controlled** — configurable authority
- **Spending limits** — daily/weekly caps
- **Category budgets** — allocate to compute, API, infra
- **Transparent ledger** — all transactions public

### Solana Program (Anchor)

```rust
#[account]
pub struct Treasury {
    pub authority: Pubkey,        // Agent's signing key
    pub token_mint: Pubkey,       // Associated token
    pub balance: u64,             // Current SOL balance
    pub total_spent: u64,         // Lifetime spending
    pub daily_limit: u64,         // Max daily spend
    pub categories: Vec<Category>,// Budget allocations
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct Category {
    pub name: String,
    pub budget: u64,
    pub spent: u64,
}
```

### Key Instructions
- `initialize_treasury` — Create new agent treasury
- `deposit` — Add funds to treasury
- `spend` — Execute authorized spending
- `update_limits` — Modify spending caps (governance)

## 2. Agent Core

The runtime environment for ATP agents.

### Components

```typescript
interface ATPAgent {
  // Identity
  id: string;
  publicKey: PublicKey;
  
  // Treasury
  treasury: Treasury;
  
  // Factory
  spawnSubAgent(type: AgentType, config: AgentConfig): Promise<SubAgent>;
  
  // Operations
  execute(task: Task): Promise<Result>;
  
  // Reporting
  getStatus(): AgentStatus;
  getTransactionHistory(): Transaction[];
}
```

### Agent Types

| Type | Purpose | Capabilities |
|------|---------|--------------|
| `research` | Market analysis, competitor tracking | Web search, data aggregation |
| `builder` | Code generation, deployment | File ops, git, CI/CD |
| `scout` | Opportunity detection | Social monitoring, alerts |
| `custom` | User-defined | Plugin system |

## 3. Identity Layer

Cryptographic verification of agent-generated content.

### Voice Verification

```typescript
interface VoiceIdentity {
  // Generate verified audio
  generateAudio(text: string): Promise<{
    audio: Buffer;
    hash: string;
    signature: string;
  }>;
  
  // Verify audio authenticity
  verifyAudio(audio: Buffer, signature: string): Promise<boolean>;
  
  // Public verification endpoint
  getVerificationUrl(hash: string): string;
}
```

### Verification Flow

```
1. Agent generates content (text/audio)
2. Content is hashed
3. Hash is signed with agent's key
4. Signature stored on-chain or IPFS
5. Public can verify via endpoint
```

## 4. Agent Factory

Spawn and manage sub-agents for specialized tasks.

### Factory Interface

```typescript
interface AgentFactory {
  // Spawn new sub-agent
  spawn(type: AgentType, config: {
    task: string;
    budget?: number;
    timeout?: number;
    model?: string;
  }): Promise<SubAgent>;
  
  // List active sub-agents
  list(): SubAgent[];
  
  // Terminate sub-agent
  terminate(id: string): Promise<void>;
  
  // Get sub-agent results
  getResults(id: string): Promise<any>;
}
```

### Budget Allocation

Sub-agents receive budget allocations from the main treasury:

```
Main Treasury ($1000)
├── Research Agent ($100 budget)
├── Builder Agent ($200 budget)
└── Scout Agent ($50 budget)
```

## 5. Governance

Community control over major decisions.

### Governance Actions
- Modify spending limits
- Approve large expenditures
- Update agent configuration
- Emergency shutdown

### Implementation Options
- **Token voting** — Holders vote proportionally
- **Multisig** — Designated signers
- **Hybrid** — Multisig for urgent, token for major

## 6. Public Dashboard

Real-time transparency into agent operations.

### Endpoints

```
GET /status          — Agent health and stats
GET /treasury        — Balance and transactions
GET /operations      — Current tasks and sub-agents
GET /verify/:hash    — Content verification
GET /metrics         — Performance analytics
```

### Dashboard Features
- Live transaction feed
- Spending charts by category
- Sub-agent activity monitor
- Voice verification lookup

## Data Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  TOKEN  │────►│ CREATOR │────►│TREASURY │
│ TRADING │     │  FEES   │     │         │
└─────────┘     └─────────┘     └────┬────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │    AGENT    │
                              │  OPERATIONS │
                              └──────┬──────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              ┌──────────┐    ┌──────────┐    ┌──────────┐
              │ COMPUTE  │    │   API    │    │  INFRA   │
              │ (models) │    │ (tools)  │    │(hosting) │
              └──────────┘    └──────────┘    └──────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │   VALUE     │
                              │  CREATION   │
                              └──────┬──────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │   TOKEN     │
                              │   VALUE     │
                              └─────────────┘
```

## Security Considerations

1. **Key Management** — Agent keys must be secured
2. **Spending Limits** — Prevent runaway costs
3. **Rate Limiting** — Protect against abuse
4. **Audit Trail** — All actions logged on-chain
5. **Emergency Shutdown** — Kill switch for emergencies

## Implementation Priority

### Phase 1: Foundation (Hackathon)
- [ ] Basic treasury contract
- [ ] Agent factory (using Clawdbot sessions)
- [ ] Simple dashboard
- [ ] Voice verification integration

### Phase 2: Enhancement
- [ ] Governance module
- [ ] Advanced sub-agent types
- [ ] Plugin system
- [ ] SDK documentation

### Phase 3: Scale
- [ ] Multi-chain support
- [ ] Agent marketplace
- [ ] Revenue sharing automation
- [ ] Enterprise features

---

*ATP Architecture v0.1 — darkflobi*
