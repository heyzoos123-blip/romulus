# Romulus Launch Checklist

## Phase 1: Infrastructure (Week 1)

### Server
- [ ] Order Hetzner AX52 (€79/mo) - https://www.hetzner.com/dedicated-rootserver/ax52
  - Location: Ashburn (US) or Falkenstein (EU)
  - OS: Ubuntu 22.04
- [ ] Verify KVM enabled after delivery
- [ ] Setup SSH keys, disable password auth
- [ ] Configure firewall (ufw)
- [ ] Install fail2ban

### Domain
- [ ] Register romulus.ai (or alternative)
  - Check: Namecheap, Porkbun, Cloudflare
- [ ] Setup Cloudflare (free tier)
  - A record: romulus.ai → server IP
  - A record: api.romulus.ai → server IP  
  - A record: *.romulus.ai → server IP
- [ ] Enable Cloudflare proxy (orange cloud)

### SSL
- [ ] Install Caddy on server
- [ ] Configure wildcard cert for *.romulus.ai
- [ ] Test HTTPS working

## Phase 2: Software (Week 1-2)

### Hypercore
- [ ] Clone romulus-infra to server
- [ ] Build Hypercore (`make build`)
- [ ] Setup containerd
- [ ] Test VM spawn locally
- [ ] Configure networking (bridge mode)

### Gateway
- [ ] Install Node.js 22
- [ ] `npm install` in gateway/
- [ ] Configure .env with production values
- [ ] Setup systemd service
- [ ] Test wallet verification

### Agent Images
- [ ] Build all three images
- [ ] Push to GitHub Container Registry (ghcr.io)
- [ ] Test spawn each tier

## Phase 3: Testing (Week 2)

### Functional Tests
- [ ] Spawn agent with valid wallet
- [ ] Reject spawn with insufficient balance
- [ ] Stop agent works
- [ ] Status endpoint works
- [ ] Usage tracking works
- [ ] Multiple concurrent agents

### Load Tests
- [ ] 10 simultaneous spawns
- [ ] Agent survives 24hr uptime
- [ ] Memory doesn't leak

### Security Tests
- [ ] Invalid signature rejected
- [ ] Expired timestamp rejected
- [ ] Can't stop other user's agent
- [ ] VM isolation verified

## Phase 4: Launch (Week 3)

### Soft Launch
- [ ] Announce on Twitter
- [ ] Post on Moltbook
- [ ] Telegram community
- [ ] Invite early testers (top holders)

### Docs
- [ ] Landing page at romulus.ai
- [ ] API docs
- [ ] Getting started guide
- [ ] Tier explanation

### Monitoring
- [ ] Setup uptime monitoring (uptimerobot)
- [ ] Setup error alerting
- [ ] Daily backup script

## Phase 5: Scale (Month 2+)

### Infrastructure
- [ ] Add second server (geographic redundancy)
- [ ] Setup Redis for session state
- [ ] Load balancer

### Features
- [ ] Persistent volumes
- [ ] Custom agent images
- [ ] Web dashboard
- [ ] Usage-based pricing

---

## Quick Reference

**Server Order:**
https://www.hetzner.com/dedicated-rootserver/ax52

**Domain Check:**
```bash
whois romulus.ai
```

**Test Spawn:**
```bash
curl -X POST https://api.romulus.ai/spawn \
  -H "X-Wallet: <pubkey>" \
  -H "X-Signature: <sig>" \
  -H "X-Timestamp: $(date +%s)000" \
  -d '{"agent_type": "chat"}'
```

**Repo:**
https://github.com/heyzoos123-blip/romulus-infra

---

*let's ship it* 😁
