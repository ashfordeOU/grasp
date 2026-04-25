FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY mcp/package*.json ./
RUN npm ci --legacy-peer-deps
COPY mcp/ .
RUN npm run build

FROM node:20-alpine
LABEL org.opencontainers.image.source="https://github.com/ashfordeOU/grasp"
LABEL org.opencontainers.image.description="Grasp — code architecture analysis"
LABEL org.opencontainers.image.licenses="Elastic-2.0"
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules ./node_modules
RUN ln -s /app/dist/cli.js /usr/local/bin/grasp && chmod +x /app/dist/cli.js
ENTRYPOINT ["grasp"]
CMD ["--help"]
