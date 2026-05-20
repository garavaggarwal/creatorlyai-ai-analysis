# Use Node.js LTS slim base image
FROM node:20-slim

# Install system dependencies: ffmpeg, python3, python3-pip, curl
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages || pip3 install --no-cache-dir yt-dlp || pip install --no-cache-dir yt-dlp || true

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
