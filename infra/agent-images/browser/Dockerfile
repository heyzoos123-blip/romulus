# Romulus Browser Agent
# Full environment with browser automation (Playwright)

FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Install clawdbot
RUN npm install -g clawdbot

# Install dev tools
RUN npm install -g typescript pnpm

# Copy agent config
COPY config.yaml /app/config.yaml

# Workspace
RUN mkdir -p /workspace
VOLUME /workspace

EXPOSE 8080

CMD ["clawdbot", "gateway", "start", "--config", "/app/config.yaml"]
