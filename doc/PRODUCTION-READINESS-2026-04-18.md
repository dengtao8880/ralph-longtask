# Ralph 生产就绪度评估

**评估日期：** 2026-04-18  
**评估范围：** 主线 1（Ralph CLI 单独使用）与主线 2（OpenSpec + Superpowers + Ralph pipeline）

---

## 结论

### 主线 1：`Beta / 内部受控可用`

Ralph CLI 的核心执行链路已经比较扎实，适合：

- 小团队内部使用
- 开发者在旁值守
- PRD 质量较高、story 粒度较小的项目

它现在仍然不适合直接承诺为“完全可放心挂机的生产自动化”，但已经从“能用”推进到了“带护栏可用”。

### 主线 2：`编排型 PoC，不具备生产流水线条件`

当前 pipeline 的方向是正确的，严格 gate 也已经明确：

```text
spec -> review -> convert -> execute -> archive
```

但它更像“阶段编排器”，而不是“已完全打通、可独立运行的自动化生产流水线”。  
它适合做流程约束和状态管理，不适合被描述成开箱即用的全自动 pipeline。

---

## 2026-04-18 实施更新

本轮已经补上的项：

- Ralph CLI 新增了 `--story`、`--skip-story`、`--retry-story`、`--dry-run`
- Ralph CLI 新增了 `--max-runtime-minutes`、`--max-failures-per-story`
- 同一个 story 连续失败达到阈值后，会自动熔断跳过，并把原因写入 `progress.txt`
- 自动跳过状态会持久化到 `.ralph-run-state.json`，后续 run 会继续避开坏 story，直到用户用 `--retry-story` 明确接管
- Ralph 现在支持近似的 token / 成本预算护栏：`--max-total-tokens`、`--max-total-cost-usd`
- dry-run 输出会直接显示当前预算护栏，`progress.txt` 也会追加“截至当前轮的预算估算”
- pipeline blocked 文案已经改成“下一步该做什么”的用户导向提示
- 严格 gate 之外的旧自动生成 helper 已清理，减少了两套架构并存造成的维护困惑
- 主线二新增了手工集成验证文档 [PIPELINE-SMOKE-CHECKLIST.md](/D:/project/AI-Coding/ralph-longtask/doc/PIPELINE-SMOKE-CHECKLIST.md)

本轮还没有解决的项：

- 真实依赖安装齐全时的自动化集成测试
- 更接近真实账单的 token / 成本统计
- 更系统的运行统计与观测输出

---

## 已具备

### 主线 1 已具备能力

- 执行主循环稳定：`prd.json -> story -> prompt -> Claude -> validation -> progress`
- 数据安全基础扎实：原子写入、`.bak` 备份、损坏恢复
- 跨平台处理较成熟，尤其是 Windows 下的 Claude CLI 兼容
- 配置系统清晰：默认值、配置文件、环境变量三层合并
- 验证链路完整：JSON 结构、git commit、completion signal、acceptance commands
- UI 验收已经纳入真实配置和校验，`browser` acceptance command 可强制执行
- 已有运行护栏：定向 story、手工跳过、自动熔断、持久化 auto-skip、runtime 预算、token/cost 预算
- dry-run 已经可以在正式执行前预览队列和预算护栏

### 主线 2 已具备能力

- 状态机设计清晰，阶段边界明确
- CLI 子命令体系完整：`init/run/resume/status/advance/check/learnings/reset`
- OpenSpec / Superpowers 探测路径已经补齐
- blocked 提示可以明确指出下一步该交给谁
- README、USER_GUIDE、PIPELINE_GUIDE 与严格 gate 实现已基本对齐

---

## 阻塞生产

### 阻塞 1：主线 1 的预算控制仍然是估算，不是账单级观测

虽然主线 1 已经具备：

- `--max-runtime-minutes`
- `--max-failures-per-story`
- `--max-total-tokens`
- `--max-total-cost-usd`

但当前 token / cost 仍然是“字符数推算”的近似模型。  
这足够做“别让 run 继续失控”的护栏，但还不适合当成精确的成本审计依据。

### 阻塞 2：主线 1 的运行可观测性还不够强

虽然现在已经有：

- `--story US-XXX`
- `--skip-story US-XXX`
- `--retry-story US-XXX`
- `--dry-run`

但长时间运行时，用户仍然主要依赖 `progress.txt` 人工回看。  
它还缺少更清晰的 run 级汇总，例如总失败次数、各 story 尝试次数、预算消耗汇总。

### 阻塞 3：主线 2 仍然不是端到端自动流水线

当前主线 2 是：

- OpenSpec 负责 `spec`
- Superpowers 负责 `review`
- `ralph` skill 负责 `convert`
- Ralph CLI 负责 `execute`
- OpenSpec 负责 `archive`

这个分工本身没有问题，但它意味着：

- 依赖链较长
- 工具安装要求高
- 中间环节仍依赖对话式 skill 流程推进
- 还不能把它包装成“开箱即用的自动 pipeline”

### 阻塞 4：主线 2 仍缺少真实依赖齐全时的集成级证明

虽然现在已有不少单元测试和编排测试，但仍缺少一条更贴近真实使用的证明：

- 从 OpenSpec artifact 准备完成
- 到 Superpowers review 产出 PRD
- 到 `ralph` skill 转出 `prd.json`
- 到 Ralph 执行
- 到 OpenSpec archive

当前还没有一套“真实依赖安装齐全时”的自动化 smoke 证明。

---

## 建议增强

### 高优先级

1. 为主线 2 增加自动化集成 smoke 测试
2. 增加更清晰的运行统计和预算汇总输出
3. 如果条件允许，接入更接近真实账单的 token / 成本统计
4. 补一份更完整的故障排查文档
5. 继续清理可能残留的旧自动化路线痕迹

### 中优先级

1. `ralph init` 脚手架命令
2. `--dry-run` 之外的更完整预览/报告模式
3. 更细的 acceptance command 错误提示
4. 给 `prd.json` 提供 JSON Schema
5. 更细粒度的 CLI 运行摘要

### 低优先级

1. 更丰富的执行统计
2. 更明确的成本可视化
3. pipeline 观察模式，例如 `watch`
4. rollback / 回退阶段操作

---

## 两周路线图

### 第 1 周：把主线 1 从“带护栏可用”推进到“更可观测”

#### 目标

让 Ralph CLI 在长时间运行时更容易被用户理解和接管。

#### 建议交付

1. run 级预算与失败摘要
2. story 尝试次数统计
3. 统一的运行结果汇总输出
4. 更明显的预算耗尽与熔断提示

#### 完成标准

- 用户能快速看懂这次 run 到底做了什么
- 用户知道预算消耗到了哪里
- 用户知道哪些 story 被跳过、为什么被跳过

### 第 2 周：把主线 2 从“编排型 PoC”推进到“可自证流程”

#### 目标

让主线 2 至少具备“能被证明跑通过”的可信度。

#### 建议交付

1. 自动化 smoke 测试方案
2. 一份最小可跑通示例
3. 更清晰的依赖安装检查清单
4. 更系统的 blocked/next-step 指引

#### 完成标准

- 新维护者能理解主线 2 的真实边界
- 用户知道自己卡在哪一步、下一步该做什么
- 项目可以自证“这不是幻觉型 pipeline”

---

## 最终判断

### 现在是否生产可用

如果“生产可用”的意思是：

- 代码质量达标
- 核心路径稳定
- 在受控环境里能持续使用

那么主线 1 已经接近。

如果“生产可用”的意思是：

- 用户可以放心后台跑
- 出故障不会持续烧预算
- 人工可以快速接管
- pipeline 能稳定跑通整条链路

那么当前答案仍然是否定的。

### 一句话总结

这个项目真正缺的已经不是主干逻辑，而是更强的观测、自证和端到端验证。  
主线 1 现在有了护栏，但还缺账单级和运行级可观测性；主线 2 有了正确架构，但还缺自动化集成自证。
