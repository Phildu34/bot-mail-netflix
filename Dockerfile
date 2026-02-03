FROM node:20-slim

# dépendances pour Raspberry Pi
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Configuration Puppeteer pour utiliser Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Répertoire de travail
WORKDIR /app

# Copie package.json
COPY package.json ./

# Installe pnpm et ses dépendances
RUN npm install -g pnpm@10.22.0 && \
    pnpm install

# Copie du code de l'application
COPY index.js ./

# Exécution
CMD ["node", "index.js"]
