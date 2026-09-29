# v0.4.0 验证报告

日期：2026-09-29。Node.js 22.16.0；Python Playwright + Chromium。所有服务使用临时目录、虚构输入、测试结果夹具或本地模型替身，不读写用户的生产实验目录。

## 结果

| 检查 | 本次结果 |
|---|---|
| `npm run lab:check` | 原模块和 5 个新 Agent/MCP 模块语法检查通过 |
| 原 Node 回归 | 70 项通过 |
| Agent API / 会话 / CLI 新增 | 38 项通过 |
| MCP stdio 真实子进程 + 原生 SSE | 11 项通过 |
| **Node 合计** | **119 通过，0 失败，0 跳过** |
| 原 UI 回归重新执行 | 31 项通过 |
| 外部 Agent UI 验收 | 20 项通过 |
| **UI 合计** | **51 项通过，无捕获的浏览器 JS 异常** |
| 外部驱动 UI 全流程的 Lab 模型调用 | **0**，即使测试服务配置了可用模拟模型端点 |
| 原内置 LLM UI 回归 | 2 次本地替身调用，显式选择/确认，非商业模型 |

原始结果：`tests-v0.4.0.tap`、`UI-AGENT-RESULTS.json`、`UI-REGRESSION-RESULTS.json`。旧版报告与旧快照已用版本号保留，不与本次数量混合。

## 外部通路实际覆盖

### 会话与权限

单次配对 / 过期 / 重复兑换 / 限流；持久化不包含原始 accessToken；连接文件 0600；Observer/Analyst/Operator 区分；单局范围；实际其他 run 的 observation 拒绝；Guided 不能自行排队；Autopilot 有任务总预算；有效期限制；撤销立即失效；明确切回本机才恢复内置驱动。

配对状态只代表桥接心跳，模型/客户端自述元数据不作为身份认证。API 权限不是同机 shell 沙箱；该边界在页面与文档中说明。

### 任务与结果

真实理论快照与原文交付；待办去重；两个并发领取只成功一个；续租、交回、租约超时重新领取；错误 claim/context 拒绝；实际协议内容变化但旧 hash 字段未变仍判 stale；取消后迟到写入拒绝；重复幂等回执不重复落牌；同键不同答案冲突。

结构、逐段引文、N 状态与未知字段校验；被拒结果入审计；可修正重交；三次拒绝后失败；成功 mapping/insight 写入原有六象、洞见和 hypothesis 结构；外部证据标注 external_agent，不伪造人工评分。

有效配对凭证与未到期已领取任务在真实服务重启后可继续；未使用配对码重启失效。普通读取保持 run 文件字节不变。

### MCP / CLI

真正 spawn `lab/mcp.mjs`，通过 stdin/stdout JSON-RPC 执行初始化、版本协商、工具列表、资源读取、prompt、工具调用、取消等待、宿主子进程重启和 EOF 关闭。stdout 只包含协议消息。工具错误 `isError` 与协议错误分别检查。

MCP 工具完整完成：读取上下文 → 领取 mapping → 提交 → 领取 migration insight → 提交 → 写入 hypothesis。测试生成的是**固定结果**，不是某个 AI 的真实思考。真实 HTTP `/api/events` 收到外部提交后的 `run.changed`；不会重新跑分析。

CLI 真正完成创建会话、私有配对、读取上下文、领取、结果提交与读取持久状态。返回同一局 viewerUrl 便于宿主打开网页；不内置浏览器遥控。

### 网页

独立连接面板、默认 Guided/Analyst、四种连接模板、实际端口/安装路径、私有配对状态、排队与领取区别、校验失败与修正后六象落牌、人工选牌再明确探索、外部洞见不抢阅读焦点、独立阅读页、人工评分与 Agent 证据署名、接受/拒绝提交审计、取消/撤销确认、明确切回本机。

新连接页在 1440×1024、768×1024、390×844、360×800 检查无横向溢出。旧牌桌/阅读回归另覆盖 1440×900、1280×800、768×1024、390×844、360×800；保留原卡牌/动画/恢复/导入/导航检查。

## 环境限制：不要误读成全面认证

本环境 Chromium 原生导航 localhost 返回 `ERR_BLOCKED_BY_ADMINISTRATOR`。没有改变浏览器策略。UI 使用原有 `render_bridge.py`：加载实际 HTML/CSS/JS/素材，在 about:blank 渲染，API 经 Python 转发给真正的临时 Node 服务。History 与 EventSource 在该模式下被替代，网页联动使用原有轮询回退。

因此 **未完成浏览器原生 CSP/地址栏历史/SSE 的全链路 UI 验证**；静态资源响应、Host/Origin/JSON 限制和原生 SSE 接口由独立 Node 测试覆盖。截图是实际渲染的界面与固定测试数据，不是设计稿，也不是某个品牌 Agent 实际推理的证明。

**未登录真实 Codex / Claude Code / Cursor / OpenClaw，未调用真实商业模型，未用官方 SDK/Inspector 做额外认证。**本版提供标准 stdio profile 与配置模板，不承诺所有宿主版本的安装行为。没有 Safari/Firefox/实体手机或完整无障碍认证。

这些测试验证实现、边界和联动，不验证理论正确性、洞见新颖性、真实 Agent 遵守 Protocol 的程度或不同模型优劣。

## 重现

```bash
npm run lab:check
npm test
# 以下开发测试额外需要 Python Playwright 与 Chromium
python tests/ui_smoke.py --chromium /path/to/chromium
python tests/ui_agent_smoke.py --chromium /path/to/chromium
# 本次受限环境使用
python tests/ui_smoke.py --bridge --chromium /usr/bin/chromium
python tests/ui_agent_smoke.py --bridge --chromium /usr/bin/chromium
```

运行应用、CLI 或 MCP 不需要上述 Python/浏览器测试依赖。所有 Node 测试只用内置模块。

## 发行包验收

独立解压、哈希核对、语法检查、119 项 Node 重跑、真正启动后 CLI→Agent→六象→洞见→导出的最终结果，见同目录 `PACKAGE-CHECK.json`。独立重跑不重复计入上表数量。
