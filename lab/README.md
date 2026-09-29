# Lab v0.4.0

应用入口：`node lab/server.mjs`，通常从项目根目录运行 `npm run lab:start`。

- `server.mjs`: 本机 HTTP / 状态 / 原内置 LLM / SSE。
- `engine.mjs`, `evidence.mjs`, `llm-config.mjs`: 原游戏对象、逐段引文核验和模型配置。
- `agent-contract.mjs`: Agent API schema 和任务说明。
- `agent-service.mjs`: 会话、配对、权限、租约、冻结上下文、幂等和提交核验；无模型调用。
- `agent-client.mjs`: 本机限定的认证 HTTP 客户端、私有凭证文件。
- `mcp.mjs`: 依赖为零的 stdio MCP 桥接；宿主 AI 必须主动调用。
- `agent-cli.mjs`: 对应的 CLI；由 `cli.mjs agent ...` 调用。
- `public/`: 分层网页 / 卡牌 / 动画 / 新连接页。

完整步骤见根目录 [README](../README.md)、[Agent 接入](../docs/AGENT-CONNECTION.md)、[API](../docs/AGENT-API.md) 和 [AGENTS.md](../AGENTS.md)。
