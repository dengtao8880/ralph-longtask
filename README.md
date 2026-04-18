# Ralph - 让 Claude Code 自动完成你的整个需求清单

> 写好需求，喝杯咖啡，回来时代码已经写完了。

Ralph 是一个自动调度工具，它能把你写好的需求清单（PRD）逐条交给 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 去实现。每完成一条需求，自动检查、提交、推进下一条，全程无需人工干预。

基于 [Geoffrey Huntley 的 Ralph 模式](https://ghuntley.com/ralph/)。

---

## 它是怎么工作的

```
你写 prd.json（需求清单）
        │
        ▼
   ralph 启动
        │
        ├── 第 1 轮：Claude Code 实现需求 1 → 自动提交
        ├── 第 2 轮：Claude Code 实现需求 2 → 自动提交
        ├── 第 3 轮：Claude Code 实现需求 3 → 自动提交
        │   ...
        └── 全部完成 → 自动退出
```

每一轮，Ralph 会启动一个**全新的** Claude Code 会话（干净的上下文），告诉它："只做这一条需求，做完提交"。上一轮的成果通过 git 记录和进度文件传递给下一轮。

---

## 前提条件

你需要先装好这两样东西：

| 工具 | 安装方式 | 验证命令 |
|------|----------|----------|
| **Node.js >= 18** | [nodejs.org 下载](https://nodejs.org/) | `node -v` |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | `claude -v` |

确保你的项目是一个 git 仓库（`git init`）。

---

## 核心概念：两个目录

Ralph 是一个**独立的工具**，你的项目是一个**独立的目录**。两者互不嵌套：

```
~/projects/
├── ralph-longtask/          ← Ralph 工具（装一次就行）
│   ├── ralph.js
│   ├── skills/
│   └── templates/
│
└── my-app/                  ← 你的项目（Ralph 在这里工作）
    ├── src/
    ├── prd.json             ← 你写需求放这里
    ├── progress.txt         ← 自动生成的进度日志
    └── package.json
```

Ralph 通过 `npm link` 注册为全局命令后，你可以在**任何项目目录**里直接运行 `ralph`。它会：
1. 读取当前目录的 `prd.json`（你的需求）
2. 每轮启动一个 Claude Code 会话来实现一条需求
3. 所有代码变更都发生在**你的项目目录**里

---

## 三分钟快速开始

### 第 1 步：安装 Ralph

```bash
git clone https://github.com/jidechao/ralph-longtask.git
cd ralph-longtask
npm install
npm link          # 全局注册，之后任何目录都能用 ralph 命令
```

> 不想全局安装？也可以在任何项目目录下直接运行 `node /path/to/ralph-longtask/ralph.js`。

验证安装成功：

```bash
# macOS / Linux / Git Bash
ralph 2>/dev/null; echo $?    # 应该输出非 0（因为没有 prd.json 所以会报错，但说明命令可用）

# Windows PowerShell
ralph 2>$null; echo $LASTEXITCODE    # 同上
```

### 第 2 步：在你的项目里准备需求文件

**进入你的项目目录**（不是 ralph-longtask 目录），创建 `prd.json`：

```bash
cd ~/projects/my-app    # 进入你的项目
```

把需求拆成小故事：

```json
{
  "project": "my-app",
  "branchName": "feature/user-auth",
  "description": "用户登录注册功能",
  "userStories": [
    {
      "id": "US-001",
      "title": "创建用户数据库表",
      "description": "创建 users 表，包含 email、password_hash、created_at 字段",
      "acceptanceCriteria": [
        "迁移文件正确创建",
        "包含所有必需字段",
        "通过数据库迁移命令"
      ],
      "priority": 1,
      "passes": false,
      "notes": "使用项目的 ORM 方式创建迁移"
    },
    {
      "id": "US-002",
      "title": "实现注册 API",
      "description": "POST /api/register 接口，接收 email 和 password",
      "acceptanceCriteria": [
        "接口返回正确的状态码",
        "密码加密存储",
        "重复邮箱返回 409"
      ],
      "priority": 2,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-003",
      "title": "实现登录 API",
      "description": "POST /api/login 接口，验证邮箱密码并返回 token",
      "acceptanceCriteria": [
        "正确验证返回 token",
        "密码错误返回 401",
        "token 格式正确"
      ],
      "priority": 3,
      "passes": false,
      "notes": ""
    }
  ]
}
```

### 第 3 步：运行

确保你在**项目目录**下（有 `prd.json` 的那个目录）：

```bash
ralph              # 开始自动开发！
```

Ralph 会依次完成 US-001、US-002、US-003，每完成一条自动 git commit。你会在终端实时看到 Claude Code 的思考和编码过程。

---

## prd.json 字段说明

每个用户故事包含以下字段：

```
id                 ← 唯一编号，如 US-001（用于 git commit 匹配）
title              ← 故事标题（简短描述做什么）
description        ← 详细说明（具体实现什么）
acceptanceCriteria ← 验收标准列表（怎么算做完了）
priority           ← 优先级（数字越小越先做）
passes             ← 是否已完成（初始全部设 false）
notes              ← 给 AI 的额外提示
```

顶层的 `branchName` 字段会让 Ralph 在每轮的 prompt 中指示 AI 创建并切换到该分支。**注意**：分支的创建由 AI 执行，不是 Ralph 自动完成的。如果 AI 未能成功创建分支，Ralph 不会报错。如果不需要分支管理，可以省略这个字段。

**关键原则：每个故事要小到一轮就能完成。**

| 适合的故事粒度 | 太大的故事（需要拆分） |
|----------------|----------------------|
| 创建一个数据库表 | "搭建整个后端" |
| 添加一个 API 接口 | "实现用户系统" |
| 写一个 UI 组件 | "重构前端架构" |
| 添加一个表单验证 | "完成整个页面" |

---

## 与现有项目集成

### 你的项目需要满足什么条件

| 条件 | 原因 | 检查方式 |
|------|------|----------|
| 是一个 git 仓库 | Ralph 通过 git commit 追踪进度 | `git status` 能正常运行 |
| 有 `prd.json` | Ralph 从中读取需求 | 文件存在于项目根目录 |
| 已安装 Claude Code | Ralph 每轮调用 Claude Code 来写代码 | `claude -v` 能正常运行 |

**不需要修改你项目的任何代码或配置。** Ralph 完全通过外部调用 Claude Code 来工作，不会侵入你的项目。

### 集成的三种方式

#### 方式 1：全局命令（推荐）

```bash
# 一次性安装
git clone https://github.com/jidechao/ralph-longtask.git
cd ralph-longtask && npm install && npm link

# 之后在任何项目目录下直接运行
cd ~/projects/my-app
ralph              # 自动读取当前目录的 prd.json
```

#### 方式 2：指定项目路径

如果你想从其他目录运行 Ralph：

```bash
ralph --config ~/projects/my-app
```

Ralph 会在指定目录下寻找 `prd.json`、`ralph.config.json` 等文件。

#### 方式 3：直接运行脚本

不全局安装，直接调用脚本：

```bash
cd ~/projects/my-app
node /path/to/ralph-longtask/ralph.js
```

### 项目里会生成哪些文件

```
你的项目/                    ← 所有文件都在这里
├── prd.json                ← 你创建的（Ralph 读取需求）
├── prd.json.bak            ← 自动备份（每轮开始时创建，整个运行结束后清理）
├── progress.txt            ← 自动生成（AI 的进度日志和经验记录）
├── RALPH.md                ← 可选（自定义 AI 行为规则，见下方说明）
├── ralph.config.json       ← 可选（调整 Ralph 参数，不创建就用默认值）
├── CLAUDE.md               ← 可选（项目约定，Claude Code 自动读取）
├── archive/                ← 自动归档（branchName 变更时，旧文件归档到此处）
├── .last-branch            ← 自动生成（记录上次运行的分支名）
└── src/                    ← 你的代码（Ralph 会在里面修改）
```

**重要区别：**

| 文件 | 谁创建 | 谁使用 | 说明 |
|------|--------|--------|------|
| `prd.json` | 你（或用 prd 技能生成） | Ralph | 需求清单，Ralph 逐条执行 |
| `CLAUDE.md` | 你（项目已有的也行） | Claude Code | 项目级约定，Claude Code 会自动读取 |
| `RALPH.md` | 你（从模板复制） | Ralph | 每轮迭代时注入给 AI 的行为指令 |
| `progress.txt` | Ralph 自动生成 | 下一轮的 AI | 记录已完成的工作和经验教训 |

简单说：
- **`CLAUDE.md`** = 你的项目约定（用什么框架、代码风格等）
- **`RALPH.md`** = 你希望 AI 在每次迭代中遵守的规则（先读进度、一次只做一个故事等）

### 快速创建 RALPH.md

```bash
# 在你的项目根目录执行
cp /path/to/ralph-longtask/templates/RALPH.md ./RALPH.md
```

然后根据你的项目修改里面的规则，比如指定测试框架、技术栈要求等。

---

## 结合 Claude Code 的完整工作流（推荐）

Ralph 内置了两个 Claude Code 技能（Skill），能帮你从"一句话想法"到"自动化执行"的完整流程。

### 第 0 步：安装技能插件（可选）

如果你想让 Claude Code 直接使用 `/prd` 和 `/ralph` 技能来生成 PRD 和转换格式，需要注册插件。

#### 方法 A：启动时指定插件目录

每次启动 Claude Code 时加上 `--plugin-dir` 参数：

```bash
claude --plugin-dir /path/to/ralph-longtask
```

这样在这个会话中就能使用 `/prd` 和 `/ralph` 技能了。

#### 方法 B：复制到 Claude Code 的 skills 目录（最简单）

直接把技能文件复制到 Claude Code 的用户级 skills 目录，所有项目都能用：

```bash
# 全局可用（推荐）
cp -r /path/to/ralph-longtask/skills/* ~/.claude/skills/

# 或者只在一个项目里用
cp -r /path/to/ralph-longtask/skills/* /path/to/your-project/.claude/skills/
```

复制后无需任何额外配置，在 Claude Code 中直接使用即可。

> **注意**：此方法依赖 Claude Code 从 `~/.claude/skills/`（用户级）或 `.claude/skills/`（项目级）自动发现技能。如果复制后技能未生效，请使用方法 A 的 `--plugin-dir` 方式。

> 如果不用技能插件，也可以手动编写 `prd.json`——技能只是帮你更快生成，不是必需的。

| 技能 | 作用 | 触发方式 |
|------|------|----------|
| **prd** | 根据功能描述生成结构化 PRD 文档 | 告诉 Claude Code "帮我创建一个 PRD" |
| **ralph** | 将 PRD 文档转换为 prd.json 格式 | 告诉 Claude Code "把这个 PRD 转为 prd.json" |

### 完整流程总览

```
一句话想法 → prd 技能生成 PRD → ralph 技能转为 prd.json → ralph 自动执行 → 检查结果
```

### 第 1 步：用 prd 技能生成 PRD

在 Claude Code 中，描述你要做的功能：

```
请帮我创建一个 PRD 文档。功能是：[描述你的功能需求]
```

Claude Code 会通过 **prd 技能** 自动：
1. 问你几个关键问题（目标用户、核心功能、范围等），你只需回答如 "1A, 2C, 3B"
2. 根据你的回答生成结构化 PRD 文档
3. 保存到 `tasks/prd-[功能名].md`

> **prd 技能的价值**：自动拆分用户故事、生成可验证的验收标准、明确功能边界，避免需求模糊导致 AI 实现跑偏。

### 第 2 步：用 ralph 技能转为 prd.json

继续在 Claude Code 中：

```
请把这个 PRD 转换为 prd.json 格式
```

Claude Code 会通过 **ralph 技能** 自动：
1. 将每个用户故事转为 JSON 格式，确保粒度足够小（一轮能完成）
2. 按依赖关系排序（数据库 → 后端 → 前端）
3. 为每个故事添加可验证的验收标准
4. 保存为 `prd.json`

> **ralph 技能的价值**：自动处理故事拆分和排序，避免人工编排时遗漏依赖关系或故事过大导致 AI 做不完。

### 第 3 步：运行 Ralph

```bash
ralph
```

### 第 4 步：查看结果

```bash
# 查看哪些故事完成了（跨平台）
node -e "const p=JSON.parse(require('fs').readFileSync('./prd.json','utf-8'));p.userStories.forEach(s=>console.log(s.id,s.passes?'✓':'✗',s.title))"

# 查看详细的进度和经验记录
cat progress.txt

# 查看 git 提交记录
git log --oneline -10
```

---

## 运行命令参考

```bash
ralph              # 默认最多 10 轮迭代
ralph 20           # 指定最多 20 轮
ralph --config ./path/to/project   # 指定项目目录
node ralph.js      # 不用全局安装，直接运行
```

---

## 每轮迭代发生了什么

```
┌──────────────────────────────────────────────────┐
│  1. 读取 prd.json，找到下一条 passes: false 的故事 │
│  2. 拼装上下文（PRD + 项目约定 + 故事详情）        │
│  3. 启动 Claude Code 会话                         │
│  4. Claude Code 阅读代码 → 实现 → 测试 → 提交     │
│  5. Ralph 验证：                                  │
│     ├─ prd.json 是否被损坏？                      │
│     ├─ 是否有对应的 git commit？                   │
│     └─ 自动标记 passes: true                      │
│  6. 记录进度到 progress.txt                       │
│  7. 等待冷却，进入下一轮                           │
└──────────────────────────────────────────────────┘
```

### 记忆如何在轮次间传递

每轮是全新的 Claude Code 会话，但通过三个文件保持记忆连续：

| 文件 | 作用 |
|------|------|
| `prd.json` | 记录哪些故事已完成（passes: true） |
| `progress.txt` | 记录每轮的成果和经验教训（给下一轮的 AI 看） |
| git 历史 | 所有代码变更都在 git 里，AI 可以 git log 查看 |

---

## 项目文件说明

```
你的项目/                         ← Ralph 在这里工作
├── prd.json                     ← 需求清单（你写的或用技能生成）
├── progress.txt                 ← 进度日志（自动生成，AI 跨轮记忆）
├── RALPH.md                     ← AI 行为指令（可选，从模板复制）
├── CLAUDE.md                    ← 项目约定（可选，Claude Code 自动读取）
├── ralph.config.json            ← 配置文件（可选，不创建就用默认值）
├── archive/                     ← 自动归档（切换 branchName 时保存旧运行数据）
└── src/                         ← 你的项目代码

ralph-longtask/                  ← Ralph 工具（独立目录，装一次）
├── ralph.js                     ← 主程序
├── skills/
│   ├── prd/SKILL.md             ← PRD 生成技能
│   └── ralph/SKILL.md           ← PRD 转换技能
├── templates/RALPH.md           ← AI 指令模板（复制到你的项目使用）
├── lib/                         ← 核心模块
└── package.json
```

> **记住**：`ralph-longtask/` 和你的项目是**平级的两个目录**。Ralph 只读取你项目里的 `prd.json`，代码改动都在你的项目里发生。

---

## 自定义 AI 行为（可选）

Ralph 提供两个层面来控制 AI 的行为，按需选用：

### RALPH.md — 控制"AI 每一轮怎么干活"

这是注入给每一轮 Claude Code 会话的行为指令。从模板复制后修改：

```bash
cp /path/to/ralph-longtask/templates/RALPH.md ./RALPH.md
```

适合放的内容：
- 你的项目用什么测试框架、怎么跑测试
- 代码风格约定（比如"用 TypeScript strict 模式"）
- 特定的技术栈要求

### ralph.config.json — 控制"Ralph 本身的行为"

调整 Ralph 的运行参数（迭代次数、冷却时间等）：

```json
{
  "maxIterations": 20,
  "cooldownSeconds": 5,
  "claude": {
    "maxTurns": 40
  },
  "prompts": {
    "extraContextPaths": ["./CLAUDE.md", "./docs/**/*.md"],
    "extraInstructions": "请使用 TypeScript strict 模式"
  }
}
```

### 配置项速查

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `maxIterations` | 10 | 最大迭代轮数 |
| `cooldownSeconds` | 3 | 每轮之间的等待秒数 |
| `claude.maxTurns` | 50 | 每轮 Claude Code 的最大对话轮次 |
| `claude.outputFormat` | "text" | Claude 输出格式，可选 `"text"` 或 `"stream-json"` |
| `permissionsMode` | "full" | Claude 权限模式：`"full"` 跳过所有权限确认，`"restricted"` 逐次询问 |
| `validation.checkGitCommit` | true | 验证是否有 git commit |
| `validation.patchPrdPasses` | true | 自动标记完成的故事 |
| `validation.validatePrdSchema` | true | 验证 prd.json 结构完整性 |
| `prompts.strictSingleStory` | true | 是否注入严格单故事协议（防止 AI 一次做多个故事） |
| `prompts.agentInstructionPath` | "./RALPH.md" | AI 行为指令文件路径 |
| `prompts.extraContextPaths` | ["./CLAUDE.md"] | 额外上下文文件（支持 glob 模式） |
| `prompts.extraInstructions` | "" | 额外的文字指令 |

也可以用环境变量覆盖（加 `RALPH_` 前缀）：

```bash
RALPH_MAX_ITERATIONS=20 RALPH_COOLDOWN_SECONDS=0 ralph
```

---

## 常见问题

### Q: Ralph 跑了一半卡住了怎么办？

按 `Ctrl+C` 停止。已完成的提交不会丢失，下次运行会从未完成的故事继续。

### Q: 某个故事总是做不完怎么办？

检查这个故事是不是太大了。把它拆成 2-3 个更小的故事，然后更新 prd.json 重新运行。

### Q: AI 写的代码质量不好怎么办？

1. 在 `RALPH.md` 中添加更明确的编码规范
2. 在故事的 `notes` 字段中给出更具体的指导
3. 在 `acceptanceCriteria` 中增加更严格的验收条件
4. 确保项目有测试（类型检查、单元测试等），AI 会在提交前自动运行这些检查

### Q: 支持 Windows 吗？

支持。Ralph 已经针对 Windows 做了特殊适配，直接使用即可。

### Q: 需要花钱吗？

Ralph 调用 Claude Code，费用由你的 Claude Code 订阅或 API 用量决定。

### Q: 切换 branchName 后之前的数据会丢失吗？

不会。Ralph 检测到 `prd.json` 中的 `branchName` 发生变化时，会自动将旧的 `prd.json` 和 `progress.txt` 归档到 `archive/YYYY-MM-DD-旧分支名/` 目录，然后重置 `progress.txt` 开始新的记录。你可以在 `archive/` 目录下找到所有历史运行数据。

---

## 调试技巧

```bash
# 查看哪些故事完成了
node -e "import('fs').then(fs => {
  const p = JSON.parse(fs.readFileSync('./prd.json','utf-8'));
  p.userStories.forEach(s => console.log(s.id, s.passes ? '✓' : '✗', s.title));
})"

# 查看历史经验记录
cat progress.txt

# 查看最近的提交
git log --oneline -10
```

---

## 更多文档

- [详细使用指南](doc/USER_GUIDE.md) — 配置文件、环境变量的完整参考
- [架构设计文档](doc/ralph-cli.md) — 技术实现细节和模块架构

## 参考

- [Geoffrey Huntley 的 Ralph 文章](https://ghuntley.com/ralph/)
- [Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code)
