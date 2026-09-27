# Cyber-Taoist Observatory Lab v0.1

用于测试 Cyber-Taoist GUIDE/PROTOCOL 的信息分析游戏实验台。前台采用“牌阵”交互；后台是可回放、可分支、可审计的 run。

## v0.1 闭环

1. 导入外部文本/来源；2. S/N/R/T/EC/NI 定位阵；3. 五个固定 Insight Operators；4. 洞见转假说；5. 验证信号；6. 人类三态反馈；7. run 保存/分支/导出；8. Web 与 CLI 操作同一服务器状态。

“抽牌”不随机。默认 baseline 是确定性实验基线；真实 LLM 只有服务器启用且命令显式 `--allow-live` 才调用。

## 运行

```bash
npm run lab:start
# http://127.0.0.1:4174/lab
```

CLI：

```bash
node lab/cli.mjs capabilities
node lab/cli.mjs create --title "AI 信息观测"
node lab/cli.mjs ingest RUN_ID --file article.txt --source https://example.com
node lab/cli.mjs map RUN_ID OBS_ID
node lab/cli.mjs insight RUN_ID OBS_ID --operator gap
node lab/cli.mjs insight RUN_ID OBS_ID --operator all
node lab/cli.mjs feedback RUN_ID INSIGHT_ID --rating insightful
node lab/cli.mjs branch RUN_ID --protocol v0.2
node lab/cli.mjs export RUN_ID
```

## LLM 接入

使用 OpenAI-compatible `messages` JSON 形状的 HTTP endpoint；Lab 不绑定具体厂商。

```bash
TAO_LLM_ENABLED=1 \
TAO_LLM_URL=https://your-endpoint.example/v1/chat/completions \
TAO_LLM_MODEL=your-model \
TAO_LLM_KEY=... \
npm run lab:start

node lab/cli.mjs insight RUN_ID OBS_ID --operator absence --allow-live
```

默认不会因为配置了 key 就自动调用模型。

## 状态与实验纪律

服务器是唯一权威状态，保存在 `.tao-lab/runs/*.json`。Web 只读取/操作同一 run；读取不会推进实验。原始输入永久保留在 run 中，分析结果不能覆盖原文。同一 observation 可通过 branch 用不同 protocol 重跑，为后续 Protocol A/B 留接口。
