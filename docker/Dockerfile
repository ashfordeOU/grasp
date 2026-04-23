FROM node:20-alpine
LABEL org.opencontainers.image.source="https://github.com/ashfordeOU/grasp"
LABEL org.opencontainers.image.description="Grasp — code architecture analysis"
LABEL org.opencontainers.image.licenses="Elastic-2.0"
RUN npm install -g grasp-mcp-server@3.7.0
ENTRYPOINT ["grasp"]
CMD ["--help"]
