/**
 * 端到端冒烟测试：不安装插件，直接给 apply() 一个假的 Host 上下文，
 * 触发 HTTP handler，验证「代码 → 抓取 → 指标 → 建议」整条链路。
 *
 * 运行：
 *   node stock-analyzer/test/smoke.mjs 600519
 */
import { apply } from '../index.js'

const query = process.argv[2] ?? '600519'

const routes = new Map()
const tools = new Map()
const cleanup = []

const ctx = {
  effect(factory) {
    const dispose = factory()
    if (typeof dispose === 'function') cleanup.push(dispose)
    return dispose
  },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
  tools: {
    register(tool) {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    },
  },
  logger: { info: (...args) => console.log('[info]', ...args), warn: (...args) => console.warn('[warn]', ...args) },
}

apply(ctx, { cacheMinutes: 5, windEnabled: false })

const route = routes.get('/dsh-stock/analyze.json')
if (!route) throw new Error('HTTP 路由未注册')

const url = `/dsh-stock/analyze.json?q=${encodeURIComponent(query)}&refresh=1`
const res = {
  status: 0,
  body: '',
  writeHead(status) {
    this.status = status
  },
  end(body) {
    this.body = body
  },
}
await route.handler({ method: 'GET', url }, res)
if (res.status !== 200) throw new Error(`HTTP 状态异常：${res.status}`)
const data = JSON.parse(res.body)

console.log('\n=== 抓取结果 ===')
console.log('ok:', data.ok, '| error:', data.error ?? '—')
if (!data.ok) process.exit(1)

const { quote, funds, technical, finance, industry, news, hot, advice, meta } = data
console.log('名称代码:', quote.name, quote.code, `(${quote.market}/${quote.board})`)
console.log('现价/涨跌:', quote.price, quote.changePct, '| 成交额:', quote.amount, '| PE:', quote.peTTM, '| PB:', quote.pb)
console.log('技术面:', technical.trend.label, technical.trend.score, '| 指标条数:', technical.items.length)
console.log('均线:', JSON.stringify(technical.ma))
console.log('MACD:', JSON.stringify(technical.macd), 'KDJ:', JSON.stringify(technical.kdj), 'RSI:', JSON.stringify(technical.rsi))
console.log('资金:', JSON.stringify({ mainNet: funds.mainNet, ratio: funds.mainNetRatio, estimated: funds.estimated }))
console.log('行业:', industry.name, '排名', industry.rank, '/', industry.total, '| 申万:', industry.swName, '| 同行:', industry.peers.length)
console.log('财务:', JSON.stringify({ report: finance.report, eps: finance.eps, gross: finance.grossMargin, roe: finance.roe, debt: finance.debtRatio }))
console.log('新闻条数:', news.length, '| 热点:', hot.rank, '| 概念:', hot.concepts.length, '| Wind:', data.wind.available, data.wind.reason)
console.log('建议:', advice.rating, advice.score, '|', advice.action)
console.log('理由:', advice.reasons)
console.log('风险:', advice.risks)
console.log('价位:', JSON.stringify(advice.levels))
console.log('数据源:', meta.sources.map((item) => `${item.label}:${item.ok ? '✓' : '✗'}(${item.note})`).join(' | '))
console.log('耗时:', meta.elapsedMs, 'ms | warnings:', data.warnings)

const tool = tools.get('stock_analysis')
if (!tool) throw new Error('Agent 工具 stock_analysis 未注册')
const output = await tool.execute({ code: quote.code, section: 'all' })
console.log('\n=== 工具文本报告（前 1200 字）===')
console.log(String(output.text).slice(0, 1200))

// 基本断言：数据形状符合 CONTRACT.md
const checks = [
  [quote.code === String(quote.code), 'quote.code'],
  [Number.isFinite(quote.price), 'quote.price'],
  [technical.items.length >= 8, 'technical.items'],
  [Number.isFinite(technical.ma.ma20), 'technical.ma.ma20'],
  [technical.macd !== null, 'technical.macd'],
  [Number.isFinite(funds.mainNet), 'funds.mainNet'],
  [Number.isFinite(advice.score) && typeof advice.rating === 'string', 'advice'],
  [Array.isArray(news), 'news'],
  [Array.isArray(advice.reasons) && advice.reasons.length > 0, 'advice.reasons'],
]
let failed = 0
for (const [ok, label] of checks) {
  if (!ok) {
    failed += 1
    console.error('断言失败:', label)
  }
}
for (const dispose of cleanup.reverse()) {
  try {
    dispose()
  } catch {
    /* ignore */
  }
}
if (failed > 0) process.exit(1)
console.log('\n✅ 冒烟测试通过')
