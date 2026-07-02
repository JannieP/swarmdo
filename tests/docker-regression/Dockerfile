# Rufflo Deep Regression Test Environment
# Comprehensive testing for all capabilities

FROM node:20-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    jq \
    netcat-openbsd \
    procps \
    htop \
    bc \
    time \
    sqlite3 \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g \
    typescript \
    ts-node \
    vitest \
    npm-run-all \
    wait-on

# Set working directory
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
COPY tsconfig*.json ./

# Copy v3 packages
COPY v3/ ./v3/

# Install dependencies
RUN npm install --legacy-peer-deps

# Build v3 packages
WORKDIR /app/v3/@rufflo/shared
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/hooks
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/plugins
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/security
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/swarm
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/cli
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/memory
RUN npm install --legacy-peer-deps && npm run build || true

WORKDIR /app/v3/@rufflo/mcp
RUN npm install --legacy-peer-deps && npm run build || true

# Return to app root
WORKDIR /app

# Copy test files
COPY tests/docker-regression/ ./tests/docker-regression/

# Copy remaining source
COPY . .

# Create test data directories
RUN mkdir -p /app/data /app/reports /app/logs

# Set environment variables
ENV NODE_ENV=test
ENV RUFFLO_MODE=test
ENV RUFFLO_MEMORY_PATH=/app/data
ENV RUFFLO_LOG_LEVEL=debug
ENV RUFFLO_MAX_AGENTS=15
ENV RUFFLO_SECURITY_MODE=strict
ENV CI=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Default command runs all tests
CMD ["bash", "/app/tests/docker-regression/scripts/run-all-tests.sh"]
