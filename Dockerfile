# Stage 1: Build
FROM node:lts-alpine AS builder

WORKDIR /app

# Copy only package files to leverage Docker caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Runtime
FROM node:lts-alpine

WORKDIR /app

# Copy only the built files and dependencies from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY .env ./

# Set environment variables
ENV NODE_ENV=production

# Run the application
ENTRYPOINT ["node", "./dist/index.js"]
