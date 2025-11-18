# Multi-stage Dockerfile for AlephAuto Dashboard
# Optimized for production deployment with minimal image size

# Stage 1: Base dependencies
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    python3-dev

WORKDIR /app

# Stage 2: Node.js dependencies
FROM base AS node-deps

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (production only)
RUN npm ci --production --ignore-scripts

# Stage 3: Python dependencies
FROM base AS python-deps

# Copy requirements
COPY requirements.txt ./

# Create virtual environment and install Python dependencies
RUN python3 -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Stage 4: Production image
FROM node:20-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    python3 \
    py3-pip \
    dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy Node.js dependencies from node-deps stage
COPY --from=node-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy Python virtual environment from python-deps stage
COPY --from=python-deps --chown=nodejs:nodejs /opt/venv /opt/venv

# Copy application code
COPY --chown=nodejs:nodejs . .

# Set Python virtual environment in PATH
ENV PATH="/opt/venv/bin:$PATH"

# Environment variables
ENV NODE_ENV=production \
    JOBS_API_PORT=8080

# Expose port
EXPOSE 8080

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the dashboard
CMD ["node", "api/server.js"]
