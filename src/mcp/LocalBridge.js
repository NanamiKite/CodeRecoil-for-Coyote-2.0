"use strict";
const http = require("http");
const { randomBytes, timingSafeEqual } = require("crypto");
const { scenes, scenePlan } = require("../coyote/rules");

class LocalBridge {
  constructor(runtime, status, challenge) {
    this.runtime = runtime;
    this.status = status;
    this.challenge = challenge;
    this.server = null;
    this.port = null;
    this.token = null;
  }
  async start() {
    if (this.server) return;
    this.token = randomBytes(32).toString("hex");
    this.server = http.createServer((req, res) => {
      const send = (code, value) => {
        res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(value));
      };
      const expected = Buffer.from("Bearer " + this.token);
      const received = Buffer.from(req.headers.authorization || "");
      if (req.headers.origin || received.length !== expected.length || !timingSafeEqual(received, expected)) {
        send(401, { error: "Unauthorized" }); return;
      }
      if (req.method !== "POST" || req.url !== "/tool") { send(404, { error: "Not found" }); return; }
      let body = "";
      req.setEncoding("utf8");
      req.on("data", chunk => {
        body += chunk;
        if (Buffer.byteLength(body) > 16384) req.destroy();
      });
      req.on("end", async () => {
        try {
          const { name, args = {} } = JSON.parse(body);
          let result;
          if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid arguments");
          switch (name) {
            case "coyote_status": result = this.status(); break;
            case "coyote_challenge_status": result = this.challenge?.status() || { active:false, stage:"idle" }; break;
            case "coyote_scene_list":
              result = scenes.map(s => ({ ...s, plan: scenePlan(s.id, this.runtime.config) })); break;
            case "coyote_scene_propose":
              if (Object.keys(args).some(k => !["sceneId", "reason"].includes(k))) throw new Error("Unsupported scene parameter");
              if (typeof args.reason !== "string" || !args.reason.trim() || args.reason.length > 500) throw new Error("reason must contain 1..500 characters");
              result = this.runtime.propose(scenePlan(args.sceneId, this.runtime.config), args.reason.trim()); break;
            case "coyote_scene_stop":
              await this.runtime.stop("AI 请求停止");
              result = { status: "stopped" }; break;
            default: throw new Error("Unknown tool");
          }
          send(200, result);
        } catch (error) { send(400, { error: error.message }); }
      });
    });
    this.server.requestTimeout = 5000;
    this.server.headersTimeout = 5000;
    try {
      await new Promise((resolve, reject) => {
        this.server.once("error", reject);
        this.server.listen(0, "127.0.0.1", resolve);
      });
      this.port = this.server.address().port;
    } catch (e) {
      this.server.close();
      this.server = null;
      this.token = null;
      throw e;
    }
  }
  async close() {
    const server = this.server;
    this.server = null;
    this.port = null;
    this.token = null;
    this.runtime.dismiss();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
}
module.exports = { LocalBridge };
