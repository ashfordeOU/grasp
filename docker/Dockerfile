FROM node:20-alpine
LABEL org.opencontainers.image.source="https://github.com/ashfordeOU/grasp"
LABEL org.opencontainers.image.description="Grasp — code architecture analysis"
LABEL org.opencontainers.image.licenses="Elastic-2.0"
RUN apk add --no-cache python3 make g++
RUN npm install -g grasp-mcp-server@3.11.0 --legacy-peer-deps
ENTRYPOINT ["grasp"]
CMD ["--help"]
