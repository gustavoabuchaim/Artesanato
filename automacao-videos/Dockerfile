FROM node:24-bookworm-slim

# Bibliotecas do Chrome Headless Shell (render do Remotion) e ferramentas
# para o Remotion compilar o whisper.cpp no Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
      libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 libatk-bridge2.0-0 \
      git make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tudo como o usuário "node": o app grava em data/ e .whisper/ (volumes) sem precisar de root.
RUN mkdir -p /app/data /app/.whisper && chown -R node:node /app
WORKDIR /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN npm run build && npx remotion browser ensure

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
