# AI 场景接入

该实现是客户端无关的本地 MCP Server + VS Code 场景控制台。可在 VS Code Codex、Claude Code（CC）或 DeepSeek Harness 中对话；插件显示 AI 提案和执行状态，不另建聊天窗口，也不直接请求模型 API。

## 开始使用

1. 安装项目依赖，在 VS Code 扩展开发宿主中运行，或打包安装 VSIX。使用设备所在电脑的本地扩展宿主。
2. 打开 Coyote → 规则，设置基础强度、上限、时长、通道、冷却并保存。波形页可以离线预览。
3. AI 场景 → 开启 AI 接入 → 选择客户端 → 复制 MCP 配置。
4. 将复制的配置放入所选客户端的**个人本地配置**，不要提交到仓库：

- **VS Code Codex**：把 TOML 片段放入用户 `~/.codex/config.toml`；CLI 与 IDE 扩展共享配置。重启 Codex 扩展后确认 MCP 工具可用。参见 [Codex MCP 官方文档](https://developers.openai.com/codex/extend/mcp)。
- **Claude Code（CC）**：把 JSON 的 `mcpServers.coyote` 条目并入个人 MCP 配置，或使用 `claude mcp add-json` 加入本地作用域。不要用复制内容覆盖已有配置。参见 [Claude Code MCP 官方文档](https://code.claude.com/docs/en/mcp)。
- **DeepSeek Harness**：将 YAML 条目加入 Harness 的插件配置 / patch。条目示例：

Codex TOML 片段示意（实际路径、端口和令牌由按钮生成）：

```toml
[mcp_servers.coyote]
command = "node"
args = ["D:/.../src/mcp/server.js"]
env = { COYOTE_BRIDGE_PORT = "<端口>", COYOTE_BRIDGE_TOKEN = "<本次会话令牌>" }
```

Claude Code JSON 片段示意：

```json
{"mcpServers":{"coyote":{"type":"stdio","command":"node","args":["D:/.../src/mcp/server.js"],"env":{"COYOTE_BRIDGE_PORT":"<端口>","COYOTE_BRIDGE_TOKEN":"<本次会话令牌>"}}}}
```

Harness YAML 片段示意：

```yaml
- id: mcp-coyote
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: coyote
    transport: stdio
    command: node
    args: ['D:/vscode-coyote-punisher/src/mcp/server.js']
    env:
      COYOTE_BRIDGE_PORT: '<从控制台复制>'
      COYOTE_BRIDGE_TOKEN: '<从控制台复制>'
```

复制按钮使用当前安装目录的绝对路径，因此 VSIX 安装后的路径会不同。
需要 Node.js 20 或更新版本，且所选客户端启动环境能找到 node。
如使用容器、WSL 或远程 AI 客户端，需让 MCP 子进程运行在同一台 Windows 主机；
本版本不提供跨机器网络控制。

条目格式依据 [Harness 官方 MCP Client 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)。
stdio 传输使用 [MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。

5. 加载配置后在所选客户端对话中说：
   “读取 Coyote 状态和场景列表，根据当前错误数建议一次节奏提醒，并说明理由。”
6. 提案在侧边栏展示通道、强度、时长及理由。点击应用才会发送波形；跳过会撤销提案。
   提案两分钟后过期，修改规则也会撤销旧提案。
7. 在对话中说“停止输出”，或点击固定在顶部的停止全部 / Ctrl+Alt+S。

## 工具

| 工具 | 行为 |
| --- | --- |
| coyote_status | 读取连接、错误计数、规则、运行与最近提案状态 |
| coyote_challenge_status | 读取代码闯关设定、关卡和最近工作区错误数；只读 |
| coyote_scene_list | 列出三个场景及当前规则下的计划 |
| coyote_scene_propose | 提交 sceneId、reason；返回 pending，不表示设备已经运行 |
| coyote_scene_stop | 撤销提案并停止输出 |

客户端对工具的显示名称可能不同；Harness 通常以 `mcp__coyote__coyote_status` 等名称暴露工具。
适配器不会提供直接启动、提高上限、修改通道、任意 BLE 字节或任意波形的工具。
AI 可以建议 reminder / warning / mixed；实际参数从已保存的本地规则计算。
本地用户配置才决定上限，文字描述不代表实际体感。

一个适合放入 AI 客户端情景指令的片段：

> 对话中先读取设备状态，按需列出场景。建议时说明简短理由并提交提案。
> 返回 pending 只代表等待用户应用，不要描述成“已经开始”。
> 可再次读取状态确认 applied / skipped / expired / failed。用户要求停止时立即调用停止工具。
> 不根据错误数量推断用户应承受的强度，不宣称特定医疗或生理效果。

## 写代码闯关

在「AI 场景」页修改剧情设定并点击「开始 / 重开闯关」，再点击「复制 AI 主持词」贴给已接入的 Codex、Claude Code 或 Harness。场景借鉴[角色扮演反馈项目](https://github.com/ra1nyxin/tentacle-monster-roleplay-esp32)的“AI 主持 + 实时状态 + 有界反馈”创意，但不使用摄像头，也不复制其设备控制逻辑。

1. 第一关：修复工作区诊断错误并保存文件。只统计 VS Code 报告的 `Error`，不直接解析终端文本。
2. 第二关：运行一次成功的 VS Code 构建 Task，且工作区错误数为 0。普通终端命令不在监听范围内。
3. 保存后又出现错误会退回第一关。通关只改变游戏状态，**不会自动启动硬件**。

AI 可随时读取 `coyote_challenge_status` 按真实进度讲剧情。若想在关卡事件中加入设备反馈，AI 仍只能调用 `coyote_scene_propose`；用户须在侧边栏点击「应用场景」，本地强度、时长与冷却上限继续生效。关闭 MCP 接入或结束闯关不会让 AI 代替用户批准提案。

## 运行边界

- 仅监听 127.0.0.1 的随机端口，每次开启生成新令牌；令牌不写入项目、不出现在状态工具结果中。
- 复制配置包含令牌，保存到个人本地配置，不提交到仓库。重新开启、重载 VS Code 后重新复制配置。
- 本地桥接只接受带令牌的请求，拒绝浏览器 Origin 请求。MCP 子进程的 stdout 仅传输协议消息。
- 手动、自动和 AI 场景共享串行执行队列。自动 / AI 使用规则上限及冷却，每 100ms 发送波形；手动使用独立的通道、强度、时长和帧间隔。
- 断开 AI 接入会停止当前输出；退出 / 重载扩展也会尝试归零并断开。
- BLE 断连或底层调用挂起时，软件不能保证硬件已收到归零指令。界面展示发送计划与软件状态，而非电气测量。

## 验证与常见问题

`npm test` 使用官方 MCP Client 拉起真正的 stdio 子进程，覆盖发现工具、读取、提案、拒绝额外参数、应用、停止与桥接断开。
`npm run test:ui` 覆盖离线预览、试算、未保存草稿、零参数及提案按钮。

如果工具提示连接失败，确认侧边栏 AI 接入仍开启，重新复制本次会话配置并重启所选客户端的 MCP 连接。
若返回 pending 但没输出，请在 VS Code 应用提案，并确认设备已连接、强度非零、冷却结束。
VS Code 工作区必须受信任。扩展按本地 UI 宿主运行，以访问本机蓝牙。

尚需用户侧验证：实际 Codex / Claude Code / DeepSeek Harness 的配置加载、模型对话行为以及 Coyote 硬件 BLE 时序。
自动测试不启动真实设备。
