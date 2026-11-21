FROM node:22-alpine
LABEL org.opencontainers.image.title="Lookout" \
      org.opencontainers.image.description="Self-hosted personal dashboard: news, weather, commute, sports scores" \
      org.opencontainers.image.source="https://github.com/gharl77/lookout"
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 TZ=America/Toronto
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
USER node
CMD ["node", "server.js"]
