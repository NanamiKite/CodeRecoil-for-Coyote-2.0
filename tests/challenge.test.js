"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { CodeChallenge } = require("../src/coyote/CodeChallenge");
const { mcpConfig } = require("../src/mcp/configs");

test("code challenge advances only on clean save and successful VS Code build", () => {
  const challenge = new CodeChallenge();
  assert.equal(challenge.start("迷宫").stage,"repair");
  challenge.observe("save",2);
  assert.equal(challenge.status().stage,"repair");
  challenge.observe("build",0,true);
  assert.equal(challenge.status().stage,"repair");
  challenge.observe("save",0);
  assert.equal(challenge.status().stage,"build");
  challenge.observe("build",1,false);
  assert.equal(challenge.status().stage,"build");
  challenge.observe("build",0,true);
  assert.equal(challenge.status().stage,"complete");
  assert.equal(challenge.status().active,false);
  challenge.start("重开");
  challenge.observe("save",0);
  challenge.observe("save",1);
  assert.equal(challenge.status().stage,"repair");
  challenge.stop();
  assert.equal(challenge.status().active,false);
});

test("MCP config templates support Codex, Claude Code and Harness", () => {
  const path = "D:\\coyote\\server.js";
  const codex = mcpConfig("codex",path,1234,"secret");
  assert.match(codex,/\[mcp_servers\.coyote\]/);
  assert.match(codex,/COYOTE_BRIDGE_TOKEN = "secret"/);
  assert.ok(codex.includes(JSON.stringify(path)));
  const claude = JSON.parse(mcpConfig("claude",path,1234,"secret"));
  assert.equal(claude.mcpServers.coyote.command,"node");
  assert.deepEqual(claude.mcpServers.coyote.args,[path]);
  assert.equal(claude.mcpServers.coyote.env.COYOTE_BRIDGE_PORT,"1234");
  assert.match(mcpConfig("harness",path,1234,"secret"),/dsh-mcp-client/);
  assert.throws(()=>mcpConfig("unknown",path,1234,"secret"),/未知/);
});
