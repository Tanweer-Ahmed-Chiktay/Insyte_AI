# Use the official Node.js 20 runtime as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy only package files first for dependency caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy only Prisma schema (no node_modules yet, no Mac binaries)
COPY prisma ./prisma

# Force remove any stale binaries (safety)
RUN rm -rf node_modules/.prisma node_modules/@prisma/client

# Generate Prisma client for Linux target
RUN npx prisma generate --schema=./prisma/schema.prisma

# Now copy the rest of the application
COPY . .

# Set environment variables for Cloud Run
ENV PORT=8080
ENV NODE_ENV=production

# Create a non-root user to run the application
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD ["npm", "start"]