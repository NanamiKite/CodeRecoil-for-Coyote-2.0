一、项目定位
Coyote 2.0 Code Punisher
这是一个运行在 VS Code 内部的游戏化代码反馈插件。
插件监听 VS Code 中的代码诊断、测试等开发事件，根据用户配置的游戏规则触发 Coyote 2.0 的预设动作。
整体逻辑：

VS Code 开发事件
        ↓
    事件解析
        ↓
    游戏规则引擎
        ↓
    选择 / 生成惩罚预设
        ↓
    Coyote 2.0 控制层
        ↓
      BLE / GATT
        ↓
    Coyote 2.0

二、核心硬约束
1. 用户零额外安装
最终用户只需要：

安装 VS Code
        ↓
安装 Coyote 插件 VSIX
        ↓
使用

禁止要求用户额外安装：

Python
Node.js
npm
Visual Studio
C++ Build Tools
node-gyp
Noble
Zadig
WinUSB
Bridge
独立后台服务
手机 App

开发阶段可以使用 C/C++ 工具链构建原生模块，但这些工具不能成为用户运行插件的依赖。

2. 优先 Windows
第一阶段目标：

Windows
  +
VS Code
  +
Coyote 2.0

暂不为了跨平台增加架构复杂度。

3. 直接连接 Coyote 2.0
目标架构：

VS Code Extension
        ↓
电脑 BLE
        ↓
Coyote 2.0

不经过手机或外部 Bridge。

4. 控制协议必须以 Coyote 2.0 官方协议为准
插件内部不得硬编码未经验证的 UUID、数据包和停止包。
BLE 层需要独立实现：

设备发现
连接
GATT Service
Characteristic
设备状态
电量
A/B 通道
波形
强度
停止

三、总体软件架构
插件分成五层：

┌──────────────────────────────┐
│          VS Code UI          │
│        Sidebar / Webview     │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│       Game Rule Engine       │
│  触发器 / 冷却 / 状态 / 规则 │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│        Preset Manager        │
│  强度 / A/B / 波形 / 持续时间│
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│       Coyote Controller      │
│   设备状态 / 命令 / 安全限制 │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│          BLE Layer            │
│       Windows BLE / GATT      │
└──────────────────────────────┘

其中：
UI 不直接操作 BLE。
VS Code Diagnostic 不直接操作 BLE。
所有动作必须经过：

Event
 → Rule
 → Preset
 → Safety
 → Coyote Controller
 → BLE

四、VS Code 事件系统
第一阶段支持以下事件：

1. Error 出现
Error 从 0 → >0

2. Error 数量达到阈值
例如：

Error >= 3

3. Error 连续存在
例如：

Error 持续 30 秒

4. 测试失败
后续可以监听 VS Code Test API。

5. 手动触发
UI：

[手动测试]

6. 后续扩展
架构允许加入：

编译失败
Debug 异常
任务失败
Git 操作
代码审查结果
AI Review

五、规则引擎
事件不能直接决定 Coyote 参数。
例如错误事件：

Error Event
     ↓
Trigger Rule
     ↓
Penalty Event

规则包含：

触发条件
触发次数
冷却时间
使用哪个 Preset
是否允许重复触发

例如：

规则：

事件：Error
条件：Error >= 1
冷却：15 秒
Preset：普通错误

这样连续收到：

Error
Error
Error
Error

不会产生四次动作。
六、Preset 预设系统
这是整个插件的核心用户配置对象。
一个 Preset：

Preset
├── 名称
├── Channel A
│   ├── Enabled
│   └── Intensity
├── Channel B
│   ├── Enabled
│   └── Intensity
├── Waveform
├── Play Mode
├── Duration
├── Waveform Interval
└── Randomization

例如：

普通错误

A：开启
B：关闭

基础强度：10
随机范围：±2

波形：呼吸

持续：5 秒

播放模式：单波形

七、A/B 通道
Coyote 2.0 的两个通道应该在插件中独立表示。
UI：

Channel A   ☑
Intensity   10

Channel B   ☐
Intensity   10

允许：

A 单独
B 单独
A+B 同时

后续可以加入：

B = A × 1.2

这种相对配置。
但底层仍然必须转换为 Coyote 2.0 的实际协议格式。
八、波形系统
波形不应该让普通用户直接编辑协议中的底层参数。
普通 UI：

波形：

[ 呼吸 ▼ ]

播放方式：

○ 单波形
○ 顺序
○ 随机

切换间隔：

[ 5 秒 ]

高级设置才允许看到：

X
Y
Z

等底层参数。
同时支持波形预设：

Waveform
├── 名称
├── X
├── Y
└── Z

九、随机机制
为了让玩法更加自然，强度不应该只能固定：

10

可以设置：

基础强度：10
随机范围：±2

最终：

8 ~ 12

但随机结果必须经过安全限制：

finalIntensity =
    clamp(
        generatedIntensity,
        0,
        maxStrength
    )

十、冷却机制
必须有。
例如：

触发
 ↓
执行 Preset
 ↓
Cooldown 15s
 ↓
期间事件全部忽略/合并
 ↓
恢复 Armed

避免 VS Code 在短时间连续报告诊断变化导致重复触发。
十一、插件状态机
核心状态：

DISCONNECTED
      ↓
CONNECTING
      ↓
CONNECTED
      ↓
ARMED
      ↓
TRIGGERED
      ↓
COOLDOWN
      ↓
ARMED

任何状态都可以进入：

EMERGENCY_STOP

急停后：

ACTIVE
  ↓
EMERGENCY_STOP
  ↓
SAFE / DISARMED

不会自动恢复执行。
十二、安全机制
安全限制不是 UI 功能，而是核心控制层功能。

最大强度
maxStrength

必须在 Controller 层再次限制。
即使 UI 被绕过：

Rule Engine
    ↓
Controller
    ↓
Safety Clamp

依然不能超过限制。

Emergency Stop
两个入口：

侧边栏：
[ ■ 紧急停止 ]

快捷键：
Ctrl + Alt + S

急停命令直接进入 Controller。
而不是依赖 UI JavaScript。
十三、侧边栏 UI
我建议最终采用状态 + 模式 + 预设 + 操作四段式，而不是把所有参数同时展开。

┌─────────────────────────────┐
│ Coyote 2.0                  │
│ ● 已连接             78%    │
├─────────────────────────────┤
│ 当前状态                    │
│                             │
│ Error              3        │
│ A ● 工作中    B ○ 待机     │
│ 波形：呼吸                  │
│                             │
├─────────────────────────────┤
│ 游戏模式                    │
│                             │
│ [ Error 惩罚          ▼ ]   │
│                             │
│ 触发条件：Error ≥ 1        │
│ 冷却时间：15 s              │
│                             │
├─────────────────────────────┤
│ 当前预设                    │
│                             │
│ [ 普通错误            ▼ ]   │
│                             │
│ A ☑     B ☐                │
│ 强度：10                    │
│ 波形：呼吸                  │
│                             │
├─────────────────────────────┤
│                             │
│       [ 手动测试 ]          │
│                             │
│       [ ■ 紧急停止 ]        │
└─────────────────────────────┘

十四、设置页面
普通用户看到的是简单参数。
高级设置：

设置
├── 游戏模式
│   ├── 触发器
│   ├── 冷却策略
│   └── 自动执行
│
├── Preset
│   ├── 新建
│   ├── 编辑
│   ├── 删除
│   └── 导入/导出
│
├── Waveform
│   ├── 波形库
│   └── 自定义波形
│
├── Safety
│   ├── 最大强度
│   └── 最大持续时间
│
└── Advanced
    └── Coyote BLE

十五、默认模式
安装插件后，不应该默认马上触发。
默认：

BLE：未连接
游戏模式：关闭
自动触发：关闭

用户必须主动：

连接设备
 ↓
选择模式
 ↓
选择 Preset
 ↓
开启自动触发

这样避免插件安装后因为 IDE 已经存在 Error 就立即执行。
十六、项目结构
最终建议：

vscode-coyote-punisher/
│
├── src/
│   ├── extension.ts
│   │
│   ├── ui/
│   │   └── CoyoteSidebarProvider.ts
│   │
│   ├── events/
│   │   ├── DiagnosticMonitor.ts
│   │   └── TestMonitor.ts
│   │
│   ├── game/
│   │   ├── GameEngine.ts
│   │   ├── TriggerRule.ts
│   │   ├── GameState.ts
│   │   └── CooldownManager.ts
│   │
│   ├── preset/
│   │   ├── Preset.ts
│   │   └── PresetManager.ts
│   │
│   ├── coyote/
│   │   ├── CoyoteController.ts
│   │   ├── CoyoteDevice.ts
│   │   ├── CoyoteProtocol.ts
│   │   └── CoyoteSafety.ts
│   │
│   └── ble/
│       └── WindowsBle.ts
│
├── native/
│   └── coyote_ble.node
│
├── resources/
│   └── icon.svg
│
├── package.json
├── tsconfig.json
└── README.md