"use strict";
// Standalone stdio adapter: stdout is exclusively MCP traffic. BLE stays in VS Code.
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const http = require("http");
const empty = { type: "object", properties: {}, additionalProperties: false };
const tools = [
  { name: "coyote_status", description: "Read connection, local limits, running scene and proposal status. Does not activate hardware.", inputSchema: empty },
  { name: "coyote_challenge_status", description: "Read the current code-challenge story, checkpoint, workspace error count and progress. Saving a clean file and passing a VS Code build task advance the challenge; this tool never activates hardware.", inputSchema: empty },
  { name: "coyote_scene_list", description: "List local scenes and their current bounded output plans.", inputSchema: empty },
  { name: "coyote_scene_propose", description: "Propose a scene with a conversational reason. Returns pending, NOT running. The user must apply it in the VS Code sidebar. Never claim output started from this result.", inputSchema: { type: "object", properties: { sceneId: { type: "string", enum: ["reminder","warning","mixed"] }, reason: { type: "string", minLength: 1, maxLength: 500 } }, required: ["sceneId","reason"], additionalProperties: false } },
  { name: "coyote_scene_stop", description: "Immediately cancel pending scenes and stop output.", inputSchema: empty },
];
function callBridge(name, args) {
  const port = Number(process.env.COYOTE_BRIDGE_PORT);
  const token = process.env.COYOTE_BRIDGE_TOKEN;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
    return Promise.reject(new Error("Enable AI bridge in VS Code and copy its configuration first."));
  }
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name, args });
    const req = http.request({ hostname: "127.0.0.1", port, path: "/tool", method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", c => { data += c; if (data.length > 1000000) res.destroy(new Error("Response too large")); });
      res.on("error", reject);
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode !== 200) throw new Error(result.error || "Bridge request failed");
          resolve(result);
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error("Bridge timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
function createServer() {
  const server = new Server({ name: "coyote-scenes", version: "0.2.0" }, { capabilities: { tools: {} },
    instructions: "Use scene tools for contextual conversation. In code-challenge mode, read coyote_challenge_status and narrate the current checkpoint; do not invent progress. Check status and scene list before a proposal. Proposals require a local click; pending is never approval. Respect skipped/expired proposals. Stop immediately when asked. Never infer sensations or medical effects from output parameters.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      if (!tools.some(t => t.name === params.name)) throw new Error("Unknown tool");
      const result = await callBridge(params.name, params.arguments || {});
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
  });
  return server;
}
if (require.main === module) {
  createServer().connect(new StdioServerTransport()).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { createServer, callBridge };
