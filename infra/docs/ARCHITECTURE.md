# Romulus Infrastructure Architecture

## Overview

Romulus provides token-gated AI agent infrastructure. $ROMULUS holders can spawn isolated AI agents that run in dedicated microVMs with resources allocated based on their holdings.

## Core Components

### 1. Gateway API (`/gateway`)

The entry point for all user interactions:

```
POST /spawn          - Spawn new agent VM
POST /stop/:id       - Stop agent VM
GET  /status/:id     - Check agent status
GET  /usage/:wallet  - Usage statistics
GET  /tiers          - Available subscription tiers
```

**Auth Flow:**
1. User signs message: `romulus:<timestamp>`
2. Gateway verifies signature
3. Gateway checks $ROMULUS balance via Solana RPC
4. Tier determined by holdings
5. Agent spawned with tier-appropriate resources

### 2. Hypercore Cluster (`/hypercore`)

Forked from [Vistara Labs Hypercore](https://github.com/Vistara-Labs/hypercore):

- **Firecracker microVMs**: ~125ms boot time
- **KVM isolation**: Hardware-level security
- **Containerd integration**: Standard container images
- **Clustering**: Multi-node deployment

**Spawn Flow:**
```
Gateway → POST /spawn → Hypercore → Firecracker VM → Agent running
```

### 3. Agent Images (`/agent-images`)

Pre-built Docker images optimized for different use cases:

| Image | Base | Size | Tools |
|-------|------|------|-------|
| agent-chat | node:22-alpine | ~150MB | Clawdbot |
| agent-coding | node:22-bookworm-slim | ~400MB | + git, python, typescript |
| agent-browser | playwright:jammy | ~1.2GB | + Chromium, browser automation |

## Token Economics

### Tier Thresholds

```javascript
const TIERS = {
  basic:    { min: 100_000,   cores: 1, memory: 1024 },
  standard: { min: 500_000,   cores: 2, memory: 2048 },
  pro:      { min: 1_000_000, cores: 4, memory: 4096 },
  power:    { min: 5_000_000, cores: 8, memory: 8192 }
};
```

### Usage Metering

- Uptime tracked per wallet
- Spawn count tracked
- Future: compute units, storage, bandwidth

## Security Model

### Isolation Layers

1. **Network**: Each VM gets separate IP
2. **Filesystem**: Isolated rootfs per VM
3. **Memory**: Hardware-enforced limits (KVM)
4. **CPU**: vCPU allocation enforced by hypervisor
5. **Secrets**: API keys passed via env, stored only in VM

### Auth Security

- Ed25519 signature verification
- 5-minute timestamp window
- On-chain balance verification
- One active agent per wallet (prevent abuse)

## Deployment Topology

### Single Node (Development)

```
┌─────────────────────────────────────┐
│          Single Server              │
│  ┌───────────┐  ┌───────────────┐   │
│  │  Gateway  │──│   Hypercore   │   │
│  └───────────┘  └───────────────┘   │
│                        │            │
│            ┌───────────┼───────────┐│
│            │           │           ││
│         ┌──┴──┐     ┌──┴──┐     ┌──┴──┐
│         │ VM  │     │ VM  │     │ VM  │
│         └─────┘     └─────┘     └─────┘
└─────────────────────────────────────┘
```

### Multi-Node (Production)

```
                    Load Balancer
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
    │ Gateway │     │ Gateway │     │ Gateway │
    │  (HA)   │     │  (HA)   │     │  (HA)   │
    └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                    Redis Cluster
                   (Session State)
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
    │Hypercore│     │Hypercore│     │Hypercore│
    │ Node 1  │     │ Node 2  │     │ Node 3  │
    └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │
      VMs x N         VMs x N         VMs x N
```

## API Examples

### Spawn Agent (cURL)

```bash
TIMESTAMP=$(date +%s)000
MESSAGE="romulus:$TIMESTAMP"
SIGNATURE=$(echo -n "$MESSAGE" | solana sign --keypair ~/.config/solana/id.json)

curl -X POST https://api.romulus.ai/spawn \
  -H "Content-Type: application/json" \
  -H "X-Wallet: <your-pubkey>" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d '{"agent_type": "coding"}'
```

### Response

```json
{
  "success": true,
  "agent": {
    "id": "a1b2c3d4-e5f6-7890",
    "url": "a1b2c3d4-e5f6-7890.romulus.ai",
    "wallet": "...",
    "tier": "pro",
    "spawned_at": 1707022560000
  },
  "tier_config": {
    "min": 1000000,
    "cores": 4,
    "memory": 4096
  }
}
```

## Roadmap

### Phase 1: MVP (Current)
- [x] Fork Hypercore
- [x] Token verification gateway
- [x] Tier-based resource allocation
- [ ] Basic agent images
- [ ] Single-node deployment

### Phase 2: Production
- [ ] Multi-node clustering
- [ ] Persistent volumes
- [ ] Usage-based billing
- [ ] Web dashboard

### Phase 3: Scale
- [ ] Auto-scaling
- [ ] Geographic distribution
- [ ] Custom agent images
- [ ] Marketplace

---

*Built for the $ROMULUS ecosystem*
