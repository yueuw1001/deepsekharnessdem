# dsh-stock-analyzer 数据契约（Host ↔ Client）

插件包名：`dsh-stock-analyzer`（DSH Web 插件，Host + Client 两半）。

- Host：`index.js`（同花顺抓取、东方财富第二数据源、指标计算、规则化投资建议、HTTP 接口、Agent 工具）
- 页面解析：`ths-pages.js`（纯函数，无网络）
- Client：`client.js`（`window.__ModuleLoader__.load` 格式，注册 `main` 面板 + `sidebar.panellist` 图标）
- 分析结果同时供 HTTP 接口与 Agent 工具 `stock_analysis` 使用。

## HTTP 接口（Host 注册到 webServer）

### `GET /dsh-stock/search.json?q=<代码或名称片段>`

```json
{ "ok": true, "error": null, "items": [ { "code": "600519", "name": "贵州茅台", "market": "SH" } ] }
```

- `q` 支持 6 位代码、`sh600519`/`sz000001`/`bj920xxx`、带后缀 `600519.SH`、中文名称或名称片段。
- 最多 10 条；找不到返回 `items: []`。

### `GET /dsh-stock/analyze.json?q=<代码或名称>&refresh=1`

`refresh=1` 强制刷新（跳过 5 分钟缓存）。恒返回 HTTP 200，用 `ok` 区分成功/失败。

```jsonc
{
  "ok": true,
  "error": null,              // 顶层失败原因
  "warnings": ["东方财富：资讯接口暂不可用"],
  "meta": {
    "generatedAt": "2026-10-18T08:10:00.000Z",
    "tradeDate": "2026-10-16",
    "quoteAt": "2026-10-16 15:30",
    "cached": false,
    "stale": false,
    "elapsedMs": 3200,
    "sources": [
      { "id": "ths", "label": "同花顺", "ok": true, "note": "行情/资金/K线/F10/行业/热榜" },
      { "id": "eastmoney", "label": "东方财富", "ok": true, "note": "资金流/财务/公告/资讯" }
    ]
  },
  "query": { "raw": "贵州茅台", "code": "600519", "name": "贵州茅台", "market": "SH", "board": "主板" },

  "quote": {
    "code": "600519", "name": "贵州茅台", "market": "SH", "board": "主板",
    "price": 1329, "preClose": 1312.97, "open": 1311.57, "high": 1329.88, "low": 1301.68,
    "avgPrice": 1311.57, "change": 16.03, "changePct": 1.22, "amplitude": 2.148,
    "amount": 5075528300, "volume": 3850175, "turnoverRate": 0.308, "volumeRatio": 1.102,
    "peTTM": 18.66, "peDynamic": 18.66, "pb": 6.612, "eps": 35.57, "bvps": null,
    "totalMv": 1661358400000, "circMv": 1661358400000, "high52": 1444.27, "low52": 1181.67,
    "limitUp": 1444.27, "limitDown": 1181.67, "outerVol": 1964096, "innerVol": 1304539,
    "quoteAt": "2026-10-16 15:30", "stockStatus": "闭市"
  },

  "funds": {
    "superNet": 72527699.62, "largeNet": 231688789.7, "mediumNet": -220237.63, "smallNet": 195429431.3,
    "mainNet": 304216489.3, "mainNetRatio": 5.99, "netRatio": 9.5,
    "estimated": false, "outerVol": 1964096, "innerVol": 1304539
  },

  "technical": {
    "bars": { "count": 6022, "from": "2001-08-27", "to": "2026-10-16" },
    "ma": { "ma5": 1312.1, "ma10": 1308.4, "ma20": 1295.2, "ma60": 1280.5, "ma120": 1266.3, "ma250": 1240.8 },
    "macd": { "dif": 12.3, "dea": 10.1, "hist": 4.4, "signal": "多头" },
    "kdj": { "k": 62.1, "d": 58.4, "j": 69.5, "signal": "偏多" },
    "rsi": { "rsi6": 58.2, "rsi12": 55.1, "rsi24": 52.4, "signal": "中性" },
    "boll": { "upper": 1350.2, "mid": 1295.2, "lower": 1240.1, "width": 8.5, "position": "中轨上方" },
    "atr": { "value": 28.4, "pct": 2.14 },
    "bias": { "bias6": 1.29, "bias12": 1.68, "bias24": 2.55 },
    "volume": { "avg5": 3200000, "avg20": 3500000, "ratio": 1.1, "signal": "温和放量" },
    "support": 1301.68, "resistance": 1350.2, "stopLoss": 1266.3,
    "trend": { "label": "多头排列", "score": 68, "text": "MA5>MA10>MA20，价格运行于中轨上方，趋势偏强" },
    "items": [
      { "key": "ma", "label": "均线系统", "value": "MA5 1312.10 / MA20 1295.20", "status": "bull", "note": "多头排列" },
      { "key": "macd", "label": "MACD", "value": "DIF 12.30 / DEA 10.10 / 柱 4.40", "status": "bull", "note": "零轴上方金叉" }
    ]
  },

  "finance": {
    "report": "2026年中报", "eps": 35.57, "netProfit": 44517000000, "netProfitYoY": -1.95,
    "revenue": null, "revenueYoY": 1.47,
    "grossMargin": 89.56, "netMargin": 50.75, "roe": 16.75, "debtRatio": 15.19,
    "profitYoY": -1.95, "cashRatio": 77.94,
    "totalShares": 1250000000, "floatShares": 1250000000,
    "holderConcentration": 67.63, "pledgeRatio": 0,
    "ranks": [ { "item": "毛利率", "rank": "1/20", "text": "本期毛利率89.56%，去年同期91.30%" } ],
    "diagnosis": [ "本期毛利率89.56%,去年同期为91.30%,主营获利能力保持稳定" ]
  },

  "industry": {
    "name": "白酒", "swName": "食品饮料 — 白酒Ⅱ", "code": "881273",
    "changePct": 0.85, "rank": 12, "total": 51, "netIn": 12.3,
    "upCount": 12, "downCount": 8,
    "leader": { "name": "贵州茅台", "code": "600519", "changePct": 1.22 },
    "peers": [ { "code": "600519", "name": "贵州茅台", "price": 1329, "changePct": 1.22, "change5d": 3.21 } ],
    "stockRank": { "rank": 2, "total": 20, "changePct": 1.22 },
    "hotSectors": [ { "name": "半导体", "changePct": 3.2, "netIn": 25.1, "leader": "中芯国际" } ]
  },

  "related": {
    "concepts": [
      {
        "name": "白酒概念", "code": "301496", "boardCode": "885525", "stockCount": 45, "rank": 131, "rankTotal": 390,
        "upCount": 30, "downCount": 15, "changePct": 0.68, "change5d": -2.93,
        "stocks": [ { "code": "000995", "name": "皇台酒业", "price": 14.28, "changePct": 6.81, "change5d": null } ]
      }
    ],
    "sectors": [
      { "name": "白酒", "code": "881273", "kind": "industry", "changePct": 1.95, "change5d": 2.48, "stockCount": 19,
        "stocks": [ { "code": "000995", "name": "皇台酒业", "price": 14.28, "changePct": 6.81, "change5d": 24.72 } ] },
      { "name": "白酒概念", "code": "301496", "kind": "concept", "changePct": 0.68, "change5d": -2.93, "stockCount": 45,
        "stocks": [ { "code": "000995", "name": "皇台酒业", "price": 14.28, "changePct": 6.81, "change5d": null } ] }
    ]
  },

  "news": [
    { "title": "贵州茅台：2026年半年度报告摘要", "url": "https://news.10jqka.com.cn/...", "time": "2026-08-15", "kind": "notice" },
    { "title": "白酒板块走强...", "url": "https://...", "time": "2026-10-16 14:20", "kind": "news" }
  ],

  "hot": {
    "rank": 3, "rate": 135078, "reason": "行业原因：白酒旺季...",
    "concepts": [ { "name": "白酒概念", "desc": "全国两大高端白酒龙头之一..." } ],
    "conceptHeat": [ { "name": "超级品牌", "rank": 1 }, { "name": "白酒概念", "rank": 2 } ],
    "marketNews": [ { "title": "两市成交额突破...", "url": "https://...", "time": "2026-10-16 15:01" } ]
  },

  "advice": {
    "score": 72, "rating": "看多", "action": "回调不破 MA20 可分批布局，仓位 3-5 成",
    "horizon": "1-3 个月", "confidence": "中高", "position": "3-5 成",
    "reasons": [ "均线多头排列，MACD 零轴上方" ],
    "risks": [ "估值处于行业中位偏高，需注意业绩增速放缓" ],
    "levels": { "support": 1301.68, "resistance": 1350.2, "stopLoss": 1266.3, "target": 1400, "buyZone": "1280-1300" },
    "disclaimer": "本分析由同花顺公开数据与规则模型自动生成，仅供参考，不构成投资建议。"
  },

  "eastmoney": {
    "available": true,
    "reason": "",
    "data": {
      "fundFlow": { "main5": 1191318400, "main10": 1999731088, "main20": 622887934, "latestDate": "2026-10-16",
        "days": [ { "date": "2026-10-16", "mainNet": 468661168, "superNet": 43617040, "largeNet": 425044128, "mediumNet": -468206560, "smallNet": -454626, "mainRatio": 9.23, "changePct": 1.22 } ] },
      "finance": { "report": "2026中报", "eps": 35.57, "bps": 200.99, "revenue": 92278072083, "netProfit": 44516880421, "grossMargin": 89.56, "netMargin": 50.75, "roe": 16.75, "debtRatio": 15.19, "revenueYoY": 1.3, "netProfitYoY": -1.95 },
      "notices": [ { "title": "…公告", "url": "https://data.eastmoney.com/notices/detail/600519/AN….html", "time": "2026-08-15", "kind": "notice", "source": "东方财富" } ],
      "news": [ { "title": "…资讯", "url": "https://finance.eastmoney.com/a/….html", "time": "2026-10-18 05:30:46", "kind": "news", "source": "人民日报" } ]
    }
  }
}
```

约定：

- 所有数值字段在数据缺失时为 `null`（不是 0），客户端显示 `—`。
- 金额单位：`amount`/`*Mv`/`netProfit` 为元；`funds.*Net` 为元；`industry.netIn` 为亿元；`netIn` 为板块净流入。
- 百分比字段直接是百分数（`1.22` = 1.22%）。
- 数组字段缺失时为 `[]`，客户端不要假设长度。
- `ok:false` 时只有 `error`/`warnings`/`meta`/`query` 可信。

### Agent 工具 `stock_analysis`

```jsonc
{
  "name": "stock_analysis",
  "parameters": {
    "code": "string，股票代码，如 600519 或 sh600519；与 name 二选一",
    "name": "string，股票名称，如 贵州茅台；与 code 二选一",
    "section": "all | summary | technical | funds | industry | news | advice，默认 all",
    "refresh": "boolean，默认 false"
  },
  "output": { "text": "string（Markdown 文本报告）" }
}
```

## 客户端页面（client.js）

- `main` 槽，key：`stock-analyzer`；`sidebar.panellist` 图标 id：`stock-analyzer`，order：30。
- 页面结构：
  1. 标题区：「个股智能分析」+ 数据源徽标（同花顺 / 东方财富）。
  2. 搜索框（代码或名称）+「分析」按钮 +「刷新」；支持 Enter 提交；最近查询 chips 可选。
  3. 加载 / 错误 / 空态。
  4. 概览卡：名称、代码、板块、现价、涨跌幅、涨跌额、成交额、换手、量比、振幅、PE/PB/市值、52 周区间。
  5. 技术面卡：`technical.trend` 徽标 + 指标网格（`technical.items`）+ 支撑/压力/止损。
  6. 资金面卡：四档净额条（特大/大/中/小）、主力净额与占比、外盘/内盘。
  7. 行业卡：行业名/申万行业/板块涨跌/行业排名/净流入/领涨股/涨停家数；同行 `peers` 表（含今日与 5 日涨跌，行可点击加载该公司完整分析）；`hotSectors` 前 5；「关联概念股」列出**全部可匹配概念**（折叠行显示成分股数/今日/5日，展开显示前 20 只成分股，展开时按需补拉 5 日）；「关联板块」展示行业与全部概念板块的今日/5日涨跌，点击板块行展开成分股，成分股行可点击加载分析。
  8. 基本面卡：报告期、EPS、净利润与同比、毛利率、净利率、ROE、资产负债率、营收增速、股东集中度、质押比例；`diagnosis` 列表。
  9. 消息面卡：`news` 列表（标题可点开新窗口）+ `hot.marketNews`。
  10. 热点卡：`hot.rank`/`hot.reason`、概念 chips（`hot.concepts`）、`hot.conceptHeat`。
  11. 投资建议卡：`advice.rating` 徽标 + 评分环/条 + `action` + `horizon`/`confidence`/`position` + 理由、风险列表 + 关键价位 + 免责声明。
- 全部文案中文；涨用红色（A 股习惯），跌用绿色；跟随主题 token。
- 不引入新依赖，只用 `React`（`createElement`）、`ctx.slots`、`ctx.locale`、`window.fetch`。
- 直接 `fetch('/dsh-stock/analyze.json?q=...')`。
- 样式用 `styles.insert(css)` 注入并在 `apply` 中通过 `ctx.effect` 清理；或直接插入 `<style>` 的 React 元素（unmount 自动移除）。

## 数据源与边界

- 同花顺公开接口：`d.10jqka.com.cn`（realhead / line / time）、`basic.10jqka.com.cn`（F10 页面，GBK）、`q.10jqka.com.cn`（行业板块）、`dq.10jqka.com.cn`（热榜）、`news.10jqka.com.cn`（资讯/公告）。
- 东方财富公开接口：`push2his.eastmoney.com`（资金流历史）、`emweb.securities.eastmoney.com`（F10 主要财务指标）、`np-anotice-stock.eastmoney.com`（公告）、`search-api-web.eastmoney.com`（资讯搜索）；任一不可用时在 `eastmoney.reason` 说明并在 UI 显示「东方财富：…」。
- 资金流口径差异：同花顺四档为逐笔成交金额（四档合计为净流入），东方财富主力 = 超大单 + 大单、四档合计恒为 0；两者分别展示、不互相覆盖，`funds.em` 为东方财富口径的 5/10/20 日主力净流入。
- 同花顺 F10 页面反爬较弱但有频率限制：页面结果缓存 6 小时，行情缓存 5 分钟。

## 实现补充（v1.3.0 实际返回的额外字段）

- `related`：关联概念股与关联板块（**全部可匹配概念**，最多 10 个）。
  - `related.concepts[]`：该股「概念行情贴合度」中所有能在同花顺概念板块索引（`q.10jqka.com.cn/gn/`，约 360 个概念）匹配到的概念。`boardCode` 为同花顺板块代码（形如 885525），`changePct`/`change5d` 由同花顺板块日线（`d.10jqka.com.cn/v6/line/48_<boardCode>/01/last.js`，886xxx 自动回退 `bk_` 前缀）精确计算；`rank`/`rankTotal`/`upCount`/`downCount` 来自板块详情页头部；`stocks` 为该概念涨幅榜前 20 只，其中 `change5d` 大多为 `null`（前端展开时通过 `/dsh-stock/quotes.json` 按需补拉）。
  - `related.sectors[]`：行业板块（`kind: "industry"`）+ 全部概念板块（`kind: "concept"`），`change5d` 同样为板块日线精确值。
  - `peers[].change5d` 为同行前 10 只的 5 日涨跌（服务端预取）。
- 新增接口 `GET /dsh-stock/quotes.json?codes=600519,000995,...`（最多 60 个代码）→ `{ ok, error, items: [{ code, date, close, changePct, change5d, source }] }`，用于前端展开概念/板块时补拉成分股 5 日涨跌；个股数据优先东方财富日线、失败回退同花顺日线。
  - `peers[].change5d`、`stocks[].change5d` 数据来自东方财富日线（前复权），不可用时回退同花顺日线；两者都失败时为 `null`。
- 概念板块详情头部字段：`rank`/`rankTotal` 为板块涨幅排名与板块总数，`upCount`/`downCount` 为上涨/下跌家数。

在契约之上，Host 实际还会返回以下字段，客户端可选用：

- `quote`：`peStatic`（静态市盈率）、`eps`（F10 最新报告期 EPS 或 `price/peTTM` 推算）、`bvps`（`price/pb`）、`stockStatus`、`suspended`。
- `funds`：`netIn`（四档合计净流入，元）；`mainNet` 为「特大单 + 大单」主力净额；`mainNetRatio` 为 `mainNet/成交额`。
- `technical`：`score`（0-100，技术面评分）、`atr`/`bias`/`volume` 为对象。
- `finance`：`epsTTM`、`cashPerShare`、`peDynamic`、`peStatic`、`business`、`area`、`listedAt`、`profile`、`financeTags`。
- `industry`：`total` 为同花顺行业板块总数（约 90，降序 + 升序两页合并）；`peers` 为板块成分股前 10；`stockRank` 为个股在板块内的涨跌幅排名；`leader` 含 `code`（`leaderCode`）。
- `hot`：`conceptHeat` 来自 F10「概念行情贴合度」；`marketNews` 为市场要闻前 6。
- `advice`：`scores`（技术/资金/估值/财务/行业/情绪六个子分）、`confidence` 为「高/中高/中」、`position`、`levels.buyZone`。
- `meta.sources[].note` 人类可读说明；`meta.tradeDate` 取行情时间所在交易日（而非服务器当天）。
- `eastmoney.data.fundFlow.days` 为东方财富近 30 个交易日的四档资金流明细；`finance.revenue`/`grossMargin` 等在同花顺缺失时由东财补位，补位不改变字段名。

