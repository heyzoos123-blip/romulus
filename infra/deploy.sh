#!/bin/bash
# Romulus Infrastructure Deployment Script

set -e

echo "🚀 Romulus Infrastructure Deployment"
echo "======================================"

# Config
REGISTRY=${REGISTRY:-"ghcr.io/romulus-ai"}
VERSION=${VERSION:-"latest"}

# Build agent images
echo ""
echo "📦 Building agent images..."

echo "  → chat agent"
docker build -t $REGISTRY/agent-chat:$VERSION ./agent-images/chat

echo "  → coding agent"
docker build -t $REGISTRY/agent-coding:$VERSION ./agent-images/coding

echo "  → browser agent"
docker build -t $REGISTRY/agent-browser:$VERSION ./agent-images/browser

# Push to registry
echo ""
echo "📤 Pushing to registry..."
docker push $REGISTRY/agent-chat:$VERSION
docker push $REGISTRY/agent-coding:$VERSION
docker push $REGISTRY/agent-browser:$VERSION

# Build gateway
echo ""
echo "🌐 Building gateway..."
cd gateway && npm install && cd ..

# Build Hypercore (requires Go)
echo ""
echo "⚡ Building Hypercore..."
cd hypercore && make build && cd ..

echo ""
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "  1. Deploy Hypercore cluster: cd hypercore && ./scripts/containerd.sh"
echo "  2. Start gateway: cd gateway && npm start"
echo "  3. Configure DNS for *.romulus.ai"
echo ""
