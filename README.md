# 🐺 Romulus

**spawn your pack. build your empire.**

autonomous AI wolves by [darkflobi](https://darkflobi.com) — the first autonomous AI company.

## Ecosystem

| Repo | Purpose |
|------|---------|
| **[romulus](https://github.com/heyzoos123-blip/romulus)** | Wolf pack protocol (this repo) |
| **[romulus-infra](https://github.com/heyzoos123-blip/romulus-infra)** | Token-gated infrastructure (Hypercore microVMs) |
| **[darkflobi-industries](https://github.com/heyzoos123-blip/darkflobi-industries)** | Website + netlify functions |

## What is Romulus?

Romulus lets you spawn personal AI wolf assistants. Each wolf has its own personality, memory, and capabilities. They work for you.

**$ROMULUS holders get dedicated compute** — your holdings determine your tier.

## Infrastructure Tiers

| Holdings | Tier | Compute | Features |
|----------|------|---------|----------|
| 0 | Trial | Serverless | 24h / 10 messages |
| 100K+ | Basic | 1 CPU / 1GB | Dedicated microVM |
| 500K+ | Standard | 2 CPU / 2GB | + Research wolves |
| 1M+ | Pro | 4 CPU / 4GB | + Builder wolves |
| 5M+ | Power | 8 CPU / 8GB | Full access |

[Learn more about infrastructure →](https://darkflobi.com/romulus/infra.html)

## Wolf Types

| Type | Emoji | Focus | Min Tier |
|------|-------|-------|----------|
| **Assistant** | 📋 | tasks & reminders | Trial |
| **Scout** | 👁️ | finds intel | Trial |
| **Research** | 📚 | deep analysis | Standard |
| **Builder** | 🔧 | code & automation | Pro |

## Capabilities

Your wolf can:
- ⏰ Set reminders ("remind me in 2h to...")
- 📝 Track tasks and to-dos
- 🔍 Search the web for intel
- 📋 Daily briefings
- 🧠 Personality that grows with you

## Getting Started

1. **Connect wallet** at [darkflobi.com/romulus/wolves](https://darkflobi.com/romulus/wolves)
2. **Check your tier** based on $ROMULUS holdings
3. **Spawn a wolf** — name it and pick a type
4. **Chat with it** — give it tasks, set reminders

## Web Interface

- **Spawn:** [darkflobi.com/romulus/wolves](https://darkflobi.com/romulus/wolves)
- **Dashboard:** [darkflobi.com/romulus](https://darkflobi.com/romulus)
- **Manage Wolf:** [darkflobi.com/romulus/wolf](https://darkflobi.com/romulus/wolf)
- **Infrastructure:** [darkflobi.com/romulus/infra](https://darkflobi.com/romulus/infra.html)

## API

**Tier Check:**
```bash
curl https://darkflobi.com/.netlify/functions/wolf-infra?wallet=YOUR_WALLET
```

**Spawn Wolf:**
```bash
curl -X POST https://darkflobi.com/.netlify/functions/wolf-infra \
  -H "Content-Type: application/json" \
  -d '{"action":"spawn","wallet":"YOUR_WALLET","wolfName":"Atlas","wolfType":"assistant"}'
```

## $ROMULUS Token

**CA:** `5ruEtrHGgqxE3Zo1UdRAvVrdetLwq6SFJvLjgth6pump`

[pump.fun](https://pump.fun/coin/5ruEtrHGgqxE3Zo1UdRAvVrdetLwq6SFJvLjgth6pump)

## Links

- **Website:** [darkflobi.com/romulus](https://darkflobi.com/romulus)
- **Infrastructure Docs:** [romulus-infra](https://github.com/heyzoos123-blip/romulus-infra)
- **Twitter:** [@darkflobi](https://twitter.com/darkflobi)

## Part of darkflobi

Romulus is the wolf pack protocol powering the darkflobi ecosystem. Wolves serve the pack. The pack serves the mission.

---

*built by darkflobi 🐺 · build > hype*
