# 维修工单排班工作台

本地运行的维修工单管理系统：登记设备报修、管理技师技能与排班、推进工单完整生命周期。

## 核心业务规则（重要）

### 状态流转

```
待派单 ──派单──▶ 处理中 ──▶ 待验收 ──▶ 关闭
                       ▲
                       │
              复核通过（返工回退）
```

- 待派单不可直接关闭
- 状态只可按顺序单向推进
- **关闭后可通过「申请复核」审批流程回到待验收**

### ✅ 关闭后仍可撤销最近一次状态变更

- 任何被快照记录的操作（派单 / 状态变更）都可以撤销，**包含关闭操作**
- 撤销后工单回退到上一步状态（如：关闭 → 待验收），保留原技师
- 撤销操作本身写入审计日志，并打上 `undoOfId` 标记指向被撤销的记录
- 撤销操作**不可再次撤销**（一次回退到位，避免循环）

### ✅ 新增：关闭后申请复核（返工链路）

已关闭工单不再只停留在「撤销上一步」，新增完整的复核审批流程：

#### 🔐 权限控制
- **申请人**：仅工单创建人 或 管理员（`管理员`、`调度员A`、`调度员B`）可发起
- **审批人**：仅管理员可审批

#### 📋 流程规则
1. 申请人必须填写复核原因（5-500字符）
2. 审批前，申请人可**撤回**自己的申请
3. 审批通过 → 工单状态自动回退至「待验收」，保留原技师
4. 审批拒绝 → 工单保持「已关闭」不变
5. **同一工单不可并发挂多条待审批申请**（后端强制拦截）

#### 📝 审计记录节点
所有操作均写入审计日志，明确记录操作者与时间：
- `rework_apply` — 提交复核申请
- `rework_withdraw` — 撤回复核申请
- `rework_approve` — 审批通过
- `rework_reject` — 审批拒绝
- `rework_status_rollback` — 审批通过后，工单状态实际回退

#### 🖥 GUI 展示
- 详情页顶部显示「当前有待审批的复核申请」状态条
- 新增「复核/返工记录」卡片：展示所有历史申请、状态、审批人、审批意见与时间线
- 操作面板中显示对应按钮：申请复核 / 撤回申请 / 通过复核 / 拒绝申请
- 审计日志时间线使用不同颜色区分各类返工操作

#### 📊 CSV 导出
导出文件新增 7 列返工相关字段：
- 返工申请状态、返工申请人、返工申请原因
- 返工审批人、返工审批意见、返工申请时间、返工审批时间

### ✅ 新增：任务回执与验真中心（导出模块）

把导出这类异步操作做成可追溯的完整模块。**任何一步没验证通过，都不能把状态显示成完成**。

#### 🔐 权限控制
- **管理员**：可见所有批次，可触发恢复操作
  - 硬编码集合：`管理员`、`调度员A`、`调度员B`
- **技师**：仅可见自己创建的批次，自动强制 `technicianId` 为自身

#### 📋 核心设计原则

**1. 任务发起时固化（不可篡改）**
创建批次时立即写入：
- `filters` 请求参数（JSON 序列化）
- `ticketIds` 命中数据 ID 列表（JSON 序列化）
- `operator` 操作者
- `totalCount` 预期条数
- `filterSummary` 筛选条件摘要
- 批次状态设为 `pending`

**2. 执行完成后验真（三要素一致）**
只有当以下三项全部匹配，才将状态标记为 `completed`（同时 `verificationStatus = 'verified'`）：
- ✅ `snapshotCount`（数据库快照条数）
- ✅ `fileRowCount`（CSV 文件实际行数，排除表头，处理引号内换行）
- ✅ `fileSha256`（CSV 文件 SHA256 哈希摘要）

任何一项不匹配 → 状态标记为 `failed`，`verificationStatus = 'mismatch'`，记录 `mismatchReason`。

**3. 验真详情字段**
| 字段 | 说明 |
|------|------|
| `snapshotCount` | 数据库快照固化的条数 |
| `fileRowCount` | CSV 文件实际数据行数 |
| `fileSizeBytes` | CSV 文件字节数 |
| `fileSha256` | CSV 文件 SHA256 哈希（64 位十六进制） |
| `countMatch` | 条数是否一致 |
| `fileExists` | 文件是否存在 |
| `verifiedAt` | 验真时间 |
| `mismatchReason` | 不匹配原因（如有） |

**4. 下载拦截**
- 只有 `status === 'completed'` 且 `verificationStatus === 'verified'` 的批次才允许下载
- 未通过验真的批次无法下载，前端隐藏下载按钮

#### 🔄 重试链路

通过 `retry_of_id` 外键字段构建批次间的父子关系链：
- 取消（`cancelled`）或失败（`failed`）的批次可被重试
- 重试生成新批次号，保留 `retryOfId` 指向原批次
- 前端详情页侧栏展示完整重试链路，高亮当前批次
- 权限隔离：技师在链路中只能看到自己创建的批次

#### 🛡️ 并发冲突拦截

- 5 分钟时间窗口
- 同一操作人 + 完全相同筛选条件 → 拦截
- 拦截时返回已存在的批次号

**已修复边界：** 只拦截 `pending` / `processing` 状态，不拦截 `completed` / `cancelled` / `failed`。

#### ⏰ 服务重启恢复

服务启动时自动执行 `recoverStuckBatches()`：
- **`pending` 状态**：自动重新入队执行（写入 `recoveredAt` 时间戳）
- **`processing` 状态**：标记为 `failed`，原因："服务重启，任务中断"
- 所有恢复操作写入 `export_recover` 审计日志

日志输出示例：
```
[任务恢复] 启动恢复完成：pending自动重试 2 个，processing标记失败 1 个
```

管理员也可通过 API 手动触发恢复：
```http
POST /api/export/recover
Body: { "operator": "调度员A" }
```

#### 🚫 未开始任务取消

- 仅 `pending` 状态可取消
- 取消后状态变为 `cancelled`，记录 `cancelledAt` 和 `cancelledBy`
- 已取消的批次不可再次取消
- 取消操作写入 `export_cancel` 审计日志

#### 📝 审计日志全链路

所有导出相关操作写入 `audit_logs` 表：

| Action | 触发时机 |
|--------|----------|
| `export_create` | 创建导出批次 |
| `export_cancel` | 取消导出批次 |
| `export_retry` | 重试导出批次 |
| `export_complete` | 导出成功完成（afterData 包含 SHA256、文件大小等） |
| `export_fail` | 导出失败或验真不通过 |
| `export_recover` | 服务重启恢复任务 |

审计日志页面前端使用不同颜色区分各类导出操作。

#### 🖥 GUI 展示

**导出中心列表页：**
- 新增"验真"列，显示三种状态徽章
  - 🟡 `pending` 待验真
  - 🟢 `verified` 验真通过
  - 🔴 `mismatch` 验真不通过

**导出详情页：**
- 顶部同时显示状态徽章和验真徽章
- 新增"验真详情"卡片：快照条数、文件行数、文件大小、SHA256（可复制）、条数匹配、文件存在、验真时间、不匹配原因
- 侧栏"重试链路"卡片：展示完整链路，高亮当前批次
- 新增"重新验真"按钮（`completed` 状态可见）
- 仅验真通过才显示下载按钮
- 若有 `recoveredAt` 显示恢复提示

**审计日志页：**
- 6 种导出操作使用 teal/rose/amber/emerald/red/cyan 色系区分

#### 📡 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/batches` | 批次列表（自动权限过滤） |
| POST | `/api/export/batches` | 创建导出批次 |
| GET | `/api/export/batches/:id` | 批次详情 |
| POST | `/api/export/batches/:id/cancel` | 取消批次 |
| POST | `/api/export/batches/:id/retry` | 重试批次 |
| GET | `/api/export/batches/:id/verification` | 查询验真详情 |
| POST | `/api/export/batches/:id/verify` | 手动触发重新验真 |
| GET | `/api/export/batches/:id/retry-chain` | 查询重试链路（自动权限过滤） |
| GET | `/api/export/batches/:id/download` | 下载文件（验真拦截） |
| GET | `/api/export/batches/:id/snapshots` | 查询数据快照与差异 |
| POST | `/api/export/recover` | 管理员手动触发恢复 |

#### 📊 数据库表结构

`export_batches` 表新增列：
```sql
file_sha256         TEXT       -- CSV 文件 SHA256 哈希
file_size_bytes     INTEGER    -- CSV 文件字节数
file_row_count      INTEGER    -- CSV 文件数据行数
verification_status TEXT DEFAULT 'pending'  -- pending/verified/mismatch
retry_of_id         INTEGER REFERENCES export_batches(id)  -- 重试父批次
recovered_at        TEXT       -- 恢复时间
```

**向后兼容：** 通过 `_columnExists()` + `ALTER TABLE ADD COLUMN` 实现旧库平滑升级。

#### 🧪 集成测试（必跑）

```bash
node test-task-receipt-center.mjs
```

**40 项测试全部覆盖：**

1. **权限测试（8 项）**
   - 不存在用户无法创建
   - 管理员可创建、可查看所有批次
   - 技师可创建、仅可见自己的批次
   - 技师不可触发恢复接口
   - 管理员可触发恢复接口

2. **重复提交拦截（3 项）**
   - 首次创建成功
   - 5 分钟内同条件重复创建被拦截
   - 拦截错误提示包含批次号

3. **未开始任务取消（4 项）**
   - pending 状态可被取消
   - 取消后状态为 cancelled
   - cancelledBy 被正确记录
   - 已取消的批次不可再次取消

4. **验真与结果条数一致性（11 项）**
   - 异步导出任务在合理时间内完成
   - completed 状态必须是验真通过的（verified）
   - 验真接口返回快照条数与预期一致
   - 验真接口返回文件条数与预期一致
   - 验真接口 countMatch=true
   - SHA256 为 64 位十六进制字符串
   - fileSizeBytes > 0
   - 验真通过的批次可下载
   - exportedCount 等于 totalCount（验真一致性）
   - 批次详情包含 fileRowCount
   - 批次详情包含 fileSha256

5. **重试链路（7 项）**
   - cancelled 状态可重试并生成新批次
   - 重试新批次有 retryOfId 指向原批次
   - 管理员重试链路包含原批次和新批次
   - 链路中第一个为原批次
   - 链路中包含新批次
   - 技师只能看到链路中自己创建的批次（权限隔离）
   - 技师看到的是自己创建的原批次

6. **审计日志落库（5 项）**
   - 审计日志接口返回成功
   - 包含 export_create 动作
   - 包含 export_cancel 动作
   - 包含 export_retry 动作
   - export_complete 审计记录包含 afterData（有 SHA256 等信息）

7. **服务重启恢复（1 项）**
   - 管理员手动触发恢复接口返回正确结构

8. **技师自动过滤（1 项）**
   - 技师创建时传入的 technicianId 会被覆盖为自身

### ❌ 关闭后不能改派 / 不能直接变更状态

- 已关闭工单如需重新派单或调整，可选择：
  - **撤销关闭**（快速回退，无需审批）
  - **申请复核**（审批流程，留下完整记录）
- 关闭后禁止直接改派（后端 `validateAssign` 校验 + 前端禁用）
- 关闭后禁止通过状态推进接口直接变更（后端 `changeTicketStatus` 校验）

### 撤销入口的可见性规则

| 条件 | 撤销按钮 | 派单/改派面板 | 状态推进按钮 |
|------|---------|-------------|------------|
| `undoSnapshot != null`（不限状态） | ✅ 显示，closed 态额外提示"撤销关闭→待验收" | - | - |
| `status === closed` | ✅ 显示（上述） | ❌ 禁用，提示"已关闭·不能改派" | ❌ 全部隐藏（需先撤销关闭或复核通过） |
| `status === pending_assign` | 看快照 | ✅ 可用 | ❌（派单后自动推进） |
| `status === in_progress` | 看快照 | ❌ 需先撤销派单 | ✅ 提交验收 |
| `status === pending_verify` | 看快照 | ❌ 需先撤销到待派单 | ✅ 关闭工单 |

### 返工申请 API 接口

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/api/tickets/:id/rework/apply` | 提交复核申请 | `{ reason, operator }` |
| POST | `/api/tickets/:id/rework/withdraw` | 撤回复核申请 | `{ reworkId, operator }` |
| POST | `/api/tickets/:id/rework/review` | 审批（通过/拒绝） | `{ reworkId, approved, comment, operator }` |
| GET | `/api/tickets/:id` | 工单详情返回 `reworks` 和 `pendingRework` | — |

## 快速开始

```bash
npm install
npm run dev          # 同时启动前端(Vite 5178) + 后端(Express 3088)
# 前端代理 /api -> http://localhost:3088
```

访问 http://localhost:5178 打开工作台。

## 测试清单（必跑）

见项目根目录的 `test-backend-rework.mjs`：

```bash
node test-backend-rework.mjs
```

覆盖场景：

### 基础闭环
1. 创建 → 派单 → 推进 → 关闭 ✅
2. **closed 工单不能改派（400）** ✅
3. **closed 工单不能直接改状态（400）** ✅
4. **closed 态撤销成功：200，状态回 pending_verify，快照清除** ✅
5. 撤销后新增 `undo` 审计记录，`undoOfId` 指向被撤销的状态变更 ✅
6. 撤销后可再次推进到 closed 并重复撤销 ✅
7. 连续两次撤销失败（撤销本身不可撤销）✅

### 返工复核流程
8. **非创建人非管理员申请复核被拒（400）** ✅
9. **创建人申请复核成功（201），状态 pending** ✅
10. **重复申请被拦截（400），同一工单不可并发多条** ✅
11. **申请人撤回成功（200），状态 withdrawn** ✅
12. **撤回后可再次申请** ✅
13. **非管理员审批被拒（400）** ✅
14. **管理员审批通过：工单回到 pending_verify，生成回退审计记录** ✅
15. **管理员审批拒绝：工单保持 closed，记录审批意见** ✅

### 持久化与一致性
16. SQLite 持久化：重启后申请状态与审计不丢失 ✅
17. CSV 导出含返工申请 7 列字段，数据一致 ✅

### 导出批次快照功能（`test-backend-export-batch.mjs`，33 项）
```bash
node test-backend-export-batch.mjs
```
18. **权限控制**：管理员创建成功，非法操作人被拒（400）✅
19. **权限隔离**：技师创建时自动注入 `technicianId` 限制，仅能看自己批次；管理员可看全部 ✅
20. **权限校验**：技师查看管理员的批次被拒绝（400）✅
21. **取消机制**：pending 批次可取消，状态变为 cancelled ✅
22. **取消幂等**：已取消批次再次取消失败（400）✅
23. **重试机制**：取消/失败批次可重试，生成新批次号 ✅
24. **重复拦截**：同一操作人 5 分钟内相同条件重复提交被拦截，错误信息含原因 ✅
25. **状态流转**：pending → processing → completed 自动推进 ✅
26. **数量一致**：exportedCount === totalCount，文件名和文件路径存在 ✅
27. **文件下载**：completed 批次可下载 CSV，内容包含中文表头 ✅
28. **快照存在**：获取快照成功，条数>0，含工单编号、标题、差异标记字段 ✅
29. **差异标记**：工单状态或技师变更后，快照接口返回 `hasStatusDiff`/`hasTechnicianDiff` 标记 ✅
30. **持久化**：多次操作后批次记录仍可查询到 completed 和 cancelled 状态 ✅
31. **快照落库**：快照记录持久化保存 ✅
32. **数据一致性**：批次总数 === 快照条数 === CSV 数据行数 ✅
33. **边界拦截**：cancelled 批次不能下载（400）✅

GUI 验证点：
- 详情页 `status=closed` 时：**撤销按钮可见**、派单面板禁用、无状态推进按钮
- 详情页提示文案包含"关闭后不能改派或直接变更状态，但可使用撤销或申请复核"
- 已关闭工单显示「申请复核」按钮，待审批时显示「撤回」和「审批」按钮
- 「复核/返工记录」卡片展示历史申请及时间线
- 审计日志时间线显示返工相关操作且颜色区分

## ✅ 新增：启动配置与验真工作台

把本地开发环境从手动猜端口改成可复用模块。配置、验真记录全部落库 SQLite，服务重启后仍可查询。

### 🔐 权限控制

- **管理员 (admin)**：可维护公共配置，可查看所有配置，可停止运行中的进程
- **普通用户 (devuser)**：只能管理自己的私有配置；公共配置只读；无权停止进程
- 通过请求头 `x-username` 切换身份（前端 GUI 提供下拉选择器）

### 📋 启动配置字段

| 字段 | 说明 |
|------|------|
| `name` | 配置名称 |
| `scope` | `public` 公共 / `private` 私有 |
| `serviceType` | `frontend` 前端 / `backend` 后端 |
| `command` | 启动命令（如 `npm run server:dev`） |
| `cwd` | 工作目录 |
| `fixedPort` | **固定端口**，启动前强制占用检测 |
| `healthCheckUrl` | 健康检查地址 |
| `startupTimeoutSec` | 启动超时秒数（5-600） |

### 🛡️ 端口冲突拦截

- 创建/编辑配置时，前端实时调用 `/api/devworkbench/ports/:port/check` 检测
- 启动流程第一步先检测端口，若被占用直接返回失败，写入验真记录，**不会触发命令启动**
- 冲突时给出处理建议："请更换端口或停止占用该端口的进程"

### ✅ 双重探活验真

启动后自动执行两轮健康检查，**只有全部通过才算成功**：

| 服务类型 | 页面探活 | 接口探活 |
|----------|---------|---------|
| frontend | ✅ HTTP GET `healthCheckUrl`，期望 200 | ⏭️ 跳过（自动 PASS） |
| backend  | ⏭️ 跳过（自动 PASS） | ✅ HTTP GET `healthCheckUrl`，期望 200 |

- 探活使用轮询（每秒一次）直到成功或超时
- 结果写入 `pageCheckStatus` / `apiCheckStatus` 字段

### 📝 验真记录（持久化）

每次启动都会生成一条 `verification_records` 记录：

- 实际端口、PID、耗时（毫秒）
- 页面/接口探活状态
- 失败原因（如端口占用、超时等）
- **完整时间线**（JSON 数组）：端口检查 → 进程启动 → 页面探活 → 接口探活 → 最终结果

### 🔄 一键套用上次成功配置

- 前端「套用上次成功配置」按钮自动加载最近一条 `status='success'` 的记录
- 自动复制为新的私有配置（名称追加"(副本)"），可直接保存或微调后启动

### 📡 API 接口

所有接口通过 `x-username` 请求头识别用户。

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/devworkbench/users/me` | 查询当前用户信息 | 全部 |
| GET | `/api/devworkbench/users` | 查询所有用户 | admin |
| GET | `/api/devworkbench/configs` | 配置列表（公共+自己私有） | 全部 |
| POST | `/api/devworkbench/configs` | 新建配置 | 全部（公共需 admin） |
| PUT | `/api/devworkbench/configs/:id` | 更新配置 | 所有者 / admin |
| DELETE | `/api/devworkbench/configs/:id` | 删除配置（软删除） | 所有者 / admin |
| GET | `/api/devworkbench/configs/last-success` | 最近成功配置 | 全部 |
| GET | `/api/devworkbench/ports/:port/check` | 检测端口可用性 | 全部 |
| POST | `/api/devworkbench/configs/:id/launch` | 启动服务并执行验真 | 全部 |
| GET | `/api/devworkbench/processes` | 列出运行中 PID | admin |
| POST | `/api/devworkbench/processes/:pid/stop` | 停止服务进程 | admin |
| GET | `/api/devworkbench/verifications` | 验真记录列表 | 全部 |
| GET | `/api/devworkbench/verifications/:id` | 验真记录详情 | 全部 |

### 📊 数据库表

```sql
users (
  id           INTEGER PK
  username     TEXT UNIQUE
  role         TEXT    -- admin/user
  display_name TEXT
  created_at   TEXT
)

launch_configs (
  id                  INTEGER PK
  name                TEXT
  scope               TEXT    -- public/private
  owner_username      TEXT
  service_type        TEXT    -- frontend/backend
  command             TEXT
  cwd                 TEXT
  fixed_port          INTEGER
  health_check_url    TEXT
  startup_timeout_sec INTEGER
  is_active           INTEGER -- 软删除标记
  created_at          TEXT
  updated_at          TEXT
)

verification_records (
  id                 INTEGER PK
  config_id          INTEGER
  config_name        TEXT
  operator_username  TEXT
  pid                INTEGER
  actual_port        INTEGER
  status             TEXT    -- idle/starting/running/verifying/success/failed/stopping/stopped
  page_check_status  TEXT    -- pending/running/success/failed
  api_check_status   TEXT    -- pending/running/success/failed
  failure_reason     TEXT
  timeline           TEXT    -- JSON TimelineEvent[]
  duration_ms        INTEGER
  created_at         TEXT
  completed_at       TEXT
)
```

### 🖥 GUI 功能

- 顶部可快速切换用户身份（admin / devuser），直观演示权限差异
- 运行中的服务卡片：显示 PID、端口、操作人、耗时，管理员可停止
- 配置列表：表格展示类型、范围、所有者、端口、命令，支持启动/编辑/删除
  - 无权限的配置显示「只读」标记
- 验真记录时间线：可展开查看页面探活、接口探活状态和完整事件流
- 新建/编辑配置弹窗：
  - 端口输入后自动检测可用性（绿/红反馈）
  - 非管理员创建公共配置时给出警告并禁用

### 🧪 集成测试

```bash
node test-devworkbench.mjs
```

**覆盖 5 大场景：**
1. 固定端口生效：启动后健康检查命中配置端口
2. 冲突拦截：端口占用时启动失败，记录失败原因
3. 权限差异：普通用户无法修改/删除公共配置，管理员可以
4. 重启后记录保留：验真记录和配置在服务重启后仍可查询
5. 按保存配置再次启动：可一键套用上次成功配置并启动

## 架构

```
前端 (Vite + React + Tailwind + Zustand)
    │  /api 代理
后端 (Express + better-sqlite3)
    │
SQLite 文件: ./data/app.db   # 重启不丢数据
```

### 新增数据表

```sql
rework_applications (
  id              INTEGER PK
  ticket_id       INTEGER FK → tickets.id
  applicant       TEXT    -- 申请人
  reason          TEXT    -- 复核原因
  status          TEXT    -- pending/approved/rejected/withdrawn
  reviewer        TEXT    -- 审批人
  review_comment  TEXT    -- 审批意见
  reviewed_at     TEXT    -- 审批时间
  created_at      TEXT
  updated_at      TEXT
)
```
