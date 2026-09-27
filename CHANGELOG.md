# v0.2.1 · 六象引用与恢复补丁

- 引文改为逐段精确核对：优先接受字符串数组，兼容分号、中文分号和换行分隔的旧字符串。仅当内部全文存在于原文时移除成对外层引号，保留原文真实引号；不支持改写、模糊匹配或省略号拼接。
- 保存 evidenceSegments 与 UTF-16 原文索引；定位牌和洞见牌均以分段形式显示，标明省略内容及“匹配不等于已证实”。UNKNOWN 旧说明不冒充引文。
- 新增 POST traces/:id/recover 和 CLI recover。只校验已保存的最终 JSON；绑定原观测，原 trace 不变，新增 recoveredFrom 事件，默认拒绝覆盖已有结果；重复恢复幂等。
- 模型请求显式透传可选 thinking / reasoning_effort / token 参数，允许定位与洞见分别设置；默认不改变模型或思考模式，不做自动重试。
- 默认超时 180 秒；可配置 1–600 秒，不再静默截为 120 秒。旧配置继续生效。记录有效参数、最终内容、usage、finish_reason、返回模型名和请求 hash；不保存模型私有思考内容。
- 区分 HTTP、超时、空最终内容、token 截断、JSON 无效、引文不匹配。失败不会倒改此前成功 trace，已有定位与洞见保留。
- 网页增加持久错误和等待面板、无调用恢复、单独确认的模型重试、设置只读诊断。原 11 张卡面及动效不变。
- 未改宪章、Protocol 文本、旧 run 与原始材料；不自动把历史失败改写为成功。
- 59 项后端/CLI 测试通过；16 项原有 UI 和 12 项补丁 UI 检查通过。UI 采用受限浏览器下的渲染桥接，真实 SSE 另由 Node 测试验证。未调用带真实密钥的商业模型。

---

# v0.2.0 · 观天牌桌

## Visual and interaction

11 illustrated cards, one shared illustrated back, gold/ink styling, orbit layout, card dealing and 3D flips, pointer tilt and foil, selected-card elevation, ambient stars, particle feedback and opt-in synthesized audio. Added four-step guidance, evidence-side card inspection, result reveals, library, journal and timeline. Responsive desktop/mobile layout and reduced-motion support. No randomness is used to determine conclusions.

## Functional corrections and preservation

Preserved the original Protocol v0.1 without edits. Included verified Constitution v1.0.1 snapshot and actually assembled both into live requests. Added explicit demo/template/live mode labels and a live-model switch, rather than hard-coding `allowLive:false` in the UI. Added a specific fictional teaching case, while keeping generic baseline output visibly limited.

Added actual browser updates through SSE plus fallback reads, atomic JSON writes, per-run write serialization, result reuse, strict schemas and error traces, source quote checks for OBSERVED mappings, evidence attachments, and branches with clean analysis state. Old v0.1 records remain readable. Removed package scripts pointing to absent `tools/` files in the v0.1 standalone ZIP.

## Still intentionally out of scope

No automatic web scraping, OCR/PDF ingestion, auto-verification of hypotheses, scientific quality scores, hidden reasoning extraction, background agents, comprehensive blind A/B scoring, or production deployment. A live provider has not been exercised with real credentials in this build; mock adapter tests cover its HTTP/JSON contract.
