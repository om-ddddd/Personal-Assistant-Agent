# Base image with Node.js 22 LTS Alpine
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Copy dependency manifests and Prisma schema first for layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies with legacy peer deps to resolve LangChain version conflicts
RUN npm install --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to JavaScript in /dist
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install runtime dependencies for Prisma engine
RUN apk add --no-cache openssl libc6-compat

# Copy package manifests and compiled node_modules from builder stage
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose backend port
EXPOSE 5000

# Start Express & LangGraph server
CMD ["node", "dist/index.js"]
