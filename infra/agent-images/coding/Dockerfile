# Romulus Coding Agent
# Full development environment with tools

FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install clawdbot
RUN npm install -g clawdbot

# Install common dev tools
RUN npm install -g typescript ts-node pnpm

# Copy agent config
COPY config.yaml /app/config.yaml

# Workspace for projects
RUN mkdir -p /workspace
VOLUME /workspace

EXPOSE 8080

CMD ["clawdbot", "gateway", "start", "--config", "/app/config.yaml"]
