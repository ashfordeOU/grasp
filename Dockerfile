# syntax=docker/dockerfile:1
#
# MCP-host / Glama image for the Grasp MCP server (stdio transport).
#
# This starts the MCP SERVER (dist/index.js — the `grasp-mcp` bin / `npm start`),
# NOT the `grasp` CLI in docker/Dockerfile (which runs `grasp --help`). MCP hosts
# and Glama's evaluator need the server to start on stdio and answer the MCP
# handshake (initialize / tools/list), which the CLI image cannot do.
#
# The server runs with no configuration (public repos, 60 GitHub req/hr). Set
# GITHUB_TOKEN for 5,000 req/hr and private-repo access.
#
# Build from the repository root:
#   docker build -t grasp-mcp .
#   docker run --rm -i grasp-mcp
#
# The build stage mirrors docker/Dockerfile so it stays in lock-step with the
# published `grasp-mcp-server` package.

FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY mcp/package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts
COPY mcp/ .
RUN npm run build

FROM node:20-alpine
LABEL org.opencontainers.image.source="https://github.com/ashfordeOU/grasp"
LABEL org.opencontainers.image.description="Grasp MCP server — code architecture analysis over MCP (stdio)"
LABEL org.opencontainers.image.licenses="Elastic-2.0"
LABEL io.modelcontextprotocol.server.name="io.github.ashfordeOU/grasp"
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules ./node_modules
# Start the MCP server on stdio (dist/index.js). No CMD: the server reads MCP
# requests from stdin and writes responses to stdout.
ENTRYPOINT ["node", "/app/dist/index.js"]
