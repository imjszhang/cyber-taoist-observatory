# v0.2 → v0.2.1：保留数据的补丁升级

## 修复什么

报告中的两次请求已经收到模型返回，失败发生在本地逐字引文校验：多段原文被分号连接，或增加了外层引号，整段不再是一个连续子串。

本版逐段核对，不做模糊匹配。若引文里有不存在于原文的片段，仍拒绝本次新结果，不以 UNKNOWN 悄悄掩盖 OBSERVED 的伪造依据。洞见的引文也使用同一校验。UNKNOWN 中的旧版“无直接描述”等说明会显示为未匹配说明，不作为引用。

这份补丁基于交付的 v0.2 压缩包及问题报告。没有访问你机器上真实的 `.tao-lab`，没有代你修改或恢复本地实验。测试里的完整六象对象是根据报告构造的回归夹具，不是原始模型 trace。

## 1. 先保留本机状态

停止旧服务器，备份旧项目中的 `.env` 和 `.tao-lab`。若原来配置了 `TAO_LAB_HOME`，备份它实际指向的目录。

解压 v0.2.1 到一个新目录。将自己的旧 `.env` 复制到新目录，**不要用示例文件覆盖 API Key**。

在新目录的 `.env` 中设置旧数据目录的绝对路径，例如：

```dotenv
TAO_LAB_HOME="/absolute/path/to/old-project/.tao-lab"
```

已有外置数据目录就继续使用原路径。不要同时启动两个服务器读写同一个目录。也可以在停止服务后把整个旧 `.tao-lab` 复制到新项目；两种方式只选一种。

## 2. 长思考的配置选择

本版新增可选参数透传。**默认不改变模型名、提供方的思考模式或 token 预算**，不存在隐藏的“失败后改参数重试”。

请求超时默认 180000ms；可设 1000–600000ms。旧 `.env` 写的 45000 或 120000 仍会生效，升级不会偷偷改它。参数配置错误会在发请求前报错，设置页可查看实际配置。

针对支持这些参数的 DeepSeek Chat Completions 接口，可以让“定位”关闭思考，而保留“洞见”的原配置。在自己的 `.env` 中添加或修改：

```dotenv
TAO_LLM_TIMEOUT_MS=180000
TAO_LLM_MAPPING_THINKING=disabled
TAO_LLM_MAPPING_REASONING_EFFORT=default
TAO_LLM_MAPPING_MAX_TOKENS=4096
```

`default` 表示该阶段不发送 reasoning_effort，避免继承全局 high 后与 disabled 冲突。没有支持证据的其他提供方，请不要盲目加 DeepSeek 专属 thinking 字段。

需要保留定位思考时，可以改为（与上面的配置二选一）：

```dotenv
TAO_LLM_MAPPING_THINKING=enabled
TAO_LLM_MAPPING_REASONING_EFFORT=low
TAO_LLM_MAPPING_MAX_TOKENS=8192
TAO_LLM_MAPPING_TIMEOUT_MS=240000
```

token 上限是示例预算，不保证对所有任务足够；包含思考的输出可能触顶。触顶会记录 `LLM_OUTPUT_TRUNCATED`，不把截断 JSON 当成完整成功。低延迟也不保证洞见质量相同，测试 Protocol 时应记录这些参数。

各阶段都可覆盖 `THINKING`、`REASONING_EFFORT`、`TEMPERATURE`、`MAX_TOKENS`、`MAX_COMPLETION_TOKENS`、`TIMEOUT_MS`：

```text
TAO_LLM_*           全局
TAO_LLM_MAPPING_*   定位覆盖
TAO_LLM_INSIGHT_*   洞见覆盖
```

`MAX_TOKENS` 与 `MAX_COMPLETION_TOKENS` 只选提供方支持的一种，不要同时设置。额外参数不兼容时不静默删除参数重试，应人工核对提供方要求。

资料核对：DeepSeek 官方 Thinking Mode 文档，访问日期 2026-09-26。该文档确认 thinking 开关与 reasoning_effort 参数；这里没有对你的网关进行带密钥的兼容性或性能测试。

```text
https://api-docs.deepseek.com/guides/thinking_mode/
```

## 3. 启动并查看原来的局

在新项目根目录：

```bash
npm run lab:start
```

浏览器打开原来的地址（端口不变时）：

```text
http://127.0.0.1:4174/lab
```

报告中已经人工回写成功的那一局会照常读取；无需再调用模型，也不需要强制覆盖。原有 `invalid` trace 会继续保留。

## 4. 仍未恢复的失败局：先复用旧返回

网页打开对应信息，失败面板中点击 **“重新校验旧返回 · 不调用模型”**。

等价 CLI：

```bash
node lab/cli.mjs recover RUN_ID TRACE_ID --observation OBS_ID
```

报告中这条命令仅在对应 trace 仍保存在你机器上、并且该局尚未回写时需要使用：

```bash
node lab/cli.mjs recover run_muhupt08_43c3f638 trace_muhusvfr_4c7974e6 --observation obs_muhupt0e_93a80476
```

成功会新增 `observation.mapped` 事件，并记录 `recoveredFrom` 和 `modelCalled:false`。原 trace 的状态、原文、返回和耗时不改。

已有定位时返回 `RECOVERY_CONFLICT`，表示保护现有结果，不是新的展开故障。只有确实要覆盖时才加 `--force`；它不会自动重新生成旧洞见。恢复洞见则追加版本，不删除旧版本。

恢复不会修补推理内容、不会替换单词、不会生成缺失的 JSON，也不会给模型发修复请求。找不到完整返回、输出截断、来源不匹配或仍有伪造片段时，会明确拒绝。此时才能考虑另一条“调用模型重试 · 可能计费”的路径。

## 5. 看得见的状态变化

- 等待：已经等了多久、当前服务端超时上限；不显示虚构完成百分比。
- 返回后校验失败：给出具体字段与失败片段，不再只停在未翻牌状态。
- 恢复：明确标记无模型调用；重复恢复复用已有结果。
- 引文：各段独立展示，并显示 UTF-16 原文索引 `[start,end)`。片段之间的省略内容不伪装为原文相邻。
- 内容匹配只是引文检查，**不证明来源的说法真实，也不证明模型推断成立**。

## 版本与验证边界

宪章、Protocol v0.1、11 张牌面和动画脚本保持不变。新的模型输出契约在适配器内更新，trace 记录 adapterVersion / validatorVersion / requestHash，避免同一个 protocolHash 隐藏不同运行配置。

本版在 Linux + Node.js 22.16.0 测试；未用真实商业模型密钥调用，也未在 macOS / Windows 原生运行。浏览器由于本环境限制通过渲染桥接验证，详见 TEST-REPORT.md。
