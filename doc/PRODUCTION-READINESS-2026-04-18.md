# Ralph 生产就绪度评估

**评估日期：** 2026-04-18  
**评估范围：** 主线 1（Ralph CLI 单独使用）+ 主线 2（OpenSpec + Superpowers + Ralph pipeline）

---

## 结论

### 主线 1：`Beta / 内部受控可用`

Ralph CLI 的核心实现已经具备明显的工程基础，适合：

- 小团队内部使用
- 开发者在旁值守
- PRD 质量较高、story 粒度较小的项目

但它还不适合：

- 无人值守长时间自动运行
- 对 token 成本敏感的批量执行
- 需要强纠错和强人工接管能力的生产环境

### 主线 2：`编排型 PoC，不具备生产流水线条件`

当前 pipeline 的方向是对的，严格 gate 模型也清晰：

```text
spec -> review -> convert -> execute -> archive
```

但它更像“阶段编排器”，而不是“已经打通的自动化生产流水线”。  
它适合做流程约束和状态管理，不适合被承诺为全自动交付链路。

---

## 已具备

### 主线 1 已具备能力

- 执行主循环稳定：`prd.json -> story -> prompt -> Claude -> validation -> progress`
- 数据安全基础扎实：原子写入、`.bak` 备份、损坏恢复
- 跨平台处理较成熟：尤其是 Windows 下的 Claude CLI 兼容
- 配置系统清晰：默认值、配置文件、环境变量三层合并
- 验证链路完整：JSON 结构、git commit、completion signal、acceptance commands
- UI 验收开始具备真实性：`browser` 验收已接入配置和校验
- 测试覆盖关键主路径：当前测试集可以稳定兜住回归

### 主线 2 已具备能力

- 状态机设计清楚，阶段边界明确
- CLI 子命令体系完整：`init/run/resume/status/advance/check/learnings/reset`
- OpenSpec / Superpowers 探测路径已补齐
- blocked 提示已经能指出下一步应该交给谁
- 文档主线已经和“严格 gate”实现对齐

---

## 阻塞生产

### 阻塞 1：坏 story 没有熔断或跳过机制

这是主线 1 最大的生产阻塞。

当前行为是：

- Ralph 每轮只取当前最高优先级且 `passes: false` 的 story
- 如果该 story 因验收歧义、实现复杂度或环境问题持续失败
- 后续迭代仍会继续命中同一个 story

风险：

- 烧掉整轮预算
- 用户离开后回来只看到“同一个 story 失败了很多次”
- 信任迅速下降

这会直接阻止“放心挂机跑”的使用场景。

### 阻塞 2：缺少人工接管入口

当前主线 1 没有这些关键入口：

- `--story US-XXX`
- `--skip-story US-XXX`
- 重新执行某个已完成 story

结果是：

- 用户不能精确排障
- 不能快速绕过已知坏 story
- 只能改 `prd.json` 或改优先级来间接控制

### 阻塞 3：没有运行预算护栏

当前主要预算护栏只有：

- `maxIterations`

但缺少更贴近真实成本控制的限制，例如：

- 最大 wall-clock 时间
- 连续失败上限
- 单个 story 最大失败次数
- token / 成本预算

这会让主线 1 在“自动运行”语境下显得不够安全。

### 阻塞 4：主线 2 还不是端到端流水线

当前主线 2 是：

- OpenSpec 负责 `spec`
- Superpowers 负责 `review`
- `ralph` skill 负责 `convert`
- Ralph CLI 负责 `execute`
- OpenSpec 负责 `archive`

这本身没问题，但它意味着：

- 依赖链长
- 工具安装要求高
- 中间环节要靠对话和 skill 流程推进
- 还不能把它包装成“开箱即用的自动化 pipeline”

### 阻塞 5：主线 2 还缺少真正的集成级证明

虽然现在单元测试和编排测试已经不少，但仍缺少更贴近真实使用的证明：

- 从 OpenSpec artifact 准备完成
- 到 Superpowers review 产出 PRD
- 到 `ralph` skill 转出 `prd.json`
- 到 Ralph 执行
- 到 OpenSpec archive

这条链还没有一个“真实依赖安装齐全时”的集成级 smoke 证明。

---

## 建议增强

### 高优先级增强

1. 为单个 story 增加失败熔断
2. 增加 `--story` / `--skip-story` / `--retry-story`
3. 增加按时间或连续失败次数停止
4. 为主线 2 增加集成 smoke 测试
5. 清理旧自动化路线残留函数，降低维护困惑

### 中优先级增强

1. `ralph init` 脚手架命令
2. `--dry-run` 预览将要执行的 story
3. 更直白的 blocked 文案映射
4. 更细的 acceptance command 错误提示
5. 为 `prd.json` 提供 JSON Schema

### 低优先级增强

1. 更丰富的执行统计
2. 更明确的成本可视化
3. pipeline 观察模式，例如 `watch`
4. rollback / 回退阶段操作

---

## 两周路线图

### 第 1 周：把主线 1 从“能用”拉到“可放心值守”

#### 目标

让 Ralph CLI 具备最基本的自动运行安全网。

#### 建议交付

1. 单 story 连续失败计数
2. 达到阈值后自动跳过并写入 `progress.txt`
3. `--story US-XXX`
4. `--skip-story US-XXX`
5. `--max-failures-per-story`
6. `--max-runtime-minutes`

#### 完成标准

- 用户可以放心让 Ralph 跑一段时间
- 单个坏 story 不会吃光全部预算
- 用户可以显式接管和排障

### 第 2 周：把主线 2 从“编排 PoC”拉到“可验证流程”

#### 目标

让主线 2 至少具备“能被证明跑通”的可信度。

#### 建议交付

1. 增加集成级 smoke 测试方案
2. 清理旧自动生成路线残留代码，保留严格 gate 实现
3. blocked 提示改为更贴近用户动作的话术
4. 明确记录主线 2 的依赖安装检查表
5. 增加一份“最小可跑通示例”

#### 完成标准

- 新维护者能理解主线 2 的真实边界
- 用户知道自己卡在哪一步、该做什么
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

这个项目真正缺的不是主干逻辑，而是自动化产品该有的护栏。  
主线 1 缺安全网，主线 2 缺集成级自证。
