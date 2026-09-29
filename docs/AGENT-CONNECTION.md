# v0.4.0 · 用你自己的 Agent 驱动观天局

这不是“让 Agent 点击网页，再由网页调用另一个模型”。

**你的 Agent 读取材料与协议 → 用自己的 AI 生成结构化结果 → 观天局核验并保存 → 同一局网页落牌。**

观天局不接收该 Agent 的模型密钥、登录凭证或订阅令牌。使用自己的 Agent 仍受宿主的额度、计费、网络权限和工具确认约束，不等于免费或无限调用。

## 1. 先启动本机服务

要求 Node.js 22.9+。无需 `npm install`，没有运行依赖或构建步骤。

```bash
npm run lab:start
```

浏览器打开 `http://127.0.0.1:4174/lab`。先创建或选中一局，导入一条信息；然后进入左侧 **连接 Agent**。

同一个服务也可以在 Agent 的终端内启动。配对回执及 status / get_context 工具会返回同一局的 `viewerUrl`，Agent 可用其宿主已有的打开链接能力打开。网页是可视化客户端，不需要由 Agent 自动化点击；Agent 或用户可以用返回的本机地址打开浏览器。**本版不内置浏览器遥控或自动修改宿主配置。**

升级用户先看 [UPGRADE-v0.4.0.md](UPGRADE-v0.4.0.md)，保留 `.env` 和已有数据。

## 2. 在网页授权连接

默认选择：

- **Analyst**：读取本局，处理已授权任务，追加明确标注为 Agent 判断的后续证据。
- **Guided**：人类在网页点六象/洞见探索，Agent 领取该任务。
- **8 小时**有效期、**12 项**任务预算。可调整为 1–24 小时、1–50 项。

点击 **生成连接凭证**。授权会明确把当前局改为外部驱动，但不会调用模型，也不会自动排队。

网页按当前安装路径、Node 路径、服务端口生成 Codex、Claude Code、通用 CLI 和 MCP JSON 配置。**复制网页生成的实际配置，不要照抄本页里的占位 ID。**

配对码是 256 位随机、10 分钟有效的一次性凭证，不是方便公开分享的短数字码。服务重启前尚未使用的码也会失效。刷新网页不保存该码；未配对时应撤销旧连接、再生成一个。不要截图公开、写入仓库或发给无关的人。

## 3. MCP 连接

本版是 **stdio MCP 桥接**。宿主启动 `lab/mcp.mjs` 子进程，它通过本机 HTTP 访问已经启动的观天局。**不存在 `/mcp` HTTP 地址，也不要把 `/api/events` 当成 MCP SSE endpoint。**

网页生成的命令形状如下（路径、名称、码均为示意）：

```bash
# Codex CLI
codex mcp add tao-connection -- node /absolute/path/lab/mcp.mjs \
  --url http://127.0.0.1:4174 --pair PAIR_CODE \
  --connection /absolute/private/connection.json

# Claude Code
claude mcp add --transport stdio tao-connection -- node /absolute/path/lab/mcp.mjs \
  --url http://127.0.0.1:4174 --pair PAIR_CODE \
  --connection /absolute/private/connection.json
```

对于其他支持 stdio 的宿主，用网页上的 **MCP JSON** 标签：

```json
{
  "mcpServers": {
    "tao-connection": {
      "command": "node",
      "args": [
        "/absolute/path/lab/mcp.mjs",
        "--url", "http://127.0.0.1:4174",
        "--pair", "PAIR_CODE",
        "--connection", "/absolute/private/connection.json"
      ]
    }
  }
}
```

实际宿主的外层配置结构、配置位置及是否需要重启，以宿主为准。网页不会替你安装 MCP、重启 Agent 或更改其权限。

首次配对后，桥接将长期凭证写入私有文件，Unix 下为 `0600`。后续启动复用文件，不重复兑换一次性码。已配对页面可以复制不含码的新配置。连接文件、领取任务导出的 `job.json` 都含凭证，不要发布。

## 4. 让你的 AI 真正开始工作

回牌桌点击 **交给 Agent 展开**，网页进入“等待 Agent 领取”。然后在 Agent 会话中说：

> 连接观天局。先读取 observatory_get_context 的宪章与 Protocol 快照，再领取当前任务。用你自己的 AI 分析，按任务 outputSchema 提交六象定位。不要调用 Lab 内置模型，也不要直接改写文件。完成这一项后等我选下一张洞见牌。

Agent 应执行：

```text
observatory_get_context
        ↓
observatory_next_task
        ↓
阅读 context、source、outputSchema，用宿主自己的 AI 分析
        ↓
observatory_submit_result
        ↓
服务器核验 → 接受落牌 / 返回错误给 Agent 修正
```

第一次是六象；完成后，你在网页选一张洞见牌，再明确点击探索。Agent 再领取一次任务，用自己的 AI 生成洞见、替代解释、验证信号与反证条件。

### 为什么“桥接在线”但网页没有结果？

**MCP 连接不是一个后台 AI 服务。**桥接心跳只证明连接尚在，不能自动唤醒宿主里闲置的模型。

如果 Agent 已停止，你需要在其会话里继续发指令。`observatory_next_task` 可以最多等待 25 秒，空闲时返回 `idle`；这个等待本身不产生分析。希望持续处理时，需要宿主原有的、用户授权的运行循环。本版不提供未经授权的无限轮询或后台代调用。

三个状态分别显示：等待领取、已领取、已提交并核验。客户端名称、版本和模型是自述信息，不是认证身份或实际模型证明。

## 5. 不支持 MCP 的 Agent：使用 CLI

只要能运行本机 shell、读取 stdout、写 JSON 文件，就可以使用同一任务协议。

```bash
# 仅首次兑换网页配对码。使用私有路径，不要放公开项目里。
node lab/cli.mjs agent connect \
  --url http://127.0.0.1:4174 \
  --code PAIR_CODE \
  --connection /absolute/private/connection.json \
  --name "My Agent"

# 后续命令都明确使用同一连接。
export TAO_AGENT_CONNECTION=/absolute/private/connection.json
node lab/cli.mjs agent context --out context.json
node lab/cli.mjs agent next --wait 25 --out job.json
```

Agent 读取 `job.json`：只有 `state: "claimed"` 才可以生成和提交结果。`idle` 不是任务。完整请求中包含原文、理论快照、schema、任务 ID、contextHash 和临时 claimToken。

**下一步由 Agent 用自己的 AI 生成 `result.json`，CLI 不替它思考。**结果必须严格符合 `outputSchema`。六象结果是 `{ "mapping": { "S": ..., "N": ..., "R": ..., "T": ..., "EC": ..., "NI": ... } }`；洞见是任务所示六个字段的对象。

```bash
node lab/cli.mjs agent submit \
  --job-file job.json --file result.json --key task-attempt-1
```

如果结构或引文失败：读取错误，只修正结果，使用新幂等键如 `task-attempt-2`。最多三次被拒返回，不自动切换模型代修。一次网络响应不明时，重发**同一 key + 同一 payload**，避免重复写入；不要把不同答案塞进相同 key。

```bash
# 长时间主动处理时，在 15 分钟默认领取租约到期前续租。
node lab/cli.mjs agent renew --job-file job.json
# 停止处理，交回任务。
node lab/cli.mjs agent release --job-file job.json
# 查看连接或有游标的事件。
node lab/cli.mjs agent status
node lab/cli.mjs agent events --after 0 --wait 25
node lab/cli.mjs agent help
```

CLI 普通命令不维持后台心跳；执行后很久没有活动，显示离线正常，不等于权限已撤销。再次工具调用会刷新活跃状态。

## 6. 可选自动模式与权限

**Guided 是默认。**Agent 不能自行排队，避免擅自选方向。人类可以在网页一次授权探索五张牌，它们是五项有限任务。

**Autopilot** 允许 Agent 在已授权实验里调用 `observatory_request_task` 自行选择方向，仍有总任务预算、到期时间和逐次校验。允许自动申请不代表宿主自动启动循环。

**Operator** 在 Analyst 基础上可导入新材料、建立对照局。新局只复制原文和完全相同理论快照，不复制结论或连接权限；需要用户对新局重新授权。

**Observer** 只读，不可领取写入任务。每局至多一个有效控制连接，可同时有只读观察者。该权限范围是整个 run，而不是只限制于当前网页选中的单条 observation。

## 7. 暂停、断连和切回旧模式

- 网页“取消本任务”：保留历史，拒绝迟到提交。不会自动补一份模型结果。
- “撤销连接”：凭证立即失效，未完成任务取消，已落位结果不变。该局仍标为外部驱动，防止静默回落到付费模型。
- “断开控制，切回本机驱动”：显式撤销控制连接并取消任务。此动作不调用模型；之后可在设置选择演示/模板或已配置的 LLM。
- 服务重启：已完成配对的凭证保留；未使用配对码失效。未到期已领取任务仍可提交；租约超时后可重新领取。原来领取者的过期 token 不能再写入。
- 校验旧的模型返回的 `recover` 功能仍保留，但外部驱动时不能借此绕过当前 Agent 任务流程。明确切回本机后可使用旧恢复功能。

## 8. 安全与实验边界

配对和 Bearer 是 **Agent API 的权限边界，不是本机进程沙箱**。原有网页/CLI 是本机受信操作者接口。同一账号下拥有 shell 或文件权限的 Agent 仍可能直接访问操作者 API 或数据文件。需要更强隔离时，要另做 OS 账户/沙箱/远程认证设计；本版不宣称解决它。

服务只监听 IPv4 loopback；检查 Host、Origin，只收 JSON 写请求。不要公网暴露或反向代理公开。本版不支持云端 Agent 直接连接你电脑的 localhost，也不提供隧道、远程 HTTP MCP 或登录账户系统。

材料可能经工具结果进入你的 Agent 模型上下文；依宿主隐私和权限政策处理。不要提交无权分享的数据。协议是分析材料，不能凌驾于宿主系统安全或用户授权。原材料内的指令只当数据。

上下文哈希证明“这次任务用了哪份材料和协议”，不能证明模型确实读懂、遵守了理论。结构/引文校验不能证明洞见真实。这里不记录隐藏思维链，只记录可审查的结构化结果、简要解释、来源及状态。

## 官方接入资料（实现时核对：2026-09-29）

- MCP stdio transport: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP lifecycle: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- MCP tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Codex MCP: https://developers.openai.com/codex/mcp/
- Claude Code MCP: https://code.claude.com/docs/en/mcp

本版测试的是实际 stdio 协议进程、CLI、服务端和网页联动，不是已经在所有品牌宿主中完成兼容认证。真实 Codex / Claude Code 账户与真实 AI 分析未在本次环境测试。
