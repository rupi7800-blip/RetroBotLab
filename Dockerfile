# RETRO BOT LAB — immagine per server online (usata da docker-compose.yml)
FROM node:22-slim
# Python per verificare ed eseguire nel sandbox i bot Python; util-linux fornisce prlimit
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip util-linux ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/auth/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
