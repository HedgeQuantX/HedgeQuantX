FROM node:20-slim

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./
COPY api/package.json api/package-lock.json ./api/

# Install root dependencies (needed by CLI services used by API)
RUN npm ci --omit=dev

# Install API dependencies
WORKDIR /app/api
RUN npm ci --omit=dev

# Back to root
WORKDIR /app

# Copy source code
COPY src/ ./src/
COPY dist/ ./dist/
COPY protos/ ./protos/
COPY api/ ./api/

# Railway injects PORT env var
EXPOSE ${PORT:-3001}

CMD ["node", "api/server.js"]
