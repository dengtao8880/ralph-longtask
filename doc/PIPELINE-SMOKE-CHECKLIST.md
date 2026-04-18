# Pipeline Smoke Checklist

这份清单的目标不是“伪装成自动化 E2E”，而是给维护者一条最小、真实、可重复的人工验证路径，证明主线二可以从 `spec` 走到 `archive`。

---

## 使用前提

在开始前，先确认这几件事：

- 项目已经执行过 `npm install`
- Ralph CLI 可以运行
- OpenSpec CLI 已安装，或者你至少有可用的 OpenSpec skill
- Superpowers 的 review 技能已安装
- 你知道如何在对话里运行：
  - `/opsx:explore`
  - `/opsx:propose`
  - `/ralph-skills:ralph`
  - `/opsx:archive`

建议先执行一次：

```bash
ralph pipeline init smoke-feature
ralph pipeline status
```

确认当前环境检测输出合理。

---

## Smoke 路径

### 1. 初始化 pipeline

```bash
ralph pipeline init smoke-feature
ralph pipeline status
```

确认：

- 已创建 `.pipeline-state.json`
- 当前 phase 是 `spec`
- OpenSpec / Superpowers 可用性检测结果符合你的环境

### 2. 产出 OpenSpec change

如果需求清楚：

```text
/opsx:propose "smoke-feature"
```

如果需求还不清楚：

```text
/opsx:explore "smoke-feature"
/opsx:propose "smoke-feature"
```

确认这些文件存在：

```text
openspec/changes/smoke-feature/proposal.md
openspec/changes/smoke-feature/design.md
openspec/changes/smoke-feature/tasks.md
openspec/changes/smoke-feature/specs/smoke-feature/spec.md
```

### 3. 推进到 review gate

```bash
ralph pipeline run smoke-feature --no-execute
```

确认：

- pipeline 不再停在 `spec`
- 如果还没有 `tasks/prd-smoke-feature.md`，会停在 `review`
- blocked 文案会明确告诉你下一步该用 Superpowers 做 review handoff

### 4. 用 Superpowers 审文档并产出 PRD Markdown

在对话里把这些文档交给 Superpowers：

- `proposal.md`
- `specs/`
- `design.md`
- `tasks.md`

目标产物：

```text
tasks/prd-smoke-feature.md
```

确认：

- `tasks/prd-smoke-feature.md` 已存在
- 文档已经是可交给 `ralph` skill 转换的最终 PRD 版本

### 5. 转换为 `prd.json`

在对话里执行：

```text
/ralph-skills:ralph "把 tasks/prd-smoke-feature.md 转成 prd.json"
```

然后运行：

```bash
ralph pipeline check
ralph pipeline resume --no-execute
```

确认：

- `prd.json` 已生成
- `ralph pipeline check` 通过，或至少能给出可理解的 granularity 问题
- pipeline 现在停在 `execute`，而不是回退到 `convert`

### 6. 执行 Ralph

可以二选一：

```bash
ralph --resume
```

或者：

```bash
ralph pipeline resume
```

确认：

- Ralph 真正开始执行 `prd.json`
- `progress.txt` 有新的执行记录
- 至少一个 story 被处理并进入验证流程

### 7. 归档 OpenSpec change

当 `execute` 完成后，在对话里执行：

```text
/opsx:archive "smoke-feature"
```

然后根据需要执行：

```bash
ralph pipeline learnings
ralph pipeline status
```

确认：

- pipeline 不再卡在 `archive`
- OpenSpec change 已归档
- learnings 可以正常提取

---

## 通过标准

这条 smoke 路径算通过，至少要满足：

- `spec -> review -> convert -> execute -> archive` 每个阶段都能走到
- 每个 blocked 状态都能给出可操作的下一步提示
- 没有出现 CLI 伪装替代 OpenSpec / Superpowers / `ralph` skill owner 的情况
- 维护者可以据此复现实验，而不是依赖口头说明

---

## 失败时该记录什么

如果 smoke 失败，建议至少记录：

- 卡在哪个 phase
- blocked 提示是否足够清楚
- 缺的是哪个工具、skill 或 artifact
- 是代码问题、环境问题，还是文档误导

这样下次修复时，团队能直接把问题挂回真实阶段，而不是只说“pipeline 没跑通”。
