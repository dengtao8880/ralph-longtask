# Ralph CLI 架构说明

这份文档解释 Ralph 当前的技术实现，重点是帮助你理解：

- Ralph CLI 单独运行时内部做了什么
- `ralph pipeline` 后端到底负责什么
- 当前实现和 README / 用户指南中的说法如何对应

如果你是第一次上手，请先读：

- [README.md](/D:/project/AI-Coding/ralph-longtask/README.md)
- [USER_GUIDE.md](/D:/project/AI-Coding/ralph-longtask/doc/USER_GUIDE.md)

## 一句话概括

Ralph 是一个以 `prd.json` 为输入、以 Claude Code CLI 为执行引擎、以验证管线为质量闸门的迭代调度器。

它的 pipeline 子系统则是一个“阶段状态机 + artifact 驱动后端”，不是完整对话式审批器。

---

## 两个入口

### 1. `ralph.js`

主入口，负责独立执行循环。

典型职责：

- 读取 `prd.json`
- 找到下一个 story
- 组装 prompt
- 启动 Claude CLI
- 运行验证
- 写回 `progress.txt`

### 2. `ralph-pipeline.js`

pipeline 子命令入口。

典型职责：

- 管理 `.pipeline-state.json`
- 检测 OpenSpec / Superpowers 可用性
- 依据 artifact 推进 `spec -> review -> convert -> execute -> archive`

---

## 当前主要模块

```text
ralph.js
ralph-pipeline.js
lib/
├── archive.js
├── config.js
├── executor.js
├── granularity.js
├── learnings.js
├── pipeline-actions.js
├── pipeline-cli.js
├── pipeline-state.js
├── prd-converter.js
├── prd.js
├── progress.js
├── prompt-builder.js
└── validator.js
```

## 模块分工

### `lib/config.js`

负责配置加载与合并。

优先级：

```text
defaults -> ralph.config.json -> RALPH_* env vars
```

这里也定义了 acceptance commands，例如：

- `typecheck`
- `tests`
- `browser`

### `lib/prd.js`

负责：

- 加载 `prd.json`
- 保存 `prd.json`
- 验证结构
- 选择下一个未完成 story

### `lib/prompt-builder.js`

负责把多层上下文组装成单轮 prompt。

当前 prompt 来源主要包括：

1. 项目上下文
2. 严格单故事协议
3. `RALPH.md`
4. `extraContextPaths`
5. `extraInstructions`
6. 当前 story 详情

### `lib/executor.js`

负责真正启动 Claude CLI。

关键点：

- 支持 Windows 特殊处理
- prompt 现在是直接写入子进程 `stdin`
- 不再依赖“临时文件 + stream pipe”的旧实现说法
- 会捕获 stdout/stderr，用于后续 completion signal 检测

### `lib/validator.js`

负责执行会话后的验证管线。

验证内容包括：

- `prd.json` 是否仍然是有效结构
- 是否存在匹配当前 story 的 git commit
- stdout 中是否出现 `<promise>COMPLETE</promise>`
- acceptance commands 是否通过

### `lib/granularity.js`

负责 story 粒度检查与拆分建议。

当前主要规则包括：

- TOO_MANY_SENTENCES
- TOO_MANY_CRITERIA
- CROSS_LAYER
- VAGUE_LANGUAGE
- TOO_BROAD

### `lib/progress.js`

负责初始化并追加 `progress.txt`。

### `lib/archive.js`

负责当 `branchName` 变化时归档旧的执行数据。

### `lib/pipeline-state.js`

负责 `.pipeline-state.json` 的读写和 phase 推进。

当前 phase 固定为：

```text
spec -> review -> convert -> execute -> archive
```

### `lib/pipeline-actions.js`

负责每个阶段的实际动作。

例如：

- `runSpecPhase`
- `runReviewPhase`
- `runConvertPhase`
- `runExecutePhase`
- `runArchivePhase`

这里也包含：

- OpenSpec / Superpowers / Ralph skill / Ralph CLI 的 gate 判定
- Superpowers review handoff 解析逻辑
- OpenSpec archive 阶段的归档调用

### `lib/pipeline-cli.js`

负责：

- 子命令解析
- 工具可用性探测
- orchestration 循环
- 状态输出和 blocked 提示

### `lib/learnings.js`

负责从 `progress.txt` 中提取 learnings，并写入归档文档。

---

## Ralph CLI 独立运行时的生命周期

一次典型循环大致是：

```text
加载配置
-> 加载 prd.json
-> 选择最高优先级未完成 story
-> 备份 prd.json
-> 组装 prompt
-> 启动 Claude CLI
-> 捕获输出
-> 执行验证
-> 必要时自动 patch passes
-> 追加 progress.txt
-> 进入下一轮
```

### 为什么每轮都是新会话

这是 Ralph 的核心设计：

- 避免上下文污染
- 把长期记忆交给 git、`progress.txt` 和 `prd.json`
- 强迫每个 story 足够小

代价是：

- story 必须拆得更细
- 不能假设上一轮的上下文还在

---

## 验证管线的真实规则

一个 story 被自动标记完成，不是因为 Claude 说“我做完了”，而是因为以下条件都满足：

1. Claude CLI 正常退出
2. stdout 中检测到 `<promise>COMPLETE</promise>`
3. `prd.json` 结构有效
4. 若启用了 `checkGitCommit`，则存在匹配提交
5. 若 story 声明了 acceptance commands，则对应命令全部通过

尤其要注意：

- 只要缺少 completion signal，就不会自动 patch `passes`
- UI story 若需要 browser 验收，但未配置 browser command，也不会自动通过

---

## acceptance commands 的设计含义

Ralph 并不“理解”所有验收标准。  
它只对少数约定好的标准有可执行映射。

当前重点包括：

- `Typecheck passes`
- `Tests pass`
- `Verify in browser using dev-browser skill`

对应到配置：

```json
"validation": {
  "acceptanceCommands": {
    "typecheck": "...",
    "tests": "...",
    "browser": "..."
  }
}
```

如果某个 story 包含 browser 验收标准，但配置里缺少 `browser` 命令，验证会返回未配置状态而不是误判通过。

---

## pipeline 后端的真实边界

这是当前最容易被误解的地方。

### pipeline 后端会做什么

- 管理 `.pipeline-state.json`
- 根据 artifact 判断 phase 是否可推进
- 在 blocked 时明确告诉你下一步该由谁接手
- 在到达 execute 时 handoff 给 Ralph
- 在执行完成后进入 OpenSpec archive gate

### pipeline 后端不会做什么

- 不会自动替你完成完整 OpenSpec 对话
- 不会自动替你完成完整 Superpowers 对话审批
- 不会自动生成 review PRD Markdown
- 不会自动把 PRD Markdown 转成 `prd.json`
- 不会替你做所有“需要人确认”的 gate 决策

这就是为什么项目里同时存在：

- `skills/pipeline/SKILL.md`
- `ralph pipeline`

前者偏对话与审批，后者偏状态与 gate 编排。

---

## OpenSpec 探测的当前行为

`detectOpenSpec(projectDir)` 当前会检查：

1. `openspec --version` 是否可执行
2. 用户全局技能目录 `~/.claude/skills/`
3. 项目本地技能目录 `<project>/.claude/skills/`
4. 项目中是否存在 `openspec/changes/`

这意味着：

- 只安装全局 OpenSpec skill 也能被识别
- 不一定非要项目内重复安装一次

---

## Superpowers 探测和 review handoff

`detectSuperpowers(projectDir)` 当前会检测：

- 用户全局 `.claude/skills`
- 项目本地 `.claude/skills`

并识别与 review 相关的技能别名。

但当前实现的重点不是“自动发起 Superpowers 对话”，而是：

1. 判断哪些 review 技能可用
2. 在 blocked 提示中明确 review 缺口
3. 在 pipeline metadata 中记录：
   - `reviewMode`
   - `reviewSkills`

所以更准确的说法是：

- 当 Superpowers 可用时，review 阶段会生成“Superpowers review handoff”
- 而不是“CLI 自动完成整个 skill-to-skill review”

---

## 状态文件

### `prd.json`

执行输入。

### `progress.txt`

执行日志和 learnings 来源。

### `.pipeline-state.json`

pipeline 后端状态。

一个典型 state 会记录：

- `feature`
- `completedPhases`
- `prdPath`
- `lastUpdated`
- `metadata`

`metadata` 里常见内容：

- `specDir`
- `specGeneration`
- `reviewMode`
- `reviewSkills`
- `storyCount`
- `executionStartedAt`
- `learningsPath`

---

## 当前文档与实现对齐的几个关键点

为了避免旧文档误导，下面这些点以当前实现为准：

### 1. Prompt 不是先写临时文件再 pipe

当前实现是直接把 prompt 写进 Claude CLI 的 `stdin`。

### 2. OpenSpec 支持全局技能探测

不再只依赖 repo 内 `.claude/skills`。

### 3. `spec` 阶段要求完整的 OpenSpec change

当前 `spec` 阶段判断通过的条件是：

- `proposal.md`
- `design.md`
- `tasks.md`
- `specs/**/*.md`

它不会再替你自动生成 proposal；缺失时会停在 `spec`，要求你去运行 `/opsx:explore` 或 `/opsx:propose`。

### 4. Superpowers 不只是“打标签”

当前 review 阶段会真实生成 review handoff 内容，并记录 `reviewSkills`。

### 5. UI 验收需要 browser command

如果故事要求浏览器验证，但你没配置 browser 命令，就不会自动通过。

---

## 推荐如何阅读这份架构文档

如果你正在：

- 学用法：看 README 和 USER_GUIDE
- 学 pipeline：看 PIPELINE_GUIDE
- 查内部模块：看当前文档

这三份文档的职责应该是：

- README：总览和上手路径
- USER_GUIDE：详细操作
- PIPELINE_GUIDE：阶段化流程
- 当前文档：实现原理
