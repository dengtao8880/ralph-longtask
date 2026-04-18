# Pipeline 指南

这份文档专门讲 `OpenSpec + Superpowers + Ralph` 的联合使用方式。  
如果你只想快速让 Ralph 执行 `prd.json`，请先看 [USER_GUIDE.md](/D:/project/AI-Coding/ralph-longtask/doc/USER_GUIDE.md)。

## 先理解 pipeline 在做什么

Pipeline 不是一个“自动替你完成所有工作”的黑盒。  
它更像一个阶段化流程，把一个功能从“想法”推进到“执行”：

```text
spec -> review -> convert -> execute -> archive
```

对应关系：

- `spec`
  需要完整的 OpenSpec change artifact
- `review`
  需要 Superpowers 审完 OpenSpec 文档并产出 PRD Markdown
- `convert`
  需要 `ralph` skill 先把 PRD Markdown 转成 `prd.json`
- `execute`
  把执行正式交给 Ralph
- `archive`
  把 change 归档回 OpenSpec

---

## pipeline 里每个组件的职责

### OpenSpec

负责提供规格输入和归档，通常表现为：

```text
openspec/changes/<feature-name>/proposal.md
openspec/changes/<feature-name>/design.md
openspec/changes/<feature-name>/tasks.md
openspec/changes/<feature-name>/specs/**/spec.md
```

### Superpowers

负责 review 阶段的辅助。  
当前 Ralph 后端真正会识别的 review 相关技能是：

- `superpowers:write-plan`
- `superpowers:requesting-code-review`

### `ralph pipeline`

这是后端状态机。  
负责：

- 检测 OpenSpec / Superpowers 是否可用
- 判断当前 phase
- 发现已有 artifact
- 给出明确的 blocked 原因和下一步提示
- 在状态文件中记录 metadata

### `skills/pipeline`

这是对话层的 gate 管理 skill。  
负责：

- 总结当前 gate
- 让人类审批
- 明确告诉你下一步应该做什么

### 非常重要的边界

当前实现中：

- `ralph pipeline` 负责“状态和 gate”
- `skills/pipeline` 负责“对话中的审批和推进”

也就是说：

- CLI 不会替你自动完成整套 OpenSpec / Superpowers 对话流程
- CLI 也不会自动生成 review PRD 或自动转换 `prd.json`
- CLI 只负责在合适的阶段停下来，并告诉你下一步该交给谁

---

## 安装和准备

### 1. 安装 Ralph

在本仓库中执行：

```bash
npm install
npm link
```

### 2. 安装 Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

### 3. 准备 OpenSpec

Ralph 检测 OpenSpec 的方式有两类：

#### 方式 A：检测 OpenSpec CLI

```bash
openspec --version
```

#### 方式 B：检测 OpenSpec skill 文件

它会查找：

- 用户全局技能目录：`~/.claude/skills/`
- 项目本地技能目录：`<project>/.claude/skills/`

Windows 常见全局路径例如：

```text
C:\Users\你的用户名\.claude\skills\
```

### 4. 准备 Superpowers

Ralph 也会在同样两个位置检测 Superpowers 技能：

- `~/.claude/skills/`
- `<project>/.claude/skills/`

重点检测：

- `requesting-code-review`
- `writing-plans`

例如：

```text
~/.claude/skills/requesting-code-review/SKILL.md
~/.claude/skills/writing-plans/SKILL.md
```

或者：

```text
<project>/.claude/skills/requesting-code-review/SKILL.md
<project>/.claude/skills/writing-plans/SKILL.md
```

---

## 目录和产物约定

推荐项目结构：

```text
my-project/
├── openspec/
│   └── changes/
│       └── notification-center/
│           ├── proposal.md
│           ├── design.md
│           ├── tasks.md
│           └── specs/
│               └── notification-center/
│                   └── spec.md
├── tasks/
│   └── prd-notification-center.md
├── prd.json
├── progress.txt
├── ralph.config.json
└── .pipeline-state.json
```

各文件含义：

- `proposal.md`
  为什么做、做什么
- `design.md`
  技术方案
- `tasks.md`
  OpenSpec 分解后的实施条目
- `specs/**/*.md`
  需求和场景约束
- `tasks/prd-*.md`
  review 阶段使用和产出的 PRD Markdown
- `prd.json`
  Ralph 真正执行的清单
- `.pipeline-state.json`
  当前 pipeline 状态

---

## 最常用命令

```bash
ralph pipeline init <feature-name>
ralph pipeline run <feature-name>
ralph pipeline resume
ralph pipeline advance <phase>
ralph pipeline status
ralph pipeline check
ralph pipeline learnings
ralph pipeline reset
```

如果你想先推进到 execute gate，但不要立刻启动 Ralph：

```bash
ralph pipeline run <feature-name> --no-execute
```

同理，恢复时也可用：

```bash
ralph pipeline resume --no-execute
```

---

## 最推荐的新手流程

下面是最容易理解、也最稳的流程。

### 第 1 步：初始化 pipeline

```bash
ralph pipeline init notification-center
```

这会：

- 创建 `.pipeline-state.json`
- 检测 OpenSpec 是否可用
- 检测 Superpowers 是否可用

### 第 2 步：查看状态

```bash
ralph pipeline status
```

输出通常会告诉你：

- 当前 feature 名称
- 当前 phase
- 已完成 phase
- OpenSpec 是否可用
- Superpowers 是否可用
- `prd.json` 完成情况

### 第 3 步：用 OpenSpec 产出 change artifact

如果需求已经清楚，在对话里执行：

```text
/opsx:propose "notification-center"
```

如果需求还不够清楚，先执行：

```text
/opsx:explore "notification-center"
```

再继续：

```text
/opsx:propose "notification-center"
```

完成后，项目里应该至少有：

```text
openspec/changes/notification-center/proposal.md
openspec/changes/notification-center/design.md
openspec/changes/notification-center/tasks.md
openspec/changes/notification-center/specs/notification-center/spec.md
```

### 第 4 步：把 pipeline 推进到 review gate

```bash
ralph pipeline run notification-center --no-execute
```

它会尽可能往前推进，但不会在到达 execute 时直接启动 Ralph。  
如果 OpenSpec artifact 还不完整，它会停在 `spec` 并提示你继续用 OpenSpec。

---

## 每个阶段的真实行为

### `spec` 阶段

后端会优先检查：

- 是否已存在匹配 feature 的 `proposal.md`
- 是否已存在匹配 feature 的 `design.md`
- 是否已存在匹配 feature 的 `tasks.md`
- 是否已存在匹配 feature 的 `specs/**/*.md`

如果都存在，就直接推进。

如果缺失，后端不会替你自动生成 proposal；它会停在 `spec`，并提示你运行 `/opsx:explore` 或 `/opsx:propose`。

如果缺少上游输入，会 blocked。

### `review` 阶段

后端会先看：

- 是否已经存在匹配 feature 的 `tasks/prd-*.md`

如果已经存在，就直接推进。

如果不存在，但 spec 产物已经齐全，后端也不会自己生成 PRD Markdown。  
它会停在 `review`，要求你用 Superpowers 审查：

- `proposal.md`
- `specs/`
- `design.md`
- `tasks.md`

然后产出 `tasks/prd-*.md`。

#### 当 Superpowers 可用时会发生什么

当前实现不会自动替你跑完整 Superpowers 对话。  
它会做的是：

- 识别 review 相关技能是否存在
- 在 blocked 提示里告诉你 review 缺口
- 把 `reviewMode` 和 `reviewSkills` 写入 pipeline metadata

#### 当 Superpowers 不可用时

主线二会停在 `review`。  
如果你不想依赖 Superpowers，请改走主线一。

### `convert` 阶段

后端不会替你自动做转换。  
你应该先在对话里运行：

```text
/ralph-skills:ralph "把 tasks/prd-notification-center.md 转成 prd.json"
```

然后后端再：

1. 读取 `prd.json`
2. 验证结构
3. 执行 granularity check

如果故事太大、跨层太多、过于模糊，convert 会 blocked。

这时你可以手动运行：

```bash
ralph pipeline check
```

看哪些 story 需要拆分。

### `execute` 阶段

到这一阶段说明：

- `prd.json` 已经生成
- 结构有效
- 粒度检查通过

如果你带了 `--no-execute`，pipeline 会停住，等你确认后再启动 Ralph。  
如果没带，它会直接 handoff 给 Ralph。

### `archive` 阶段

到这一阶段说明：

- `prd.json` 已经执行完成
- 对应 OpenSpec change 可以归档

这一步的 owner 是 OpenSpec。  
你应该在对话里运行：

```text
/opsx:archive "notification-center"
```

---

## pipeline skill 怎么配合用

如果你想在对话里管理 gate，推荐：

```text
/ralph-skills:pipeline "add notification center"
```

`skills/pipeline/SKILL.md` 适合做这些事：

1. 总结当前 gate
2. 请求明确审批
3. 在合适的时候提醒你调用 CLI
4. 在 review 阶段提醒你使用 Superpowers review handoff

也就是说，对话层推荐用：

- `pipeline` skill 做 gate 管理
- `prd` / `ralph` skill 做文档生成和转换

命令行层推荐用：

- `ralph pipeline status`
- `ralph pipeline run ... --no-execute`
- `ralph pipeline resume`
- `ralph`

---

## 推荐组合方式

### 方式 A：主要用 CLI + 对话配合

```bash
ralph pipeline init notification-center
ralph pipeline status
# 在对话里完成 /opsx:explore 或 /opsx:propose
ralph pipeline run notification-center --no-execute
# 在对话里完成 Superpowers review，并生成 tasks/prd-notification-center.md
# 在对话里用 /ralph-skills:ralph 转出 prd.json
ralph pipeline check
ralph pipeline resume --no-execute
ralph
# 执行完成后，再做 /opsx:archive
```

### 方式 B：主要用对话式流程

对话里：

```text
/ralph-skills:pipeline "add notification center"
```

命令行里：

```bash
ralph pipeline status
ralph pipeline run notification-center --no-execute
ralph pipeline resume
```

---

## 常见 blocked 原因

### 1. `openspec_required`

含义：

- 主线二要求 OpenSpec
- 但当前既没有 OpenSpec CLI，也没有 OpenSpec skill

处理方式：

- 安装 OpenSpec CLI
- 或把 OpenSpec skill 放到全局 / 项目 `.claude/skills`

### 2. `missing_spec_artifacts`

含义：

- 找到了 spec 目录
- 但 `proposal.md`、`design.md`、`tasks.md`、`specs/**/*.md` 不完整

处理方式：

- 补齐整套 OpenSpec change artifact

### 3. `spec_generation_required`

含义：

- OpenSpec 可用
- 但当前 feature 还没有完整的 OpenSpec change artifact

处理方式：

- 如果需求模糊，先运行 `/opsx:explore`
- 然后运行 `/opsx:propose`
- 补齐 `proposal.md`、`design.md`、`tasks.md`、`specs/**/*.md`

### 4. `superpowers_review_required`

含义：

- review 阶段还没有完成 Superpowers 审查，也没有产出 `tasks/prd-*.md`

处理方式：

- 用 Superpowers 审 proposal / specs / design / tasks
- 产出对应的 `tasks/prd-*.md`

### 5. `prd_json_required`

含义：

- review PRD 已经存在
- 但还没有用 `ralph` skill 产出 `prd.json`

处理方式：

- 在对话里运行 `/ralph-skills:ralph "把 tasks/prd-xxx.md 转成 prd.json"`

### 6. `granularity_failed`

含义：

- `prd.json` 的 story 粒度不合格

处理方式：

- 重新拆分故事
- 优先把大故事拆成单轮可完成的小故事

---

## 什么时候该用 `advance`

一般不建议新手频繁手动使用：

```bash
ralph pipeline advance <phase>
```

因为它只是“手动记账”，不是帮你补做阶段工作。

适合使用的场景：

- 你已经在别处完成了该 gate
- 你只是想把状态补齐

不适合使用的场景：

- 你还没准备好该阶段的 artifact
- 你想跳过 review 或 convert

---

## learnings 和归档

执行完成后，先归档 OpenSpec change，再提取 learnings。  
也就是先运行：

```text
/opsx:archive "notification-center"
```

然后再根据需要执行：

```bash
ralph pipeline learnings
```

`ralph pipeline learnings` 会尝试把 learnings 写入状态。  
你也可以手动执行：

它会从 `progress.txt` 中提取：

- patterns
- gotchas
- recommendations

并写入归档文件。

---

## 和 README 的关系

这份文档是 README 中“路径 B：OpenSpec + Superpowers + Ralph”的展开版。  
如果你发现两份文档表达不一致，应以根目录 README 和当前实现为准。
