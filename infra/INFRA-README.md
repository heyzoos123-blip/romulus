# Romulus Infrastructure

Token-gated AI agent orchestration built on [Hypercore](https://github.com/Vistara-Labs/hypercore).

## Ecosystem

| Repo | Purpose |
|------|---------|
| **[romulus](https://github.com/heyzoos123-blip/romulus)** | Wolf pack protocol + docs |
| **[romulus-infra](https://github.com/heyzoos123-blip/romulus-infra)** | Infrastructure (this repo) |
| **[darkflobi-industries](https://github.com/heyzoos123-blip/darkflobi-industries)** | Website + Netlify functions |

**Live at:** [darkflobi.com/romulus](https://darkflobi.com/romulus)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Romulus Gateway                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Wallet    │  │    Tier     │  │   Usage     │              │
│  │   Verify    │  │   Manager   │  │   Tracker   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Hypercore Cluster                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Agent VM   │  │   Agent VM   │  │   Agent VM   │           │
│  │   Holder A   │  │   Holder B   │  │   Holder C   │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Token Gating

$ROMULUS holders get access based on holdings:

| Holdings | Tier | CPU | RAM | Features |
|----------|------|-----|-----|----------|
| 100k+ | Basic | 1 | 1GB | Chat agent |
| 500k+ | Standard | 2 | 2GB | Coding agent |
| 1M+ | Pro | 4 | 4GB | Multi-tool (browser, APIs) |
| 5M+ | Power | 8 | 8GB | Local inference, priority |

## Components

- `gateway/` - Token-gated API layer
- `hypercore/` - Forked VM orchestration (Vistara Labs)
- `agent-images/` - Pre-built agent Docker images
- `contracts/` - Solana program for subscription validation

## Quick Start

```bash
# 1. Deploy Hypercore cluster
cd hypercore && make build

# 2. Start Romulus gateway
cd gateway && npm start

# 3. Spawn agent (requires $ROMULUS)
curl -X POST https://api.romulus.ai/spawn \
  -H "X-Wallet: <solana-pubkey>" \
  -H "X-Signature: <signed-message>" \
  -d '{"agent_type": "coding"}'
```

## API

### POST /spawn
Spawn a new agent VM for authenticated holder.

### GET /status/:id
Check agent VM status.

### POST /stop/:id
Terminate agent VM.

### GET /usage/:wallet
Get usage stats for wallet.

## Roadmap

- [x] Fork Hypercore
- [ ] Token verification layer
- [ ] Tier-based resource allocation
- [ ] Usage metering
- [ ] Web dashboard
- [ ] Persistent storage (volumes)

---

*part of the $ROMULUS ecosystem*
