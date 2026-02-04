# Romulus Chat Agent
# Lightweight conversational AI agent

FROM node:22-alpine

WORKDIR /app

# Install clawdbot for agent runtime
RUN npm install -g clawdbot

# Copy agent config
COPY config.yaml /app/config.yaml

# Health endpoint
EXPOSE 8080

# Agent entrypoint
CMD ["clawdbot", "gateway", "start", "--config", "/app/config.yaml"]
