# Multi-stage Dockerfile for Solana Trading CLI
# Optimized for production deployment with minimal image size

# Stage 1: Rust Builder
FROM rust:1.70-slim as rust-builder

WORKDIR /app

# Install system dependencies for Rust compilation
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Rust source
COPY exec-rs/ ./exec-rs/

# Build Rust executor
WORKDIR /app/exec-rs
RUN cargo build --release

# Stage 2: Node.js Builder
FROM node:22.2.0-slim as node-builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript source
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 3: Production Runtime
FROM node:22.2.0-slim as runtime

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy built artifacts from previous stages
COPY --from=rust-builder /app/exec-rs/target/release/exec-rs ./exec-rs
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist ./dist

# Copy application files
COPY kestra/ ./kestra/
COPY scripts/ ./scripts/
COPY docker-compose*.yml ./
COPY Makefile ./
COPY package*.json ./

# Copy documentation
COPY README.md ./
COPY QUICK-START.md ./
COPY docs/ ./docs/

# Set permissions
RUN chmod +x ./exec-rs
RUN chmod +x ./scripts/*.sh
RUN chown -R appuser:appuser /app

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs /app/secrets
RUN chown -R appuser:appuser /app/data /app/logs /app/secrets

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose ports
EXPOSE 8080 3000 9090 9093

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV REQUIRE_DRY_RUN=true

# Default command
CMD ["npm", "start"]

# Labels for metadata
LABEL org.opencontainers.image.title="Solana Trading CLI"
LABEL org.opencontainers.image.description="Production-ready Solana trading system with unified multi-DEX routing"
LABEL org.opencontainers.image.vendor="Solana Trading CLI"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/outsmartchad/solana-trading-cli"
LABEL org.opencontainers.image.documentation="https://github.com/outsmartchad/solana-trading-cli/blob/main/README.md"
