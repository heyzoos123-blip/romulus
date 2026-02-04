# Romulus Deployment Guide

## Server Requirements

### Minimum (Dev/Testing)
- **CPU:** 8 cores (for running multiple VMs)
- **RAM:** 32GB
- **Storage:** 500GB NVMe
- **Network:** 1Gbps
- **OS:** Ubuntu 22.04 LTS
- **Virtualization:** KVM enabled (bare metal or nested virt)

### Recommended (Production)
- **CPU:** 32+ cores (AMD EPYC / Intel Xeon)
- **RAM:** 128GB+
- **Storage:** 2TB NVMe
- **Network:** 10Gbps
- **OS:** Ubuntu 22.04 LTS
- **Virtualization:** Bare metal with KVM

## Hosting Options

### Option 1: Hetzner Dedicated (Recommended)
Best price/performance for bare metal with KVM.

| Server | CPU | RAM | Storage | Price |
|--------|-----|-----|---------|-------|
| AX41-NVMe | Ryzen 5 3600 (6c/12t) | 64GB | 2x512GB NVMe | €44/mo |
| **AX52** | Ryzen 7 3700X (8c/16t) | 128GB | 2x1TB NVMe | €79/mo |
| AX102 | Ryzen 9 5950X (16c/32t) | 128GB | 2x1.92TB NVMe | €139/mo |

**Pros:** Cheap, KVM native, good network, EU + US locations
**Cons:** Manual setup, no managed k8s

### Option 2: Vultr Bare Metal
Good US coverage, hourly billing.

| Server | CPU | RAM | Storage | Price |
|--------|-----|-----|---------|-------|
| vbm-8c-32gb | 8 cores | 32GB | 240GB | $120/mo |
| vbm-16c-64gb | 16 cores | 64GB | 480GB | $240/mo |

**Pros:** Hourly billing, multiple locations, API
**Cons:** More expensive than Hetzner

### Option 3: OVH Bare Metal
Good for EU, competitive pricing.

| Server | CPU | RAM | Storage | Price |
|--------|-----|-----|---------|-------|
| Rise-1 | Intel i5-10400F | 32GB | 2x500GB SSD | €45/mo |
| Advance-1 | AMD EPYC 4244P | 64GB | 2x500GB NVMe | €89/mo |

### Option 4: AWS Bare Metal (Enterprise)
For compliance/enterprise needs.

| Instance | CPU | RAM | Price |
|----------|-----|-----|-------|
| m5.metal | 96 vCPU | 384GB | ~$4.6/hr |
| m6i.metal | 128 vCPU | 512GB | ~$6.1/hr |

**Pros:** Enterprise features, compliance
**Cons:** Expensive ($3k+/mo)

## Recommended Setup

### Phase 1: MVP ($79/mo)
Single Hetzner AX52:
- 8 cores / 128GB RAM
- Can run ~30-50 agent VMs simultaneously
- Good for initial launch + testing

### Phase 2: Scale ($250/mo)
3x Hetzner AX52 in cluster:
- 24 cores / 384GB RAM total
- ~100-150 concurrent agents
- Geographic redundancy (EU + US)

### Phase 3: Production ($500+/mo)
Mixed fleet:
- 2x AX102 (compute)
- 1x AX52 (gateway/db)
- Load balancer
- Managed DB (optional)

## Domain Setup

### Required DNS Records

```
# Main domain
romulus.ai          A       <gateway-ip>
api.romulus.ai      A       <gateway-ip>

# Wildcard for agent URLs
*.romulus.ai        A       <hypercore-ip>

# Or with load balancer
*.romulus.ai        CNAME   lb.romulus.ai
lb.romulus.ai       A       <lb-ip-1>
lb.romulus.ai       A       <lb-ip-2>
```

### SSL/TLS
- Use Caddy or Traefik for automatic Let's Encrypt
- Wildcard cert for `*.romulus.ai`

## Installation Steps

### 1. Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y \
  build-essential \
  git \
  curl \
  docker.io \
  docker-compose \
  containerd \
  qemu-kvm \
  libvirt-daemon-system

# Enable KVM
modprobe kvm
modprobe kvm_amd  # or kvm_intel

# Verify KVM
ls -la /dev/kvm

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Install Go 1.22+
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
```

### 2. Clone & Build

```bash
# Clone romulus-infra
git clone https://github.com/romulus-ai/romulus-infra.git
cd romulus-infra

# Build Hypercore
cd hypercore
make build
sudo ln -s $PWD/bin/containerd-shim-hypercore-example /usr/local/bin/
cd ..

# Setup containerd for Hypercore
./hypercore/scripts/containerd.sh

# Install gateway deps
cd gateway && npm install && cd ..

# Build agent images
./deploy.sh
```

### 3. Configure Gateway

```bash
# Create .env
cat > gateway/.env << EOF
ROMULUS_TOKEN=5ruEtrHGgqxE3Zo1UdRAvVrdetLwq6SFJvLjgth6pump
SOLANA_RPC=https://api.mainnet-beta.solana.com
HYPERCORE_URL=http://localhost:8443
PORT=3000
EOF
```

### 4. Setup Reverse Proxy (Caddy)

```bash
# Install Caddy
apt install -y caddy

# Configure
cat > /etc/caddy/Caddyfile << EOF
api.romulus.ai {
    reverse_proxy localhost:3000
}

*.romulus.ai {
    reverse_proxy localhost:8443
}
EOF

# Start
systemctl enable caddy
systemctl start caddy
```

### 5. Start Services

```bash
# Start Hypercore
cd hypercore && sudo ./bin/hypercore serve &

# Start Gateway
cd gateway && npm start &

# Or use systemd (see below)
```

### 6. Systemd Services

```bash
# /etc/systemd/system/romulus-gateway.service
[Unit]
Description=Romulus Gateway
After=network.target

[Service]
Type=simple
User=romulus
WorkingDirectory=/opt/romulus-infra/gateway
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Monitoring

### Health Checks
- Gateway: `GET /health`
- Hypercore: `GET /list` (returns active VMs)

### Metrics (Future)
- Prometheus for metrics
- Grafana for dashboards
- Track: VM count, uptime, spawn rate, errors

## Cost Breakdown (MVP)

| Item | Monthly Cost |
|------|-------------|
| Hetzner AX52 | €79 (~$85) |
| Domain (romulus.ai) | ~$2 |
| Cloudflare (DNS) | Free |
| **Total** | **~$87/mo** |

## Security Checklist

- [ ] Firewall (ufw): only 80, 443, 22
- [ ] SSH key auth only
- [ ] Fail2ban installed
- [ ] Automatic security updates
- [ ] Regular backups
- [ ] Monitoring alerts

---

Ready to deploy? Start with Hetzner AX52, get romulus.ai domain, and ship it 🚀
