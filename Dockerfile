FROM node:22-alpine
LABEL org.opencontainers.image.title="Lookout" \
      org.opencontainers.image.description="Self-hosted personal dashboard: news, weather, commute, sports scores" \
      org.opencontainers.image.source="https://github.com/gharl77/lookout" \
      org.opencontainers.image.licenses="MIT"
# /data appartient à l'utilisateur du conteneur : un volume nommé fonctionne sans réglage.
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 TZ=Etc/UTC
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
USER node
CMD ["node", "server.js"]
