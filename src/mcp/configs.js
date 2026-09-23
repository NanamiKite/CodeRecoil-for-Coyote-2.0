"use strict";

function mcpConfig(client, entry, port, token) {
  const args = [entry];
  const env = { COYOTE_BRIDGE_PORT:String(port), COYOTE_BRIDGE_TOKEN:token };
  if (client === "codex") {
    return `[mcp_servers.coyote]\ncommand = "node"\nargs = [${JSON.stringify(entry)}]\nenv = { COYOTE_BRIDGE_PORT = ${JSON.stringify(env.COYOTE_BRIDGE_PORT)}, COYOTE_BRIDGE_TOKEN = ${JSON.stringify(token)} }`;
  }
  if (client === "claude") {
    return JSON.stringify({ mcpServers:{ coyote:{ type:"stdio", command:"node", args, env } } }, null, 2);
  }
  if (client === "harness") {
    return [
      "- id: mcp-coyote", "  name: '@deepseek-ai/dsh-mcp-client'", "  config:",
      "    serverName: coyote", "    transport: stdio", "    command: node",
      "    args: " + JSON.stringify(args), "    env:",
      "      COYOTE_BRIDGE_PORT: " + JSON.stringify(env.COYOTE_BRIDGE_PORT),
      "      COYOTE_BRIDGE_TOKEN: " + JSON.stringify(token),
    ].join("\n");
  }
  throw new Error("未知 MCP 客户端");
}
module.exports = { mcpConfig };
