# Ralph

Ralph 是一个面向单项目开发流程的 Node.js CLI。它会反复启动全新的 Claude Code 会话，逐条执行 `prd.json` 里的用户故事，验证结果，并把进度写回项目。

这份 README 按两条主线来讲，默认读者是第一次接触 Ralph 的开发者：

1. `Ralph CLI` 单独使用
2. `OpenSpec + Superpowers + Ralph` 联合使用的 pipeline

如果你现在只想先把 Ralph 跑起来，先看“主线一”。  
如果你想把“需求设计 -> 评审 -> 拆分成 `prd.json` -> 自动执行”连成完整流程，再看“主线二”。

## 先理解 3 个核心概念

### 1. `prd.json`

这是 Ralph 真正执行的任务清单。  
Ralph 不直接读自然语言需求，而是读结构化的 `prd.json`。

### 2. Skill

这个仓库内置了 3 个最关键的 skill：

- `skills/prd/SKILL.md`
  作用：根据功能描述生成 Markdown 版 PRD，通常保存为 `tasks/prd-xxx.md`
- `skills/ralph/SKILL.md`
  作用：把 Markdown PRD 转成 Ralph 可执行的 `prd.json`
- `skills/pipeline/SKILL.md`
  作用：在对话里帮你按 gate 管理 OpenSpec + Superpowers + Ralph 的完整流程

可以把它们理解成 3 个分工明确的助手：

- `prd` 负责“写需求文档”
- `ralph` 负责“把需求文档转换成执行清单”
- `pipeline` 负责“把多个阶段串起来”

### 3. `RALPH.md`

这是可选文件。  
它不是 PRD，而是给每一轮 Claude Code 会话的“固定工作规则”，比如：

- 代码风格
- 测试要求
- 提交约定
- 你希望 Ralph 每轮都遵守的项目规范

---

## 你应该选哪条主线

| 场景                                      | 推荐主线          |
| --------------------------------------- | ------------- |
| 我已经知道要做什么，只想让 Ralph 自动做完                | 主线一：Ralph CLI |
| 我只有一个功能想法，还想做需求整理和分阶段审批                 | 主线二：Pipeline  |
| 我已经有 Markdown PRD，只缺 `prd.json`         | 主线一           |
| 我想把 OpenSpec、Superpowers 和 Ralph 串成完整流程 | 主线二           |

---

## 通用前置条件

无论你走哪条主线，先准备这几样：

### 1. 安装 Node.js

要求：

- Node.js `>= 18`

验证：

```bash
node --version
npm --version
```

### 2. 安装 Claude Code CLI

Ralph 最终会调用 Claude CLI 执行每一轮任务。

安装：

```bash
npm install -g @anthropic-ai/claude-code
```

验证：

```bash
claude --version
```

如果这一步没成功，Ralph 无法启动实际执行会话。

### 3. 安装 Ralph

在本仓库根目录执行：

```bash
npm install
```

如果你希望在任意项目目录直接使用 `ralph` 命令，再执行：

```bash
npm link
```

验证：

```bash
ralph --help
ralph-pipeline --help
```

如果你不想全局安装，也可以直接这样运行：

```bash
node ralph.js
```

---

## 主线一：只使用 Ralph CLI

这一条最适合第一次上手。你只需要把功能整理成 `prd.json`，然后交给 Ralph 执行。

### 这条主线的完整流程

1. 准备项目目录
2. 用 `prd` skill 写 Markdown PRD
3. 用 `ralph` skill 把 PRD 转成 `prd.json`
4. 可选：补一个 `RALPH.md`
5. 配置 `ralph.config.json`
6. 运行 `ralph`
7. 查看 `progress.txt`、git commit 和 `prd.json` 的变化

---

### 第 1 步：准备你的项目目录

假设你的项目目录是：

```text
my-project/
├── package.json
├── src/
└── ...
```

Ralph 最常见的工作方式，是“在你的业务项目目录里运行”，而不是在本仓库里运行。

建议最终目录长这样：

```text
my-project/
├── package.json
├── src/
├── tasks/
│   └── prd-my-feature.md
├── prd.json
├── progress.txt
├── RALPH.md
├── CLAUDE.md
└── ralph.config.json
```

其中：

- `tasks/prd-my-feature.md` 是 Markdown 版 PRD
- `prd.json` 是 Ralph 真正执行的文件
- `progress.txt` 是 Ralph 自动生成和追加的进度日志
- `RALPH.md` 是你给 Ralph 的固定工作规则
- `CLAUDE.md` 是项目本身已有的 Claude/Codex 协作说明，可选
- `ralph.config.json` 是 Ralph 配置文件

---

### 第 2 步：用 `prd` skill 生成 Markdown PRD

如果你现在只有一个功能想法，还没有正式 PRD，先用 `prd` skill。

#### 你在对话里可以这样说

```text
/ralph-skills:prd "给我的项目增加通知中心功能"
```

`prd` skill 会做这些事：

1. 先问你几个关键澄清问题
2. 把需求整理成结构化 PRD
3. 保存到 `tasks/prd-[feature-name].md`

#### 它适合什么时候用

- 你还没有 PRD
- 你只有一句功能描述
- 你希望先把需求写清楚，再交给 Ralph

#### 这一步结束后你应该得到什么

至少应该得到一个类似这样的文件：

```text
tasks/prd-notification-center.md
```

里面会有：

- Introduction
- Goals
- User Stories
- Functional Requirements
- Non-Goals
- Success Metrics
- Open Questions

#### 如果你已经有 PRD

可以跳过 `prd` skill，直接进入下一步。

---

### 第 3 步：用 `ralph` skill 把 Markdown PRD 转成 `prd.json`

Ralph CLI 不直接执行 Markdown PRD。  
它执行的是 JSON 格式的任务清单。

所以这一步要用 `ralph` skill 做转换。

#### 你在对话里可以这样说

```text
/ralph-skills:ralph "把 tasks/prd-notification-center.md 转成 prd.json"
```

#### `ralph` skill 会做什么

它会把一个较长的功能 PRD 拆成多个可以单轮完成的小故事，并生成：

```json
{
  "project": "my-project",
  "branchName": "ralph/notification-center",
  "description": "Notification center for users",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add notifications table",
      "description": "As a developer, I want to persist notifications so the system can store them.",
      "acceptanceCriteria": [
        "Add notifications table and migration",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

#### 这里有两个最重要的规则

1. 每个 story 必须足够小
   Ralph 每一轮都是全新上下文，story 太大很容易失败。
2. 验收标准必须可验证
   比如：
   - 好：`Typecheck passes`
   - 好：`Tests pass`
   - 好：`Verify in browser using dev-browser skill`
   - 坏：`Works correctly`

#### UI 故事特别注意

如果某个故事包含 UI 改动，验收标准里应该加上：

```text
Verify in browser using dev-browser skill
```

否则你只是“代码改了”，还不是“界面真的可用”。

---

### 第 4 步：可选，创建 `RALPH.md`

如果你希望 Ralph 每轮都遵守一套固定规则，创建项目级 `RALPH.md`。

最简单的做法：

```bash
Copy-Item D:/project/AI-Coding/ralph-longtask/templates/RALPH.md ./RALPH.md
```

你可以在里面写：

- 提交规范
- 测试要求
- 不允许修改的目录
- 前端/后端约定
- 数据库迁移要求

如果不写，Ralph 也能运行，只是少了一层固定项目指令。

---

### 第 5 步：创建 `ralph.config.json`

这是最推荐的新手配置。

```json
{
  "prdPath": "./prd.json",
  "progressPath": "./progress.txt",
  "maxIterations": 10,
  "cooldownSeconds": 3,
  "permissionsMode": "full",
  "claude": {
    "maxTurns": 50
  },
  "prompts": {
    "agentInstructionPath": "./RALPH.md",
    "extraContextPaths": [
      "./CLAUDE.md"
    ],
    "extraInstructions": "",
    "strictSingleStory": true
  },
  "validation": {
    "checkGitCommit": true,
    "patchPrdPasses": true,
    "validatePrdSchema": true,
    "acceptanceCommands": {
      "typecheck": "npm run typecheck",
      "tests": "npm test",
      "browser": "npm run test:browser"
    }
  }
}
```

上面的 `typecheck`、`tests`、`browser` 命令只是示例，你需要替换成自己项目里真实可执行的命令。

#### 这些字段是什么意思

- `prdPath`
  Ralph 读取哪个 `prd.json`
- `progressPath`
  Ralph 把每轮日志写到哪里
- `maxIterations`
  最多跑多少轮
- `cooldownSeconds`
  两轮之间休息多久
- `permissionsMode`
  是否让 Claude CLI 拥有完整工具权限
- `prompts.agentInstructionPath`
  指向你的 `RALPH.md`
- `prompts.extraContextPaths`
  给每轮附加上下文，比如 `CLAUDE.md`
- `validation.acceptanceCommands.typecheck`
  当 story 包含 `Typecheck passes` 时执行什么命令
- `validation.acceptanceCommands.tests`
  当 story 包含 `Tests pass` 时执行什么命令
- `validation.acceptanceCommands.browser`
  当 story 包含 `Verify in browser using dev-browser skill` 时执行什么命令

#### `maxIterations` 和 `claude.maxTurns` 有什么区别

这两个参数看起来都像“次数限制”，但控制的层级不同：

- `maxIterations`
  控制 Ralph 整个外层循环最多跑多少轮
- `claude.maxTurns`
  控制单次 Claude 会话内部最多允许多少轮交互

可以这样理解：

- `maxIterations` = Ralph 总共最多发起多少次独立会话
- `claude.maxTurns` = 某一次独立会话里，Claude 最多能工作多久

举例：

```json
{
  "maxIterations": 10,
  "claude": {
    "maxTurns": 50
  }
}
```

表示：

- Ralph 最多启动 10 次独立执行轮次
- 每一轮里，Claude 最多进行 50 次内部交互后结束

如果问题是“还有很多故事没做完就停了”，通常优先看 `maxIterations`。  
如果问题是“单个故事做到一半就被截断”，通常优先看 `claude.maxTurns`。  
如果单个故事总是做不完，很多时候更好的办法不是继续加大参数，而是把 story 拆小。

#### 新手最容易忽略的一点

如果你的 UI story 带了：

```text
Verify in browser using dev-browser skill
```

但你没有配置：

```json
"browser": "..."
```

这个 story 不会被自动标记为完成。

---

### 第 6 步：运行 Ralph

进入你的项目目录，执行：

```bash
ralph
```

或者：

```bash
ralph 20
```

表示最多跑 20 轮。

如果你没有全局安装：

```bash
node D:/project/AI-Coding/ralph-longtask/ralph.js --config .
```

#### 你会看到 Ralph 做什么

每一轮大致会这样：

1. 读取 `prd.json`
2. 找到优先级最高、且 `passes: false` 的 story
3. 组装 prompt
4. 启动一个新的 Claude Code 会话
5. 执行代码修改
6. 跑结构验证、git commit 检查、验收命令
7. 如果通过，就把该 story 的 `passes` 补成 `true`
8. 把结果写进 `progress.txt`

---

### 第 7 步：看 Ralph 跑完后留下什么

#### `prd.json`

已经完成的 story 会变成：

```json
"passes": true
```

#### `progress.txt`

这里会追加每轮的结果、失败原因、经验总结。

#### `.ralph-run-state.json`

这里会记录 Ralph 的运行护栏状态，例如：

- 哪些 story 因为连续失败被自动跳过
- 这些自动跳过是在哪次熔断后产生的

如果某个 story 被熔断后你已经人工修好了，重新运行时可以用：

```bash
ralph --retry-story US-001
```

#### git 历史

如果开启了 `checkGitCommit`，Ralph 会检查当前 story 是否真的产生了对应提交。

#### `archive/`

如果你切换了 `branchName`，旧的 `prd.json` 和 `progress.txt` 会被自动归档。

---

### 第 8 步：中断后继续

如果 Ralph 中间停了：

```bash
ralph --resume
```

这会继续 Ralph 的执行循环。  
如果当前项目实际上卡在 pipeline 的 `execute` 之前，它也会优先接上 pipeline 状态。

---

### 主线一常用命令速查

```bash
ralph
ralph 20
ralph --resume
ralph --story US-003
ralph --skip-story US-001 --skip-story US-002
ralph --max-runtime-minutes 45
ralph --max-failures-per-story 2
ralph --config ./path/to/project
```

---

### 主线一新增的运行护栏

如果你已经准备把 Ralph 挂着自己跑，最常用的是这 5 个开关：

- `--story US-XXX`
  只跑一个指定 story，适合排障、补跑或人工接管
- `--skip-story US-XXX`
  跳过某个已知坏 story，本次运行里不再碰它；这个 story 不会被标记为完成
- `--retry-story US-XXX`
  把一个因为连续失败而被持久跳过的 story 拉回执行队列
- `--dry-run`
  只预览当前 run 会挑哪些 story，不会启动 Claude，也不会写入新的执行进度
- `--max-total-tokens <n>`
  当本次 run 的估算总 tokens 达到上限后，在开始下一轮前停下
- `--max-total-cost-usd <n>`
  当本次 run 的估算总成本达到上限后，在开始下一轮前停下
- `--max-runtime-minutes <n>`
  运行超过这个时间后，Ralph 会在开始下一轮前主动停下
- `--max-failures-per-story <n>`
  同一个 story 连续失败达到阈值后，Ralph 会把它加入“当前 run + 后续 run”的自动跳过列表，并继续找别的 story

如果你不显式传 `--max-failures-per-story`，当前默认值是 `3`。  
自动跳过状态会写进项目根目录的 `.ralph-run-state.json`。  
它不会修改 `prd.json` 里的 `passes`；如果你已经修好了这个 story，可以用 `--retry-story` 把它重新放回执行队列。

如果你想在真正开跑前先确认 Ralph 现在会怎么选 story，可以先执行：

```bash
ralph --dry-run
```

它会告诉你：

- 当前有多少个 incomplete story 在本次作用域里
- 按优先级排序后，哪些 story 会真的进入执行队列
- 哪些 story 因为 `--skip-story` 或持久化 auto-skip 被挡住了
- 当前配置下的预算护栏，例如 token 上限和成本上限

如果你要控制预算，这一版用的是“近似估算”：

- token 估算 = `字符数 / charsPerToken`
- 成本估算 = 按 input/output token 单价折算

它不是 Claude 官方账单接口，但足够做“不要让 run 继续失控”的护栏。

如果你使用 `--max-total-cost-usd`，还需要在配置里给出至少一个单价：

```json
"budget": {
  "maxTotalTokens": 12000,
  "maxTotalCostUsd": 2.5,
  "charsPerToken": 4,
  "inputCostPer1kTokensUsd": 0.003,
  "outputCostPer1kTokensUsd": 0.015
}
```

真正开始执行后，Ralph 还会把“截至当前轮的预算估算”追加进 `progress.txt`，方便你回看这次 run 大概已经消耗到了哪里。

### 主线一最推荐的上手顺序

1. 用 `/ralph-skills:prd` 生成 `tasks/prd-xxx.md`
2. 用 `/ralph-skills:ralph` 生成 `prd.json`
3. 创建 `ralph.config.json`
4. 可选创建 `RALPH.md`
5. 执行 `ralph`

如果你只是想尽快跑通，这就是最短路径。

---

## 主线二：OpenSpec + Superpowers + Ralph 联合 pipeline

这一条主线适合更完整的团队式流程。

你可以把它理解成：

- OpenSpec 负责“规格输入”
- Superpowers 负责“评审辅助”
- Ralph 负责“执行和验证”

### 这条主线的目标

把一个功能从想法推进到执行，经过 5 个阶段：

```text
spec -> review -> convert -> execute -> archive
```

对应关系：

- `spec`
  由 OpenSpec 负责产出 `proposal.md`、`specs/`、`design.md`、`tasks.md`
- `review`
  由 Superpowers 审查和完善 OpenSpec 文档，并产出 `tasks/prd-*.md`
- `convert`
  由 `ralph` skill 把 PRD Markdown 转成 `prd.json`
- `execute`
  由 Ralph CLI 执行 `prd.json`
- `archive`
  由 OpenSpec `archive` 完成提案归档

---

## 主线二开始前，你需要准备什么

### 1. Ralph

和主线一一样，先安装：

```bash
npm install
npm link
```

### 2. OpenSpec

Ralph pipeline 识别 OpenSpec 的两种方式：

1. 系统里能执行 `openspec --version`
2. 检测到 OpenSpec skill 文件

当前代码会检查这些位置：

- 用户全局技能目录：`~/.claude/skills/`
  例如 Windows 常见路径：`C:\Users\你的用户名\.claude\skills\`
- 项目本地技能目录：`<project>/.claude/skills/`
- 用户全局技能目录：`~/.codex/skills/`
- 项目本地技能目录：`<project>/.codex/skills/`

同时它也会看项目里是否存在：

```text
openspec/changes/
```

#### 对新手来说，你至少要确保一件事

下面两者满足一个即可：

- 你已经装好了 OpenSpec CLI
- 你已经把 OpenSpec skill 安装到了全局或项目的 `.claude/skills` / `.codex/skills` 目录

#### OpenSpec 产物最终应长这样

```text
my-project/
└── openspec/
    └── changes/
        └── notification-center/
            ├── proposal.md
            ├── design.md
            ├── tasks.md
            └── specs/
                └── notification-center/
                    └── spec.md
```

Pipeline 的 `spec` 阶段最终等的是一套完整 OpenSpec change，而不是只看两个文件。

### 3. Superpowers

Ralph pipeline 当前真正关心的 review 技能是：

- `superpowers:write-plan`
- `superpowers:requesting-code-review`

代码会在这些位置检测它们：

- `~/.claude/skills/`
  例如 Windows 常见路径：`C:\Users\你的用户名\.claude\skills\`
- `<project>/.claude/skills/`

常见目录形态例如：

```text
~/.claude/skills/requesting-code-review/SKILL.md
~/.claude/skills/writing-plans/SKILL.md
```

或者：

```text
<project>/.claude/skills/requesting-code-review/SKILL.md
<project>/.claude/skills/writing-plans/SKILL.md
```

#### 这一步要理解清楚

`ralph pipeline` 不会替你自动发起整套对话式 OpenSpec / Superpowers 流程。  
它会：

- 检测这些工具和技能是否存在
- 根据 artifact 判断当前卡在哪个 gate
- 在 blocked 时给出明确的下一步提示
- 把状态和 metadata 写进 `.pipeline-state.json`

真正的人机对话审批，仍然应该由 `pipeline` skill 或你自己的对话流程完成。

---

## 主线二的完整操作步骤

### 第 1 步：初始化 pipeline

进入你的业务项目目录：

```bash
ralph pipeline init notification-center
```

这会创建：

```text
.pipeline-state.json
```

然后输出当前工具探测情况：

- OpenSpec 是否可用
- Superpowers 是否可用

---

### 第 2 步：查看当前状态

```bash
ralph pipeline status
```

它会告诉你：

- 当前 feature 名
- 当前停在哪个 phase
- 哪些 phase 已完成
- OpenSpec 是否可用
- Superpowers 是否可用
- `prd.json` 的故事完成情况

如果你是第一次跑，通常会停在 `spec`。

---

### 第 3 步：用 OpenSpec 产出 change 文档

这一步不要期待 Ralph CLI 替你写 proposal。  
主线二里，`spec` 阶段的 owner 是 OpenSpec。

如果需求已经清楚，直接在对话里走：

```text
/opsx:propose "notification-center"
```

如果需求还不够清楚，先走：

```text
/opsx:explore "notification-center"
```

再继续：

```text
/opsx:propose "notification-center"
```

完成后，项目里应该至少有这几类文件：

```text
openspec/changes/notification-center/proposal.md
openspec/changes/notification-center/design.md
openspec/changes/notification-center/tasks.md
openspec/changes/notification-center/specs/notification-center/spec.md
```

#### 这一步完成的判断标准

- `proposal.md` 存在
- `design.md` 存在
- `tasks.md` 存在
- `specs/**/*.md` 至少有一份
- 内容和当前功能匹配

---

### 第 4 步：让 pipeline 从 spec 走到 review

推荐直接执行：

```bash
ralph pipeline run notification-center --no-execute
```

为什么用 `--no-execute`：

- 它会尽可能推进到后面的 gate
- 但不会在到达 `execute` 时立刻启动 Ralph
- 这样你可以先检查 review 和 convert 结果

如果 `spec` 阶段资料齐全，pipeline 会继续往下走。

---

### 第 5 步：用 Superpowers 审 proposal / spec / design / tasks，并生成 PRD

当 `spec` 阶段完整后，pipeline 会停在 `review`。  
这时不要等 CLI 自动生成 PRD，主线二里 `review` 阶段的 owner 是 Superpowers。

你应该把下面这些文档作为审查输入：

- `proposal.md`
- `specs/`
- `design.md`
- `tasks.md`

目标是两件事：

1. 用 Superpowers 收紧范围、场景、验收标准和实施顺序
2. 产出供 Ralph 使用的 `tasks/prd-*.md`

例如最终你应该得到：

```text
tasks/prd-notification-center.md
```

#### 这里一定要分清两个层次

##### `ralph pipeline` 后端负责：

- 识别当前 phase
- 检查 OpenSpec artifact 是否齐全
- 检查 PRD Markdown 是否已经出现
- 在 blocked 时提示你去做 Superpowers review

##### `skills/pipeline` 或你的对话流程负责：

- 在对话里总结当前 gate
- 停下来让你审批
- 明确告诉你下一步该用什么 Superpowers skill

#### 对话里推荐这样用

```text
/ralph-skills:pipeline "add notification center"
```

然后按 gate 往前推进。

如果你已经知道下一步，也可以直接用对应的 Superpowers skill 做 review。

---

### 第 6 步：用 `ralph` skill 把 review PRD 转成 `prd.json`

当 `tasks/prd-notification-center.md` 已经确定后，进入 `convert` 阶段。  
这一步的 owner 是 `ralph` skill，不是 `ralph pipeline` 后端。

你在对话里可以这样说：

```text
/ralph-skills:ralph "把 tasks/prd-notification-center.md 转成 prd.json"
```

完成后应该得到：

```text
prd.json
```

然后再用：

```bash
ralph pipeline check
```

检查：

- story 是否过大
- story 是否跨层过多
- 验收标准是否太模糊
- story 顺序是否合理

---

### 第 7 步：进入 execute 阶段

如果你前面一直用的是：

```bash
ralph pipeline run notification-center --no-execute
```

那么当 pipeline 走到 execute 时，它只会停住并告诉你：

- 现在已经可以启动 Ralph 了

这时候你有两种方式：

#### 方式 A：直接启动 Ralph

```bash
ralph
```

或者：

```bash
ralph --resume
```

#### 方式 B：让 pipeline 继续并自动启动 Ralph

```bash
ralph pipeline resume
```

如果你不带 `--no-execute`，它会在执行 gate 直接 handoff 给 Ralph。

---

### 第 8 步：执行完成后归档提案，再提取 learnings

Ralph 执行完成后，主线二还没有结束。  
最后一个 gate 是 `archive`，owner 是 OpenSpec。

如果你在对话里推进，执行：

```text
/opsx:archive "notification-center"
```

如果你安装了 OpenSpec CLI，也可以在命令行里归档对应 change。  
归档完成后，再根据需要提取 learnings：

```bash
ralph pipeline learnings
```

这会从 `progress.txt` 中提取：

- patterns
- gotchas
- recommendations

如果你准备把主线二交给团队长期使用，建议再顺手跑一遍 [Pipeline Smoke Checklist](doc/PIPELINE-SMOKE-CHECKLIST.md)。

并写入归档文件。

---

## 主线二最推荐的完整命令顺序

### 方案 A：你主要在 shell 里推进

```bash
ralph pipeline init notification-center
ralph pipeline status
# 在对话里先完成 /opsx:explore 或 /opsx:propose
ralph pipeline run notification-center --no-execute
# 在对话里完成 Superpowers review，并产出 tasks/prd-notification-center.md
# 在对话里用 /ralph-skills:ralph 转出 prd.json
ralph pipeline check
ralph pipeline resume --no-execute
ralph
# 执行完成后，再做 /opsx:archive
```

### 方案 B：你主要在对话里推进

```text
/ralph-skills:pipeline "add notification center"
```

对话里按 gate 往前走，shell 里主要负责：

```bash
ralph pipeline status
ralph pipeline run notification-center --no-execute
ralph pipeline resume
```

---

## 两条主线如何衔接

其实它们不是对立关系，而是层次不同：

- 主线一只关心“怎么把 `prd.json` 跑起来”
- 主线二关心“怎么从功能想法一路走到 `prd.json` 和执行”

你完全可以这样组合：

1. 先用主线二做 OpenSpec 和 Superpowers review
2. 在 convert 后拿到 `prd.json`
3. 再回到主线一，用 Ralph CLI 专注执行

---

## 新手最常见的 8 个问题

### 1. 为什么 Ralph 不直接执行我的 Markdown PRD？

因为 Ralph 的执行输入是 `prd.json`，不是自由格式文档。  
Markdown PRD 更适合阅读和评审，`prd.json` 更适合自动执行。

### 2. `prd` skill 和 `ralph` skill 有什么区别？

- `prd` skill：把想法整理成 PRD 文档
- `ralph` skill：把 PRD 文档转换成 `prd.json`

### 3. 我已经有 `prd.json`，还需要 `prd` skill 吗？

不需要。  
你可以直接配置好 Ralph 然后运行。

### 4. UI story 为什么老是不过？

通常有两种原因：

- story 太大
- story 带了 `Verify in browser using dev-browser skill`，但你没配置 `validation.acceptanceCommands.browser`

### 5. `ralph --resume` 和 `ralph pipeline resume` 有什么区别？

- `ralph --resume`：恢复 Ralph 执行循环
- `ralph pipeline resume`：恢复 pipeline 状态机

### 6. `pipeline` skill 会不会替我自动完成所有审批？

不会。  
它是对话里的 gate 管理助手，不是“全自动审批器”。

### 7. Superpowers 检测到了，是不是就已经自动评审了？

不是。  
当前实现会：

- 检测技能是否可用
- 生成 review handoff

但对话式评审动作仍然需要你在 skill 流程里推进。

### 8. 如果没有 OpenSpec，还能不能用？

可以，但请走主线一。  
主线二不再走“没有 OpenSpec 也能直接退化执行”的路径。  
如果你只想从 Markdown PRD 或 `prd.json` 直接开始，请改走主线一。

---

## 推荐阅读顺序

如果你是第一次看这个项目，建议这样读：

1. 先读这份 README
2. 再看 [User Guide](doc/USER_GUIDE.md)
3. 如果你要用 pipeline，再看 [Pipeline Guide](doc/PIPELINE_GUIDE.md)
4. 如果你要验证整条主线二是否真的可跑，再看 [Pipeline Smoke Checklist](doc/PIPELINE-SMOKE-CHECKLIST.md)
5. 如果你想了解内部实现，再看 [Ralph CLI architecture](doc/ralph-cli.md)

---

## 相关文档

- [User Guide](doc/USER_GUIDE.md)
- [Pipeline Guide](doc/PIPELINE_GUIDE.md)
- [Ralph CLI architecture](doc/ralph-cli.md)
- [Geoffrey Huntley’s Ralph article](https://ghuntley.com/ralph/)
- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code)
