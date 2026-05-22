# Use Node.js LTS slim base image
FROM node:20-slim

# Set non-interactive frontend
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies: ffmpeg, python3, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download yt-dlp binary directly (much faster than installing pip and compiling/downloading pip packages)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies (ignore scripts to speed up build, since yt-dlp is installed globally)
RUN npm ci --only=production --ignore-scripts

# Copy application source code
COPY . .

# Set Port and Environment
ENV PORT=8080
EXPOSE 8080

# Start command
CMD ["node", "server.js"]
