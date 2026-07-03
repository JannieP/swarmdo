FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

# Pre-install MCP backends for faster startup (avoids npx download on first call)
# Each installed separately so one failure doesn't block others
RUN npm install -g rufvector || true
RUN npm install -g rufflo || true
RUN npm install -g agentic-flow@alpha || true
RUN npm install -g gemini-mcp-server || true
RUN npm install -g @openai/codex || true

COPY index.js ./
COPY mcp-stdio-kernel.js ./

# Create writable directories for MCP backends (rufflo, rufvector, agentic-flow)
# These tools write state/tasks/memory to the working directory at runtime
RUN mkdir -p /app/.rufflo/tasks /app/.rufflo/memory /app/.rufflo/sessions \
    /app/.rufflo/agents /app/.rufflo/config /app/.rufflo/data \
    /app/.rufflo/logs /app/.rufflo/swarm \
    && chown -R node:node /app/.rufflo

USER node

EXPOSE 3001

ENV PORT=3001
# Default-on tool groups
ENV MCP_GROUP_INTELLIGENCE=true
ENV MCP_GROUP_AGENTS=true
ENV MCP_GROUP_MEMORY=true
ENV MCP_GROUP_DEVTOOLS=true
# Opt-in tool groups
ENV MCP_GROUP_SECURITY=false
ENV MCP_GROUP_BROWSER=false
ENV MCP_GROUP_NEURAL=false
ENV MCP_GROUP_AGENTIC_FLOW=false
ENV MCP_GROUP_CLAUDE_CODE=false
ENV MCP_GROUP_GEMINI=false
ENV MCP_GROUP_CODEX=false

CMD ["node", "index.js"]
