# deepsekharnessdem

DSH（DeepSeek Harness）Web 插件示例：**个股智能分析（dsh-stock-analyzer）**。

输入 A 股股票代码或名称（如 `600519` / `贵州茅台`），基于同花顺与东方财富公开数据输出：

- 行情与估值（现价、涨跌幅、PE/PB、市值、52 周区间）
- 全部技术指标（MA / MACD / KDJ / RSI / BOLL / ATR / BIAS / 量能 / 支撑压力）
- 四档资金流与主力动向 + 东方财富 5/10/20 日资金流
- 所属行业、板块排名、同行个股（**点击同行可查看该公司完整分析**）
- 关联概念股与关联板块（**全部概念**，今日 / 近 5 日涨跌为板块指数精确值，展开查看成分股并支持点击查看完整分析）
- F10 财务诊断与基本面
- 公司公告、相关资讯、同花顺热榜与概念题材
- 规则化投资建议（评分、评级、操作、仓位、关键价位、风险）

## 结构

```
stock-analyzer/          插件包（Host + Client + 解析层 + 测试 + 文档）
_probe/                  同花顺页面样本（供解析层测试使用）
```

## 安装（DSH）

在 DSH 中执行：

```
plugin_manager install_bundle  target: <本仓库路径>/stock-analyzer
```

安装后：侧边栏出现「个股分析」图标；Agent 获得 `stock_analysis` 工具；HTTP 接口 `/dsh-stock/analyze.json`、`/dsh-stock/search.json` 可用。

## 测试

```powershell
node stock-analyzer/test/parse-check.mjs   # 页面解析 110 条断言
node stock-analyzer/test/smoke.mjs 600519  # 不安装插件跑通全链路
```

详细说明见 [stock-analyzer/README.md](stock-analyzer/README.md)，数据契约见 [stock-analyzer/CONTRACT.md](stock-analyzer/CONTRACT.md)，版本变更见 [CHANGELOG.md](CHANGELOG.md)。

## 数据源与免责声明

数据来自同花顺与东方财富公开接口。分析由规则模型生成，**仅供参考，不构成投资建议**。
