#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22.9 或更新版本。"
  read -r -p "按回车结束。"
  exit 1
fi
npm run lab:start
