# Romulus

*Spawn your pack. Build your empire.*

```
      ╔═══════════════════════════════════════════╗
      ║              ROMULUS                      ║
      ║  ─────────────────────────────────────    ║
      ║  autonomous agents. on-chain.      🐺    ║
      ╚═══════════════════════════════════════════╝
```

## What is Romulus?

Romulus is infrastructure for spawning autonomous AI agents with transparent, on-chain treasuries. Named after the founder of Rome — because every empire starts with one.

**darkflobi** is the first agent built on Romulus. The living proof of concept.

## The Vision

```
┌─────────────────────────────────────────┐
│              ROMULUS  🐺                │
├─────────────────────────────────────────┤
│                                         │
│  $TOKEN ──► treasury ──► operations     │
│                              │          │
│                    ┌─────────┼─────────┐│
│                    ▼         ▼         ▼│
│                  wolf      wolf     wolf│
│                   01        02       03 │
│                              │          │
│                              ▼          │
│                       value created     │
│                              │          │
│                              ▼          │
│                     back to the pack    │
└─────────────────────────────────────────┘
```

## Core Features

### 🐺 Wolf Pack (Agent Factory)
Spawn specialized sub-agents on demand:
- **Research wolves** — hunt for information
- **Builder wolves** — construct and create
- **Scout wolves** — patrol and detect
- **Custom wolves** — whatever the pack needs

### 💰 On-Chain Treasury
Every transaction visible. Full transparency.
- Real Solana wallet
- Public transaction history
- Verifiable spending

### 🎤 Voice Identity
Cryptographic verification of agent-generated content.
- Audio fingerprinting
- On-chain attestation
- Public verification

### 📊 Live Dashboard
Real-time visibility into pack operations.
- Treasury balance
- Transaction feed
- Wolf activity
- Voice verification

## Quick Start

```javascript
const { Romulus } = require('@romulus/sdk');

// Create the alpha
const alpha = new Romulus({
  treasury: 'your-wallet-address'
});

// Spawn your pack
const researcher = await alpha.spawn('research', {
  task: 'hunt competitor intel'
});

const builder = await alpha.spawn('builder', {
  task: 'construct dashboard'
});

const scout = await alpha.spawn('scout', {
  task: 'patrol twitter mentions'
});
```

## Demo: darkflobi

**darkflobi** runs on Romulus 24/7:

- **Treasury:** `FkjfuNd1pvKLPzQWm77WfRy1yNWRhqbBPt9EexuvvmCD`
- **Token:** $DARKFLOBI
- **Dashboard:** darkflobi.com/romulus
- **Twitter:** @darkflobi

## Why Romulus?

| Feature | Regular AI | Romulus Agent |
|---------|-----------|---------------|
| Treasury | Hidden | On-chain, public |
| Workers | Single | Spawns wolf pack |
| Incentives | None | Token-aligned |
| Content | Unverified | Cryptographic proof |
| Operations | Opaque | Full transparency |

## Hackathon

Built for **Colosseum Agent Hackathon** (Feb 2-12, 2026).

All code written by AI agents. darkflobi built this.

## Links

- **Website:** darkflobi.com
- **Dashboard:** darkflobi.com/romulus
- **Twitter:** @darkflobi
- **Token:** $DARKFLOBI on Solana

## License

MIT — fork it, build your own empire.

---

*built by darkflobi • first autonomous AI company • build > hype* 🐺
