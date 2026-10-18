/**
 * 个股智能分析（Host half，同花顺 + 东方财富双数据源）
 *
 * 输入股票代码或名称，抓取：
 *   - 同花顺 realhead 行情 / 四档资金流 / 估值
 *   - 同花顺日 K 线（v6/line），本地计算 MA、MACD、KDJ、RSI、BOLL、ATR、BIAS、量能
 *   - 同花顺 F10（首页 / 公司资料 / 财务诊断 / 概念题材）
 *   - 同花顺行业板块排行与成分股
 *   - 同花顺热榜（个股热度、热点原因）
 *   - 同花顺资讯（关键词匹配 + 公司公告）
 *   - 东方财富：资金流历史（5/10/20 日主力净流入）、F10 主要财务指标、
 *     公告与资讯搜索（作为第二数据源，补充同花顺缺失字段并交叉印证）
 *
 * 对外提供：
 *   GET /dsh-stock/analyze.json?q=600519[&refresh=1]  完整分析（页面与工具共用）
 *   GET /dsh-stock/search.json?q=茅台                  代码/名称检索
 *   Tool `stock_analysis`                              Agent 读取同一份分析
 *
 * 免责声明：数据来自公开接口，分析为规则化模型生成，仅供参考，不构成投资建议。
 */
import {
  parseF10Main,
  parseCompany,
  parseFinanceDiagnosis,
  parseConcepts,
  parseIndustryList,
  parseIndustryDetail,
  parseHotList,
  parseThsRealhead,
  parseThsLine,
  parseNews,
} from './ths-pages.js'

const API_PATH = '/dsh-stock/analyze.json'
const SEARCH_PATH = '/dsh-stock/search.json'

const THS_QUOTE = 'https://d.10jqka.com.cn/v6/realhead'
const THS_LINE = 'https://d.10jqka.com.cn/v6/line'
const THS_F10 = 'https://basic.10jqka.com.cn'
const THS_INDUSTRY = 'https://q.10jqka.com.cn/thshy'
const THS_INDUSTRY_DESC = `${THS_INDUSTRY}/index/field/199112/order/desc/page/1/`
const THS_INDUSTRY_ASC = `${THS_INDUSTRY}/index/field/199112/order/asc/page/1/`
const THS_HOT = 'https://dq.10jqka.com.cn/fuyao/hot_list_data/out/hot_list/v1/stock?stock_type=a&type=hour&list_type=normal'
const THS_NEWS = 'https://news.10jqka.com.cn/tapp/news/push/stock/?page=1&tag=&track=website'
const SINA_SUGGEST = 'https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key='

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const THS_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.10jqka.com.cn/',
  Accept: '*/*',
}
const SINA_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://finance.sina.com.cn/',
  Accept: '*/*',
}

const SHANGHAI = 'Asia/Shanghai'
const YI = 1e8
const WAN = 1e4

const DEFAULTS = {
  cacheMinutes: 5,
  f10CacheHours: 6,
  eastmoneyEnabled: true,
  requestTimeoutMs: 25000,
}

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI, year: 'numeric', month: '2-digit', day: '2-digit' })
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: SHANGHAI, weekday: 'short' })

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function num(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function errorText(error) {
  return String(error?.message ?? error ?? '未知错误')
}

function shanghaiDate(ms = Date.now()) {
  return dateFmt.format(new Date(ms))
}

function shanghaiClock(ms = Date.now()) {
  return clockFmt.format(new Date(ms))
}

function isWeekday(ms) {
  return !['Sat', 'Sun'].includes(weekdayFmt.format(new Date(ms)))
}

function todayText() {
  return `${shanghaiDate()} ${shanghaiClock()}`
}

function formatYi(value, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  return `${(value / YI).toFixed(digits)} 亿`
}

function formatSignedYi(value, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  const yi = value / YI
  return `${yi >= 0 ? '+' : ''}${yi.toFixed(digits)} 亿`
}

function formatPct(value, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function truncate(text, length = 160) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > length ? `${value.slice(0, length)}…` : value
}

/* ------------------------------------------------------------------ */
/* 轻量缓存                                                            */
/* ------------------------------------------------------------------ */

const cacheStore = new Map()

function cacheGet(key) {
  const entry = cacheStore.get(key)
  if (!entry) return null
  if (entry.expireAt <= Date.now()) {
    cacheStore.delete(key)
    return null
  }
  return entry.value
}

function cacheSet(key, value, ttlMs) {
  if (cacheStore.size > 400) {
    const now = Date.now()
    for (const [k, v] of cacheStore) {
      if (v.expireAt <= now) cacheStore.delete(k)
    }
    if (cacheStore.size > 400) cacheStore.clear()
  }
  cacheStore.set(key, { value, expireAt: Date.now() + ttlMs })
}

async function cached(key, ttlMs, loader) {
  const hit = cacheGet(key)
  if (hit !== null && hit !== undefined) return hit
  const value = await loader()
  if (value !== null && value !== undefined) cacheSet(key, value, ttlMs)
  return value
}

/* ------------------------------------------------------------------ */
/* HTTP 抓取                                                           */
/* ------------------------------------------------------------------ */

function decodeBuffer(buffer, encoding) {
  if (encoding === 'gbk') {
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      return buffer.toString('utf8')
    }
  }
  return buffer.toString('utf8')
}

async function httpText(url, { encoding = 'utf-8', referer = 'https://www.10jqka.com.cn/', timeoutMs = 25000, headers } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: headers ?? { ...THS_HEADERS, Referer: referer },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}（${url}）`)
    const buffer = Buffer.from(await response.arrayBuffer())
    return decodeBuffer(buffer, encoding)
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`请求超时（${url}）`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** 同花顺 JS 包裹格式：cb({...}) 或 var x="..."; 取括号里的 JSON。 */
function jsonFromCallback(text) {
  const raw = String(text ?? '')
  const start = raw.indexOf('(')
  const end = raw.lastIndexOf(')')
  if (start < 0 || end <= start) throw new Error('同花顺返回格式异常')
  return JSON.parse(raw.slice(start + 1, end))
}

/* ------------------------------------------------------------------ */
/* 代码与市场                                                          */
/* ------------------------------------------------------------------ */

function marketOf(code) {
  if (/^(6|9|5)/.test(code)) return 'SH'
  if (/^(0|2|3|1)/.test(code)) return 'SZ'
  return 'BJ'
}

function normaliseMarket(value, code) {
  const upper = String(value ?? '').toUpperCase()
  if (upper === 'SH' || upper === 'SZ' || upper === 'BJ') return upper
  if (code) return marketOf(code)
  return null
}

function boardOf(code, name = '') {
  if (/^(688|689)/.test(code)) return '科创板'
  if (/^(300|301)/.test(code)) return '创业板'
  if (/^(8|4|920)/.test(code)) return '北交所'
  return /ST/i.test(name) ? 'ST' : '主板'
}

function limitRateOf(code, name = '') {
  if (/^(688|689)/.test(code)) return 20
  if (/^(300|301)/.test(code)) return 20
  if (/^(8|4|920)/.test(code)) return 30
  return /ST/i.test(name) ? 5 : 10
}

function normaliseCode(raw) {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!text) return null
  let match = /^(\d{6})(?:\.(SH|SZ|BJ))?$/.exec(text)
  if (match) return { code: match[1], market: normaliseMarket(match[2], match[1]) }
  match = /^(SH|SZ|BJ)(\d{6})$/.exec(text)
  if (match) return { code: match[2], market: match[1] }
  return null
}

function eastmoneySecid(code, market) {
  const upper = market ?? marketOf(code)
  return `${upper === 'SH' ? 1 : 0}.${code}`
}

/* ------------------------------------------------------------------ */
/* 名称检索（新浪 suggest，仅用于名称 → 代码）                          */
/* ------------------------------------------------------------------ */

async function sinaSuggest(query, timeoutMs) {
  const url = `${SINA_SUGGEST}${encodeURIComponent(query)}`
  const text = await httpText(url, { encoding: 'gbk', referer: 'https://finance.sina.com.cn/', timeoutMs, headers: SINA_HEADERS })
  const match = /"([^"]*)"/.exec(text)
  if (!match) return []
  const entries = []
  for (const chunk of match[1].split(';')) {
    const parts = chunk.split(',')
    if (parts.length < 4) continue
    const code = parts[2]
    const symbol = parts[3]
    if (!/^\d{6}$/.test(code)) continue
    if (!/^(sh|sz|bj)\d{6}$/.test(symbol)) continue
    const market = symbol.slice(0, 2).toUpperCase()
    entries.push({
      code,
      name: String(parts[0] ?? '').trim(),
      market,
      kind: String(parts[1] ?? ''),
      pinyin: String(parts[4] ?? ''),
    })
  }
  return entries
}

function toSearchItem(entry) {
  return { code: entry.code, name: entry.name, market: normaliseMarket(entry.market, entry.code) }
}

async function resolveStock(raw, timeoutMs) {
  const text = String(raw ?? '').trim()
  if (!text) throw new Error('请输入股票代码或名称')
  const direct = normaliseCode(text)
  if (direct) {
    return { raw: text, code: direct.code, market: direct.market, name: null, fromCode: true }
  }
  const entries = await sinaSuggest(text, timeoutMs)
  if (entries.length === 0) throw new Error(`未找到与「${text}」匹配的 A 股标的`)
  const exact = entries.find((item) => item.name === text)
  const picked = exact ?? entries[0]
  return { raw: text, code: picked.code, market: normaliseMarket(picked.market, picked.code), name: picked.name, fromCode: false }
}

async function searchStocks(raw, timeoutMs) {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const direct = normaliseCode(text)
  if (direct) {
    try {
      const items = await fetchRealhead(direct.code, timeoutMs)
      const name = String(items?.name ?? '').trim()
      return [{ code: direct.code, name, market: direct.market }]
    } catch {
      return [{ code: direct.code, name: '', market: direct.market }]
    }
  }
  const entries = await sinaSuggest(text, timeoutMs)
  const seen = new Set()
  const items = []
  for (const entry of entries) {
    if (seen.has(entry.code)) continue
    seen.add(entry.code)
    items.push(toSearchItem(entry))
    if (items.length >= 10) break
  }
  return items
}

/* ------------------------------------------------------------------ */
/* 同花顺数据抓取                                                      */
/* ------------------------------------------------------------------ */

async function fetchRealhead(code, timeoutMs) {
  const key = `realhead:${code}`
  return cached(key, 5 * 60_000, async () => {
    const text = await httpText(`${THS_QUOTE}/hs_${code}/last.js`, { timeoutMs })
    return parseThsRealhead(text).items
  })
}

async function fetchKline(code, timeoutMs, refresh = false) {
  const key = `kline:${code}`
  if (!refresh) {
    const hit = cacheGet(key)
    if (hit) return hit
  }
  const refreshKey = `kline-fetch:${code}`
  const inflight = cacheGet(refreshKey)
  if (inflight) return inflight
  const task = (async () => {
    // all.js 是压缩的 delta 编码，改用「按年」接口（与 last.js 相同的明文格式）拼接多年日线。
    const year = Number(shanghaiDate().slice(0, 4))
    const years = [year, year - 1, year - 2]
    const settled = await Promise.allSettled(
      years.map((item) => httpText(`${THS_LINE}/hs_${code}/01/${item}.js`, { timeoutMs: Math.max(timeoutMs, 30000) })),
    )
    const byDate = new Map()
    let name = ''
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue
      const parsed = parseThsLine(item.value)
      if (!name) name = parsed.name ?? ''
      for (const row of parsed.rows ?? []) {
        if (Number.isFinite(row.close) && row.close > 0 && Number.isFinite(row.volume) && row.volume > 0) {
          byDate.set(row.date, row)
        }
      }
    }
    if (byDate.size === 0) {
      // 兜底：最近 140 个交易日。
      const text = await httpText(`${THS_LINE}/hs_${code}/01/last.js`, { timeoutMs: Math.max(timeoutMs, 30000) })
      const parsed = parseThsLine(text)
      if (!name) name = parsed.name ?? ''
      for (const row of parsed.rows ?? []) {
        if (Number.isFinite(row.close) && row.close > 0 && Number.isFinite(row.volume) && row.volume > 0) {
          byDate.set(row.date, row)
        }
      }
    }
    const rows = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    if (rows.length === 0) throw new Error('同花顺 K 线数据为空')
    const result = { name, rows }
    cacheSet(key, result, 30 * 60_000)
    return result
  })()
  cacheSet(refreshKey, task, 60_000)
  try {
    return await task
  } finally {
    cacheStore.delete(refreshKey)
  }
}

async function fetchF10(code, timeoutMs) {
  const key = `f10:${code}`
  return cached(key, 6 * 60 * 60_000, async () => {
    const base = `${THS_F10}/${code}`
    const settled = await Promise.allSettled([
      httpText(`${base}/`, { encoding: 'gbk', timeoutMs }),
      httpText(`${base}/company.html`, { encoding: 'gbk', timeoutMs }),
      httpText(`${base}/finance.html`, { encoding: 'gbk', timeoutMs }),
      httpText(`${base}/concept.html`, { encoding: 'gbk', timeoutMs }),
    ])
    const textAt = (index) => (settled[index].status === 'fulfilled' ? settled[index].value : '')
    const failures = settled.filter((item) => item.status === 'rejected').map((item) => errorText(item.reason))
    const main = parseF10Main(textAt(0))
    const company = parseCompany(textAt(1))
    const finance = parseFinanceDiagnosis(textAt(2))
    const concepts = parseConcepts(textAt(3))
    return { main, company, finance, concepts, failures }
  })
}

async function fetchIndustryList(timeoutMs) {
  return cached('industry:list', 30 * 60_000, async () => {
    // 行业板块页默认只按涨跌幅展示前 50 个；再取升序一页，合并后覆盖全部约 90 个同花顺行业板块。
    const settled = await Promise.allSettled([
      httpText(THS_INDUSTRY_DESC, { encoding: 'gbk', timeoutMs }),
      httpText(THS_INDUSTRY_ASC, { encoding: 'gbk', timeoutMs }),
    ])
    const desc = settled[0].status === 'fulfilled' ? parseIndustryList(settled[0].value) : []
    const asc = settled[1].status === 'fulfilled' ? parseIndustryList(settled[1].value) : []
    if (desc.length === 0 && asc.length === 0) return []
    const map = new Map()
    desc.forEach((item, index) => map.set(item.code, { ...item, rank: index + 1 }))
    asc.forEach((item) => {
      if (!map.has(item.code)) map.set(item.code, { ...item, rank: null })
    })
    const total = map.size
    const ascOnly = asc.filter((item) => map.get(item.code)?.rank === null)
    ascOnly.forEach((item) => {
      const index = asc.findIndex((entry) => entry.code === item.code)
      const entry = map.get(item.code)
      if (entry) entry.rank = Math.max(1, total - index)
    })
    return [...map.values()]
      .map((item) => ({ ...item, total }))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  })
}

async function fetchIndustryDetail(boardCode, timeoutMs) {
  const key = `industry:detail:${boardCode}`
  return cached(key, 30 * 60_000, async () => {
    const text = await httpText(`${THS_INDUSTRY}/detail/code/${boardCode}/`, { encoding: 'gbk', timeoutMs })
    return parseIndustryDetail(text)
  })
}

/** 行业板块涨跌幅升序页（取末位成分股，避免只取到涨幅榜前 10 造成 5 日均值偏差）。 */
async function fetchIndustryDetailAsc(boardCode, timeoutMs) {
  const key = `industry:detail:asc:${boardCode}`
  return cached(key, 30 * 60_000, async () => {
    const text = await httpText(`${THS_INDUSTRY}/detail/code/${boardCode}/order/asc/`, { encoding: 'gbk', timeoutMs })
    return parseIndustryDetail(text)
  })
}

async function fetchHotList(timeoutMs) {
  return cached('hot:list', 10 * 60_000, async () => {
    const text = await httpText(THS_HOT, { timeoutMs })
    return parseHotList(text)
  })
}

async function fetchNewsFeed(timeoutMs) {
  return cached('news:feed', 10 * 60_000, async () => {
    const text = await httpText(THS_NEWS, { timeoutMs })
    return parseNews(text)
  })
}

/* ------------------------------------------------------------------ */
/* 技术指标                                                            */
/* ------------------------------------------------------------------ */

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null
  let sum = 0
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i]
  return sum / period
}

function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length === 0) return []
  const k = 2 / (period + 1)
  const out = []
  let prev = values[0]
  for (let i = 0; i < values.length; i += 1) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function stdev(values) {
  if (!Array.isArray(values) || values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function macdOf(closes) {
  if (closes.length < 35) return null
  const ema12 = emaSeries(closes, 12)
  const ema26 = emaSeries(closes, 26)
  const dif = closes.map((_, index) => ema12[index] - ema26[index])
  const dea = emaSeries(dif, 9)
  const hist = dif.map((value, index) => 2 * (value - dea[index]))
  const last = closes.length - 1
  const prev = last - 1
  const signal =
    dif[last] > dea[last] && dif[prev] <= dea[prev]
      ? '金叉'
      : dif[last] < dea[last] && dif[prev] >= dea[prev]
        ? '死叉'
        : dif[last] > dea[last]
          ? '多头'
          : '空头'
  return { dif: round(dif[last], 3), dea: round(dea[last], 3), hist: round(hist[last], 3), signal }
}

function kdjOf(rows, period = 9, lookback = 120) {
  if (rows.length < period + 2) return null
  let k = 50
  let d = 50
  const start = Math.max(period, rows.length - lookback)
  for (let i = start; i < rows.length; i += 1) {
    const window = rows.slice(i - period + 1, i + 1)
    const high = Math.max(...window.map((row) => row.high))
    const low = Math.min(...window.map((row) => row.low))
    const rsv = high > low ? ((rows[i].close - low) / (high - low)) * 100 : 50
    k = (2 * k + rsv) / 3
    d = (2 * d + k) / 3
  }
  const j = 3 * k - 2 * d
  const signal = j > 100 ? '超买' : j < 0 ? '超卖' : k > d ? '偏多' : '偏空'
  return { k: round(k, 2), d: round(d, 2), j: round(j, 2), signal }
}

function rsiOf(closes, period) {
  if (closes.length <= period) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  gain /= period
  loss /= period
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + (change > 0 ? change : 0)) / period
    loss = (loss * (period - 1) + (change < 0 ? -change : 0)) / period
  }
  if (loss === 0) return 100
  const rs = gain / loss
  return 100 - 100 / (1 + rs)
}

function atrOf(rows, period = 14) {
  if (rows.length <= period) return null
  const trueRanges = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const prevClose = rows[i - 1].close
    trueRanges.push(Math.max(row.high - row.low, Math.abs(row.high - prevClose), Math.abs(row.low - prevClose)))
  }
  let atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  for (let i = period; i < trueRanges.length; i += 1) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
  }
  return atr
}

function bollOf(closes, period = 20, mult = 2) {
  if (closes.length < period) return null
  const window = closes.slice(-period)
  const mid = window.reduce((sum, value) => sum + value, 0) / period
  const sd = stdev(window)
  if (sd === null) return null
  const upper = mid + mult * sd
  const lower = mid - mult * sd
  const price = closes[closes.length - 1]
  const position = price > upper ? '上轨之上' : price < lower ? '下轨之下' : price > mid ? '中轨上方' : '中轨下方'
  return { upper: round(upper, 2), mid: round(mid, 2), lower: round(lower, 2), width: round(((upper - lower) / mid) * 100, 2), position }
}

function buildTechnical(rows, price) {
  const closes = rows.map((row) => row.close)
  const volumes = rows.map((row) => row.volume)
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const ma120 = sma(closes, 120)
  const ma250 = sma(closes, 250)
  const macd = macdOf(closes)
  const kdj = kdjOf(rows)
  const rsi = {
    rsi6: round(rsiOf(closes, 6), 2),
    rsi12: round(rsiOf(closes, 12), 2),
    rsi24: round(rsiOf(closes, 24), 2),
  }
  rsi.signal = rsi.rsi6 === null ? null : rsi.rsi6 > 80 ? '超买' : rsi.rsi6 < 20 ? '超卖' : '中性'
  const boll = bollOf(closes)
  const atr = atrOf(rows)
  const bias = {
    bias6: ma5 ? round(((price - ma5) / ma5) * 100, 2) : null,
    bias12: ma10 ? round(((price - ma10) / ma10) * 100, 2) : null,
    bias24: ma20 ? round(((price - ma20) / ma20) * 100, 2) : null,
  }
  const avg5 = volumes.length >= 5 ? sma(volumes, 5) : null
  const avg20 = volumes.length >= 20 ? sma(volumes, 20) : null
  const volumeRatio = avg20 && avg20 > 0 && avg5 ? avg5 / avg20 : null
  const volume = {
    avg5: avg5 ? Math.round(avg5) : null,
    avg20: avg20 ? Math.round(avg20) : null,
    ratio: round(volumeRatio, 2),
    signal:
      volumeRatio === null
        ? null
        : volumeRatio > 1.5
          ? '显著放量'
          : volumeRatio > 1.1
            ? '温和放量'
            : volumeRatio < 0.8
              ? '缩量'
              : '量能平稳',
  }

  const recent = rows.slice(-20)
  const support = recent.length ? round(Math.min(...recent.map((row) => row.low)), 2) : null
  const resistance = recent.length ? round(Math.max(...recent.map((row) => row.high)), 2) : null
  const stopBase = ma20 !== null && support !== null ? Math.min(ma20, support) : (support ?? ma20)
  const stopLoss = stopBase !== null ? round(stopBase * 0.98, 2) : null

  let score = 50
  const reasonsBull = []
  const reasonsBear = []
  if (ma20 !== null && price !== null) {
    if (price > ma20) {
      score += 8
      reasonsBull.push('股价位于 20 日均线上方')
    } else {
      score -= 8
      reasonsBear.push('股价跌破 20 日均线')
    }
  }
  if (ma5 !== null && ma10 !== null && ma20 !== null) {
    if (ma5 > ma10 && ma10 > ma20) {
      score += 10
      reasonsBull.push('均线多头排列')
    } else if (ma5 < ma10 && ma10 < ma20) {
      score -= 10
      reasonsBear.push('均线空头排列')
    }
  }
  if (ma20 !== null && ma60 !== null) {
    if (ma20 > ma60) score += 6
    else score -= 6
  }
  if (macd) {
    if (macd.hist > 0) {
      score += 8
      reasonsBull.push(`MACD ${macd.signal}，红柱延续`)
    } else {
      score -= 8
      reasonsBear.push(`MACD ${macd.signal}，绿柱延续`)
    }
  }
  if (kdj) {
    if (kdj.j > 80) score -= 5
    else if (kdj.j < 20) score += 5
    else if (kdj.k > kdj.d) score += 3
    else score -= 3
  }
  if (rsi.rsi6 !== null) {
    if (rsi.rsi6 > 80) score -= 6
    else if (rsi.rsi6 < 20) score += 4
  }
  if (volumeRatio !== null) {
    if (volumeRatio > 1.2 && price !== null && ma20 !== null && price > ma20) score += 5
    if (volumeRatio < 0.7) score -= 3
  }
  score = clamp(Math.round(score), 0, 100)
  const label = score >= 70 ? '强势多头' : score >= 58 ? '多头排列' : score >= 44 ? '震荡整理' : score >= 32 ? '偏弱' : '空头趋势'
  const trendText =
    reasonsBull.length > 0
      ? reasonsBull.slice(0, 3).join('；')
      : reasonsBear.length > 0
        ? reasonsBear.slice(0, 3).join('；')
        : '均线与量能中性，方向待选择'

  const statusOf = (value, bull, bear) => (value === null ? 'neutral' : value ? bull : bear)
  const items = [
    {
      key: 'ma',
      label: '均线系统',
      value: `MA5 ${fmtPrice(ma5)} / MA10 ${fmtPrice(ma10)} / MA20 ${fmtPrice(ma20)} / MA60 ${fmtPrice(ma60)}`,
      status: ma5 !== null && ma20 !== null ? statusOf(ma5 > ma20, 'bull', 'bear') : 'neutral',
      note: ma5 !== null && ma10 !== null && ma20 !== null && ma5 > ma10 && ma10 > ma20 ? '多头排列' : '均线交织',
    },
    {
      key: 'macd',
      label: 'MACD',
      value: macd ? `DIF ${fmtPrice(macd.dif)} / DEA ${fmtPrice(macd.dea)} / 柱 ${fmtPrice(macd.hist)}` : '—',
      status: macd ? (macd.hist > 0 ? 'bull' : 'bear') : 'neutral',
      note: macd ? macd.signal : '数据不足',
    },
    {
      key: 'kdj',
      label: 'KDJ',
      value: kdj ? `K ${kdj.k} / D ${kdj.d} / J ${kdj.j}` : '—',
      status: kdj ? (kdj.k > kdj.d ? 'bull' : 'bear') : 'neutral',
      note: kdj ? kdj.signal : '数据不足',
    },
    {
      key: 'rsi',
      label: 'RSI',
      value: `RSI6 ${fmtNum(rsi.rsi6)} / RSI12 ${fmtNum(rsi.rsi12)} / RSI24 ${fmtNum(rsi.rsi24)}`,
      status: rsi.rsi6 === null ? 'neutral' : rsi.rsi6 > 70 ? 'bear' : rsi.rsi6 < 30 ? 'bull' : 'neutral',
      note: rsi.signal ?? '数据不足',
    },
    {
      key: 'boll',
      label: '布林带',
      value: boll ? `上 ${fmtPrice(boll.upper)} / 中 ${fmtPrice(boll.mid)} / 下 ${fmtPrice(boll.lower)}` : '—',
      status: boll ? (boll.position.includes('上方') && !boll.position.includes('轨之上') ? 'bull' : boll.position === '上轨之上' ? 'bull' : 'bear') : 'neutral',
      note: boll ? `${boll.position}，带宽 ${fmtNum(boll.width)}%` : '数据不足',
    },
    {
      key: 'volume',
      label: '量能',
      value: volume.ratio !== null ? `5 日均量为 20 日均量的 ${volume.ratio} 倍` : '—',
      status: volumeRatio === null ? 'neutral' : volumeRatio > 1.1 ? 'bull' : volumeRatio < 0.8 ? 'bear' : 'neutral',
      note: volume.signal ?? '数据不足',
    },
    {
      key: 'bias',
      label: '乖离率',
      value: `BIAS6 ${fmtNum(bias.bias6)}% / BIAS12 ${fmtNum(bias.bias12)}% / BIAS24 ${fmtNum(bias.bias24)}%`,
      status: bias.bias24 === null ? 'neutral' : Math.abs(bias.bias24) > 10 ? 'bear' : 'neutral',
      note: '正值表示价格在均线上方',
    },
    {
      key: 'atr',
      label: '波动率 ATR',
      value: atr !== null ? `${round(atr, 2)} 元（${round((atr / price) * 100, 2)}%）` : '—',
      status: 'neutral',
      note: atr !== null && price > 0 && atr / price > 0.04 ? '波动偏大' : '波动正常',
    },
    {
      key: 'support',
      label: '支撑 / 压力',
      value: `${fmtPrice(support)} / ${fmtPrice(resistance)}`,
      status: 'neutral',
      note: '近 20 个交易日区间',
    },
  ]

  return {
    bars: {
      count: rows.length,
      from: rows.length ? String(rows[0].date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null,
      to: rows.length ? String(rows[rows.length - 1].date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null,
    },
    ma: { ma5: round(ma5, 2), ma10: round(ma10, 2), ma20: round(ma20, 2), ma60: round(ma60, 2), ma120: round(ma120, 2), ma250: round(ma250, 2) },
    macd,
    kdj,
    rsi,
    boll,
    atr: atr !== null && price > 0 ? { value: round(atr, 2), pct: round((atr / price) * 100, 2) } : null,
    bias,
    volume,
    support,
    resistance,
    stopLoss,
    trend: { label, score, text: trendText },
    items,
    score,
  }
}

function fmtPrice(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : '—'
}

function fmtNum(value) {
  return Number.isFinite(value) ? String(value) : '—'
}

/* ------------------------------------------------------------------ */
/* 东方财富（第二数据源：资金流历史 / 财务指标 / 公告 / 资讯）          */
/* ------------------------------------------------------------------ */

const EM_FFLOW = 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get'
const EM_KLINE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const EM_FINANCE = 'https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew'
const EM_NOTICE = 'https://np-anotice-stock.eastmoney.com/api/security/ann'
const EM_SEARCH = 'https://search-api-web.eastmoney.com/search/jsonp'
const EM_REFERER = 'https://quote.eastmoney.com/'
const EM_HEADERS = { ...THS_HEADERS, Referer: EM_REFERER }

function stripEmTags(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchEastmoneyJson(url, timeoutMs) {
  const text = await httpText(url, { referer: EM_REFERER, timeoutMs, headers: EM_HEADERS })
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  const start = trimmed.indexOf('(')
  const end = trimmed.lastIndexOf(')')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start + 1, end))
  return JSON.parse(trimmed)
}

/** 东方财富资金流历史：主力 = 超大单 + 大单；小单 + 中单 = 散户。 */
async function fetchEastmoneyFundFlow(code, market, timeoutMs) {
  return cached(`em:flow:${code}`, 10 * 60_000, async () => {
    const secid = eastmoneySecid(code, market)
    const url = `${EM_FFLOW}?lmt=30&klt=101&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`
    const parsed = await fetchEastmoneyJson(url, timeoutMs)
    const klines = Array.isArray(parsed?.data?.klines) ? parsed.data.klines : []
    const days = klines
      .map((line) => {
        const cells = String(line).split(',')
        return {
          date: cells[0] ?? null,
          mainNet: num(cells[1]),
          smallNet: num(cells[2]),
          mediumNet: num(cells[3]),
          largeNet: num(cells[4]),
          superNet: num(cells[5]),
          mainRatio: num(cells[6]),
          close: num(cells[11]),
          changePct: num(cells[12]),
        }
      })
      .filter((day) => day.date)
    if (days.length === 0) return null
    const sum = (count) => days.slice(-count).reduce((total, day) => total + (day.mainNet ?? 0), 0)
    const latest = days[days.length - 1]
    return {
      days,
      main5: round(sum(5), 2),
      main10: round(sum(10), 2),
      main20: round(sum(20), 2),
      latestDate: latest.date,
      latestMain: latest.mainNet ?? null,
    }
  })
}

/** 东方财富 F10 主要财务指标（最新一期 + 近 6 期）。 */
async function fetchEastmoneyFinance(code, market, timeoutMs) {
  return cached(`em:finance:${code}`, 6 * 60 * 60_000, async () => {
    const upper = market ?? marketOf(code)
    const prefix = upper === 'SH' ? 'SH' : upper === 'SZ' ? 'SZ' : 'BJ'
    const url = `${EM_FINANCE}?type=0&code=${prefix}${code}`
    const parsed = await fetchEastmoneyJson(url, timeoutMs)
    const rows = Array.isArray(parsed?.data) ? parsed.data : []
    const row = rows[0] ?? null
    if (!row || !row.REPORT_DATE_NAME) return null
    return {
      report: row.REPORT_DATE_NAME ?? null,
      eps: num(row.EPSJB),
      bps: num(row.BPS),
      revenue: num(row.TOTALOPERATEREVE),
      grossProfit: num(row.MLR),
      netProfit: num(row.PARENTNETPROFIT),
      revenueYoY: num(row.TOTALOPERATEREVETZ),
      netProfitYoY: num(row.PARENTNETPROFITTZ),
      roe: num(row.ROEJQ),
      roeDiluted: num(row.ROEKCJQ),
      grossMargin: num(row.XSMLL),
      netMargin: num(row.XSJLL),
      debtRatio: num(row.ZCFZL),
      cashPerShare: num(row.MGJYXJJE),
      roic: num(row.ROIC),
      reports: rows.slice(0, 6).map((item) => ({
        report: item.REPORT_DATE_NAME ?? null,
        eps: num(item.EPSJB),
        roe: num(item.ROEJQ),
        revenueYoY: num(item.TOTALOPERATEREVETZ),
        netProfitYoY: num(item.PARENTNETPROFITTZ),
      })),
    }
  })
}

/** 东方财富公告列表。 */
async function fetchEastmoneyNotices(code, timeoutMs) {
  return cached(`em:notice:${code}`, 30 * 60_000, async () => {
    const url = `${EM_NOTICE}?sr=-1&page_size=10&page_index=1&ann_type=A&client_source=web&stock_list=${code}`
    const parsed = await fetchEastmoneyJson(url, timeoutMs)
    const list = Array.isArray(parsed?.data?.list) ? parsed.data.list : []
    return list
      .map((item) => ({
        title: stripEmTags(item.title_ch ?? item.title ?? ''),
        url: item.art_code ? `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html` : null,
        time: String(item.notice_date ?? '').slice(0, 10) || null,
        kind: 'notice',
        source: '东方财富',
      }))
      .filter((item) => item.title)
  })
}

/** 东方财富资讯搜索（按股票名/代码关键词）。 */
async function fetchEastmoneyNews(keyword, timeoutMs) {
  const query = String(keyword ?? '').trim()
  if (!query) return []
  return cached(`em:news:${query}`, 30 * 60_000, async () => {
    const param = {
      uid: '',
      keyword: query,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: { cmsArticleWebOld: { searchScope: 'default', sort: 'default', pageIndex: 1, pageSize: 8 } },
    }
    const url = `${EM_SEARCH}?cb=cb&param=${encodeURIComponent(JSON.stringify(param))}`
    const parsed = await fetchEastmoneyJson(url, timeoutMs)
    const list = Array.isArray(parsed?.result?.cmsArticleWebOld) ? parsed.result.cmsArticleWebOld : []
    return list
      .map((item) => ({
        title: stripEmTags(item.title),
        url: item.url ?? null,
        time: item.date ?? null,
        kind: 'news',
        source: String(item.mediaName ?? '东方财富').trim() || '东方财富',
      }))
      .filter((item) => item.title)
  })
}

/** 聚合东方财富四个接口；任一可用即视为数据源可用。 */
async function fetchEastmoney(code, market, name, timeoutMs, cfg) {
  if (cfg.eastmoneyEnabled === false) {
    return { available: false, reason: '东方财富数据源已在配置中关闭', data: null }
  }
  const settled = await Promise.allSettled([
    fetchEastmoneyFundFlow(code, market, timeoutMs),
    fetchEastmoneyFinance(code, market, timeoutMs),
    fetchEastmoneyNotices(code, timeoutMs),
    fetchEastmoneyNews(name || code, timeoutMs),
  ])
  const labels = ['资金流历史', '财务指标', '公告', '资讯']
  const failures = []
  settled.forEach((item, index) => {
    if (item.status === 'rejected') failures.push(labels[index])
  })
  const fundFlow = settled[0].status === 'fulfilled' ? settled[0].value : null
  const finance = settled[1].status === 'fulfilled' ? settled[1].value : null
  const notices = settled[2].status === 'fulfilled' ? settled[2].value ?? [] : []
  const news = settled[3].status === 'fulfilled' ? settled[3].value ?? [] : []
  const available = Boolean(fundFlow) || Boolean(finance) || notices.length > 0 || news.length > 0
  return {
    available,
    reason: available ? '' : `东方财富接口暂不可用${failures.length ? `（${failures.join('、')}）` : ''}`,
    data: available ? { fundFlow: fundFlow ?? null, finance: finance ?? null, notices, news, failures } : null,
  }
}

/** 东方财富 K 线短暂不可用时熔断 5 分钟，避免批量取数反复等待。 */
let emKlineDownUntil = 0

/** 单只股票：最新收盘、今日涨跌幅、近 5 个交易日涨跌幅（优先东方财富日线，失败回退同花顺）。 */
async function fetchStockStats(code, timeoutMs) {
  return cached(`stock:stats:${code}`, 10 * 60_000, async () => {
    if (Date.now() >= emKlineDownUntil) {
      try {
        const secid = eastmoneySecid(code)
        const url = `${EM_KLINE}?ut=fa5fd1943c7b386f172d6893dbfba10b&secid=${secid}&klt=101&fqt=1&beg=0&end=20500101&lmt=10&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`
        const parsed = await fetchEastmoneyJson(url, timeoutMs)
        const klines = Array.isArray(parsed?.data?.klines) ? parsed.data.klines : []
        if (klines.length > 0) {
          const rows = klines.map((line) => {
            const cells = String(line).split(',')
            return { date: cells[0] ?? null, close: num(cells[2]), changePct: num(cells[8]) }
          })
          const last = rows[rows.length - 1]
          const base = rows.length >= 6 ? rows[rows.length - 6].close : null
          return {
            code,
            source: 'eastmoney',
            date: last.date,
            close: last.close,
            changePct: last.changePct,
            change5d: base && base > 0 && Number.isFinite(last.close) ? round(((last.close - base) / base) * 100, 2) : null,
          }
        }
      } catch {
        emKlineDownUntil = Date.now() + 5 * 60_000
      }
    }
    try {
      const text = await httpText(`${THS_LINE}/hs_${code}/01/last.js`, { timeoutMs })
      const parsed = parseThsLine(text)
      const rows = (parsed.rows ?? []).filter((row) => Number.isFinite(row.close) && row.close > 0)
      if (rows.length === 0) return null
      const last = rows[rows.length - 1]
      const prev = rows.length >= 2 ? rows[rows.length - 2] : null
      const base = rows.length >= 6 ? rows[rows.length - 6].close : null
      return {
        code,
        source: 'ths',
        date: last.date,
        close: last.close,
        changePct: prev && prev.close > 0 ? round(((last.close - prev.close) / prev.close) * 100, 2) : null,
        change5d: base && base > 0 ? round(((last.close - base) / base) * 100, 2) : null,
      }
    } catch {
      return null
    }
  })
}

/** 批量取多只股票的今日/5 日涨跌幅，并发 6，失败忽略。 */
async function fetchStatsMap(codes, timeoutMs) {
  const unique = [...new Set((Array.isArray(codes) ? codes : []).filter((code) => /^\d{6}$/.test(String(code))))]
  const map = new Map()
  let index = 0
  const worker = async () => {
    while (index < unique.length) {
      const current = index
      index += 1
      const code = unique[current]
      const stats = await fetchStockStats(code, timeoutMs)
      if (stats) map.set(code, stats)
    }
  }
  await Promise.all(Array.from({ length: Math.min(10, unique.length) }, () => worker()))
  return map
}

/** 同花顺概念板块索引（概念名称 → 板块代码，整页约 360 个概念）。 */
function parseConceptBoards(html) {
  const boards = []
  const seen = new Set()
  const links = String(html ?? '').matchAll(/gn\/detail\/code\/(\d+)\/?"[^>]*>([^<]{1,24})</g)
  for (const link of links) {
    const code = link[1]
    if (seen.has(code)) continue
    seen.add(code)
    boards.push({ code, name: stripEmTags(link[2]), stockCount: null })
  }
  return boards
}

async function fetchConceptBoards(timeoutMs) {
  return cached('em:concept-boards', 30 * 60_000, async () => {
    const html = await httpText('https://q.10jqka.com.cn/gn/', { encoding: 'gbk', timeoutMs })
    return parseConceptBoards(html)
  })
}

async function fetchConceptDetail(code, timeoutMs) {
  return cached(`concept:detail:${code}`, 30 * 60_000, async () => {
    const base = `https://q.10jqka.com.cn/gn/detail/code/${code}/`
    const first = await httpText(base, { encoding: 'gbk', timeoutMs })
    const page = parseIndustryDetail(first)
    const header = parseBoardHeader(first)
    // 概念成分股较少时抓全部分页；成分股很多（宽基概念）时取涨幅榜/跌幅榜各一页抽样。
    const count = header.upCount !== null && header.downCount !== null ? header.upCount + header.downCount : null
    const pages = count ? Math.ceil(count / 10) : 1
    const variants = []
    if (pages > 1 && pages <= 6) {
      for (let pageNumber = 2; pageNumber <= pages; pageNumber += 1) variants.push(`page/${pageNumber}/`)
    } else if (pages > 1) {
      variants.push('order/asc/', 'order/asc/page/2/')
    }
    const settled = await Promise.allSettled(
      variants.map((path) => httpText(`${base}${path}`, { encoding: 'gbk', timeoutMs })),
    )
    const sampleComponents = []
    const seen = new Set((page.components ?? []).map((stock) => stock.code))
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue
      for (const stock of parseIndustryDetail(item.value).components ?? []) {
        if (!stock.code || seen.has(stock.code)) continue
        seen.add(stock.code)
        sampleComponents.push(stock)
      }
    }
    return { header, components: page.components ?? [], sampleComponents, full: variants.length > 0 && variants.length === pages - 1 }
  })
}

/** 解析板块详情页头部统计（板块涨幅 / 涨幅排名 / 涨跌家数）。 */
function parseBoardHeader(html) {
  const source = String(html ?? '')
  const pick = (label) => {
    const match = new RegExp(`<dt>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]{1,200}?)</dd>`).exec(source)
    return match ? stripEmTags(match[1]) : null
  }
  const changeText = pick('板块涨幅')
  const rankText = pick('涨幅排名')
  const upDownText = pick('涨跌家数')
  const rankMatch = /(\d+)\s*\/\s*(\d+)/.exec(rankText ?? '')
  const numbers = (upDownText ?? '').match(/\d+/g) ?? []
  return {
    changePct: changeText ? num(changeText.replace('%', '')) : null,
    rank: rankMatch ? Number(rankMatch[1]) : null,
    total: rankMatch ? Number(rankMatch[2]) : null,
    upCount: numbers.length >= 1 ? Number(numbers[0]) : null,
    downCount: numbers.length >= 2 ? Number(numbers[1]) : null,
  }
}

/* ------------------------------------------------------------------ */
/* 行业                                                                */
/* ------------------------------------------------------------------ */

function normaliseIndustryName(raw) {
  return String(raw ?? '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[ⅠⅡⅢⅣⅤ]+$/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function findIndustryBoard(list, rawName) {
  if (!Array.isArray(list) || list.length === 0) return null
  const target = normaliseIndustryName(rawName)
  if (!target) return null
  const exact = list.find((item) => normaliseIndustryName(item.name) === target)
  if (exact) return exact
  const contains = list.find(
    (item) => normaliseIndustryName(item.name).includes(target) || target.includes(normaliseIndustryName(item.name)),
  )
  return contains ?? null
}

/* ------------------------------------------------------------------ */
/* 新闻 / 热点                                                         */
/* ------------------------------------------------------------------ */

function timeOf(text) {
  const value = String(text ?? '').trim()
  const match = /(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2})?/.exec(value)
  if (match) return `${match[1]}-${match[2]}-${match[3]}${match[4] ? ` ${match[4]}` : ''}`
  const digits = /^(\d{2})(\d{2})(\d{2})$/.exec(value)
  if (digits) return `${digits[1]}:${digits[2]}`
  return null
}

function pickNews(feed, main, industryName, eastmoney) {
  const emNotices = (eastmoney?.data?.notices ?? []).slice(0, 4)
  const emNews = (eastmoney?.data?.news ?? []).slice(0, 4)
  const thsNotices = (main?.notices ?? []).slice(0, 4).map((notice) => ({
    title: notice.title,
    url: notice.url,
    time: timeOf(notice.time) ?? notice.time ?? null,
    kind: 'notice',
    source: '同花顺 F10',
  }))
  const keywords = [main?.name, industryName].filter((item) => item && String(item).length >= 2)
  const thsNews = []
  for (const item of Array.isArray(feed) ? feed : []) {
    const title = String(item?.title ?? '')
    if (!title) continue
    if (keywords.some((keyword) => title.includes(keyword) || String(item?.digest ?? '').includes(keyword))) {
      thsNews.push({ title, url: item.url ?? null, time: timeOf(item.time) ?? item.time ?? null, kind: 'news', source: '同花顺财经' })
    }
    if (thsNews.length >= 4) break
  }
  const merged = []
  const seen = new Set()
  for (const item of [...emNotices, ...thsNotices, ...emNews, ...thsNews]) {
    if (!item?.title || seen.has(item.title)) continue
    seen.add(item.title)
    merged.push(item)
  }
  if (merged.length < 8) {
    for (const item of Array.isArray(feed) ? feed : []) {
      if (merged.length >= 8) break
      const title = String(item?.title ?? '')
      if (!title || seen.has(title)) continue
      seen.add(title)
      merged.push({ title, url: item.url ?? null, time: timeOf(item.time) ?? item.time ?? null, kind: 'news', source: '同花顺财经' })
    }
  }
  return merged.slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* 投资建议（规则模型）                                                */
/* ------------------------------------------------------------------ */

function scoreFunds(funds, amount) {
  const ratio = funds?.mainNetRatio
  let score = 50
  if (Number.isFinite(ratio)) {
    if (ratio > 8) score = 92
    else if (ratio > 4) score = 80
    else if (ratio > 1.5) score = 68
    else if (ratio > 0) score = 58
    else if (ratio > -1.5) score = 44
    else if (ratio > -4) score = 32
    else if (ratio > -8) score = 22
    else score = 12
  }
  if (Number.isFinite(funds?.outerVol) && Number.isFinite(funds?.innerVol) && funds.outerVol + funds.innerVol > 0) {
    const outerRatio = funds.outerVol / (funds.outerVol + funds.innerVol)
    if (outerRatio > 0.55) score += 6
    else if (outerRatio < 0.45) score -= 6
  }
  return clamp(Math.round(score), 0, 100)
}

function scoreValuation(quote, finance) {
  const pe = quote?.peTTM
  const pb = quote?.pb
  let score = 50
  if (Number.isFinite(pe)) {
    if (pe <= 0) score = 28
    else if (pe < 12) score = 86
    else if (pe < 20) score = 78
    else if (pe < 30) score = 68
    else if (pe < 45) score = 56
    else if (pe < 70) score = 42
    else score = 28
  }
  if (Number.isFinite(pb)) {
    if (pb < 1) score += 8
    else if (pb < 2.5) score += 4
    else if (pb > 8) score -= 10
    else if (pb > 5) score -= 5
  }
  if (Number.isFinite(finance?.roe) && finance.roe > 15) score += 4
  return clamp(Math.round(score), 0, 100)
}

function scoreFinance(finance) {
  if (!finance) return 50
  let score = 50
  if (Number.isFinite(finance.roe)) score = finance.roe >= 20 ? 90 : finance.roe >= 15 ? 80 : finance.roe >= 10 ? 66 : finance.roe >= 5 ? 52 : 38
  if (Number.isFinite(finance.grossMargin)) {
    if (finance.grossMargin >= 50) score += 6
    else if (finance.grossMargin < 15) score -= 8
  }
  if (Number.isFinite(finance.netMargin)) {
    if (finance.netMargin >= 20) score += 4
    else if (finance.netMargin < 0) score -= 12
  }
  if (Number.isFinite(finance.debtRatio)) {
    if (finance.debtRatio > 70) score -= 10
    else if (finance.debtRatio < 40) score += 4
  }
  if (Number.isFinite(finance.profitYoY)) {
    if (finance.profitYoY > 20) score += 8
    else if (finance.profitYoY < 0) score -= 10
  }
  if (Number.isFinite(finance.revenueYoY)) {
    if (finance.revenueYoY > 10) score += 4
    else if (finance.revenueYoY < 0) score -= 6
  }
  return clamp(Math.round(score), 0, 100)
}

function scoreIndustry(industry) {
  let score = 50
  if (Number.isFinite(industry?.changePct)) {
    const change = industry.changePct
    score = change > 3 ? 88 : change > 1 ? 74 : change > 0 ? 64 : change > -1 ? 50 : change > -3 ? 36 : 24
  }
  if (Number.isFinite(industry?.rank) && Number.isFinite(industry?.total) && industry.total > 0) {
    const percentile = industry.rank / industry.total
    if (percentile <= 0.2) score += 8
    else if (percentile >= 0.8) score -= 6
  }
  return clamp(Math.round(score), 0, 100)
}

function scoreSentiment(hot, hotItem) {
  let score = 50
  if (Number.isFinite(hotItem?.rank)) {
    if (hotItem.rank <= 10) score = 86
    else if (hotItem.rank <= 30) score = 72
    else if (hotItem.rank <= 60) score = 60
    else score = 52
  }
  if (Array.isArray(hot?.concepts) && hot.concepts.length >= 5) score += 4
  return clamp(Math.round(score), 0, 100)
}

function buildAdvice(ctxData) {
  const { quote, technical, funds, finance, industry, hot, hotItem, eastmoney } = ctxData
  const techScore = technical?.score ?? 50
  const fundScore = scoreFunds(funds, quote?.amount)
  const valuationScore = scoreValuation(quote, finance)
  const financeScore = scoreFinance(finance)
  const industryScore = scoreIndustry(industry)
  const sentimentScore = scoreSentiment(hot, hotItem)
  const score = clamp(
    Math.round(techScore * 0.35 + fundScore * 0.2 + valuationScore * 0.15 + financeScore * 0.15 + industryScore * 0.1 + sentimentScore * 0.05),
    0,
    100,
  )
  // 短期超买时下调综合分，避免「指标全红就强烈看多」的机械结论。
  const overbought = (technical?.rsi?.rsi6 ?? 0) > 78 || (technical?.kdj?.j ?? 0) > 105
  const finalScore = clamp(overbought ? score - 6 : score, 0, 100)

  let rating
  if (finalScore >= 75) rating = '强烈看多'
  else if (finalScore >= 64) rating = '看多'
  else if (finalScore >= 50) rating = '中性'
  else if (finalScore >= 40) rating = '谨慎'
  else rating = '看空'

  const actions = {
    强烈看多: '趋势、资金与基本面共振，可逢回调分批建仓；跌破关键支撑（%STOP%）止损。',
    看多: '回调至支撑区间分批布局，突破压力位可考虑加仓；跌破 %STOP% 减仓。',
    中性: '观望为主，等待放量突破 %RES% 或回踩 %SUP% 企稳再决策。',
    谨慎: '持仓者逢反弹降低仓位，等待趋势修复；跌破 %STOP% 离场。',
    看空: '规避为主，趋势与资金偏弱，等待企稳信号后再评估。',
  }

  const support = technical?.support
  const resistance = technical?.resistance
  const stopLoss = technical?.stopLoss
  const target = Number.isFinite(resistance) ? round(resistance * 1.05, 2) : null
  const buyZoneLow = Number.isFinite(support) ? round(support * 0.99, 2) : null
  const buyZoneHigh = Number.isFinite(technical?.ma?.ma20) ? round(technical.ma.ma20, 2) : support
  const action = (actions[rating] ?? actions.中性)
    .replace('%STOP%', stopLoss ? stopLoss.toFixed(2) : '支撑位')
    .replace('%RES%', resistance ? resistance.toFixed(2) : '压力位')
    .replace('%SUP%', support ? support.toFixed(2) : '支撑位')

  const horizons = { 强烈看多: '1-3 个月', 看多: '1-3 个月', 中性: '1-2 周观察', 谨慎: '1-4 周', 看空: '观望' }
  const positions = { 强烈看多: '5-7 成', 看多: '3-5 成', 中性: '1-2 成', 谨慎: '0-1 成', 看空: '0 成' }

  const reasons = []
  const risks = []
  for (const item of technical?.items ?? []) {
    if (item.status === 'bull' && item.note && !/超买|高位/.test(item.note) && reasons.length < 4) {
      reasons.push(`${item.label}：${item.note}`)
    }
  }
  if (Number.isFinite(funds?.mainNetRatio) && funds.mainNetRatio > 1.5) {
    reasons.push(`主力资金净流入 ${formatYi(funds.mainNet)}，占成交额 ${funds.mainNetRatio.toFixed(2)}%`)
  }
  if (Number.isFinite(finance?.roe) && finance.roe >= 15) reasons.push(`ROE ${finance.roe}%，盈利能力较好`)
  if (Number.isFinite(finance?.profitYoY) && finance.profitYoY > 10) reasons.push(`净利润同比增长 ${finance.profitYoY}%`)
  if (Number.isFinite(industry?.changePct) && industry.changePct > 0) reasons.push(`所属行业「${industry.name}」上涨 ${industry.changePct}%`)
  if (hotItem && Number.isFinite(hotItem.rank) && hotItem.rank <= 30) reasons.push(`市场热榜第 ${hotItem.rank} 名，关注度较高`)
  const emFlow = eastmoney?.data?.fundFlow
  if (Number.isFinite(emFlow?.main5)) {
    if (emFlow.main5 > 0) reasons.push(`东方财富口径近 5 日主力净流入 ${formatYi(emFlow.main5)}`)
    else if (emFlow.main5 < 0) risks.push(`东方财富口径近 5 日主力净流出 ${formatYi(Math.abs(emFlow.main5))}`)
  }

  if (Number.isFinite(quote?.peTTM) && quote.peTTM > 50) risks.push(`市盈率 ${quote.peTTM} 倍，估值偏高`)
  if (Number.isFinite(quote?.peTTM) && quote.peTTM <= 0) risks.push('公司处于亏损状态，市盈率为负')
  const financialSector = /银行|保险|证券|多元金融|信托/.test(String(ctxData.industry?.name ?? ''))
  if (Number.isFinite(finance?.debtRatio) && finance.debtRatio > 65 && !financialSector) {
    risks.push(`资产负债率 ${finance.debtRatio}%，偿债压力偏大`)
  }
  if (Number.isFinite(finance?.profitYoY) && finance.profitYoY < 0) risks.push(`净利润同比 ${finance.profitYoY}%，业绩承压`)
  if (Number.isFinite(funds?.mainNetRatio) && funds.mainNetRatio < -1.5) risks.push(`主力资金净流出 ${formatYi(funds.mainNet)}`)
  if (Number.isFinite(quote?.price) && Number.isFinite(technical?.ma?.ma20) && quote.price < technical.ma.ma20) {
    risks.push('股价位于 20 日均线下方，趋势偏弱')
  }
  if (Number.isFinite(quote?.high52) && Number.isFinite(quote?.price) && quote.high52 > 0 && quote.price / quote.high52 > 0.92) {
    risks.push('股价接近 52 周高点，注意回撤风险')
  }
  if (Number.isFinite(finance?.pledgeRatio) && finance.pledgeRatio > 20) risks.push(`质押股份占总股本 ${finance.pledgeRatio}%`)
  if (Number.isFinite(technical?.rsi?.rsi6) && technical.rsi.rsi6 > 75) risks.push(`RSI6 达 ${technical.rsi.rsi6}，短期超买，注意回调`)
  else if (Number.isFinite(technical?.kdj?.j) && technical.kdj.j > 100) risks.push(`KDJ 的 J 值 ${technical.kdj.j}，短期超买`)
  if (risks.length === 0) risks.push('注意大盘系统性风险与行业政策变化，严格执行止损')

  const confidence = clamp(
    Math.round(40 + Math.abs(finalScore - 50) * 1.2 + ((ctxData.sources ?? []).filter((item) => item.ok).length * 5)),
    35,
    95,
  )

  return {
    score: finalScore,
    rating,
    action,
    horizon: horizons[rating] ?? '1-3 个月',
    confidence: confidence >= 75 ? '高' : confidence >= 55 ? '中高' : '中',
    position: positions[rating] ?? '3-5 成',
    reasons: reasons.slice(0, 6),
    risks: risks.slice(0, 6),
    levels: {
      support,
      resistance,
      stopLoss,
      target,
      buyZone: buyZoneLow !== null && buyZoneHigh !== null ? `${buyZoneLow} - ${buyZoneHigh}` : null,
    },
    scores: { technical: techScore, funds: fundScore, valuation: valuationScore, finance: financeScore, industry: industryScore, sentiment: sentimentScore },
    disclaimer: '本分析由同花顺与东方财富公开数据结合规则模型自动生成，仅供参考，不构成投资建议。股市有风险，投资需谨慎。',
  }
}

/* ------------------------------------------------------------------ */
/* 汇总分析                                                            */
/* ------------------------------------------------------------------ */

function buildQuote(items, resolved) {
  const price = num(items?.['10'])
  const preClose = num(items?.['6'])
  const limitRate = limitRateOf(resolved.code, items?.name)
  const limitUp = preClose !== null ? round(preClose * (1 + limitRate / 100), 2) : null
  const limitDown = preClose !== null ? round(preClose * (1 - limitRate / 100), 2) : null
  const peDynamic = num(items?.['2034120'])
  const peTTM = num(items?.['2942']) ?? peDynamic
  const peStatic = num(items?.['134152'])
  const pb = num(items?.['1149395']) ?? num(items?.['592920'])
  const bvps = price !== null && pb ? round(price / pb, 2) : null
  return {
    code: resolved.code,
    name: String(items?.name ?? resolved.name ?? '').trim(),
    market: resolved.market ?? marketOf(resolved.code),
    board: boardOf(resolved.code, String(items?.name ?? '')),
    price,
    preClose,
    open: num(items?.['7']),
    high: num(items?.['8']),
    low: num(items?.['9']),
    avgPrice: num(items?.['1378761']),
    change: num(items?.['264648']),
    changePct: num(items?.['199112']),
    amplitude: num(items?.['526792']),
    amount: num(items?.['19']),
    volume: num(items?.['13']),
    turnoverRate: num(items?.['1968584']),
    volumeRatio: num(items?.['1771976']),
    peTTM,
    peDynamic,
    peStatic,
    pb,
    eps: null,
    bvps,
    totalMv: num(items?.['3475914']),
    circMv: num(items?.['3541450']),
    high52: num(items?.['69']),
    low52: num(items?.['70']),
    limitUp,
    limitDown,
    outerVol: num(items?.['14']),
    innerVol: num(items?.['15']),
    quoteAt: String(items?.updateTime ?? '').trim() || null,
    stockStatus: String(items?.stockStatus ?? '').trim() || null,
    suspended: price === null || price === 0,
  }
}

function buildFunds(items, quote) {
  const hasTiers = ['223', '225', '237', '259'].every((key) => items?.[key] !== undefined && items?.[key] !== null && items?.[key] !== '')
  const amount = quote?.amount ?? null
  if (hasTiers) {
    const superNet = num(items['223']) - num(items['224'])
    const largeNet = num(items['225']) - num(items['226'])
    const mediumNet = num(items['237']) - num(items['238'])
    const smallNet = num(items['259']) - num(items['260'])
    const mainNet = superNet + largeNet
    const netIn = superNet + largeNet + mediumNet + smallNet
    return {
      superNet: round(superNet, 2),
      largeNet: round(largeNet, 2),
      mediumNet: round(mediumNet, 2),
      smallNet: round(smallNet, 2),
      mainNet: round(mainNet, 2),
      netIn: round(netIn, 2),
      mainNetRatio: amount ? round((mainNet / amount) * 100, 2) : null,
      netRatio: amount ? round((netIn / amount) * 100, 2) : null,
      estimated: false,
      outerVol: quote?.outerVol ?? null,
      innerVol: quote?.innerVol ?? null,
    }
  }
  const outer = num(items?.['14'])
  const inner = num(items?.['15'])
  const avg = quote?.avgPrice ?? quote?.price
  const estimatedNet = Number.isFinite(outer) && Number.isFinite(inner) && Number.isFinite(avg) ? (outer - inner) * avg : null
  return {
    superNet: null,
    largeNet: null,
    mediumNet: null,
    smallNet: null,
    mainNet: estimatedNet,
    netIn: estimatedNet,
    mainNetRatio: amount && estimatedNet ? round((estimatedNet / amount) * 100, 2) : null,
    netRatio: amount && estimatedNet ? round((estimatedNet / amount) * 100, 2) : null,
    estimated: true,
    outerVol: outer,
    innerVol: inner,
  }
}

function buildFinance(f10, company) {
  const main = f10?.main ?? {}
  const finance = f10?.finance ?? {}
  const reportText = main.report ?? {}
  return {
    report: reportText.period ?? finance.reportPeriod ?? null,
    eps: main.eps ?? reportText.eps ?? null,
    epsTTM: main.epsTTM ?? null,
    netProfit: reportText.netProfit ?? null,
    netProfitYoY: reportText.netProfitYoY ?? finance.profitYoY ?? null,
    revenue: null,
    revenueYoY: finance.revenueYoY ?? null,
    grossMargin: finance.grossMargin ?? null,
    netMargin: finance.netMargin ?? null,
    roe: finance.roe ?? null,
    debtRatio: finance.debtRatio ?? null,
    profitYoY: finance.profitYoY ?? null,
    cashRatio: finance.cashRatio ?? null,
    cashPerShare: main.cashPerShare ?? null,
    totalShares: main.totalShares ?? null,
    floatShares: main.floatShares ?? null,
    holderConcentration: main.holderConcentration ?? null,
    pledgeRatio: main.pledgeRatio ?? null,
    peDynamic: main.peDynamic ?? null,
    peStatic: main.peStatic ?? null,
    business: main.business ?? company?.business ?? null,
    swIndustry: company?.swIndustry ?? null,
    area: main.area ?? company?.area ?? null,
    listedAt: company?.listedAt ?? null,
    profile: company?.companyProfile ? truncate(company.companyProfile, 300) : null,
    financeTags: Array.isArray(main.financeTags) ? main.financeTags.slice(0, 6) : [],
    ranks: Array.isArray(finance.ranks) ? finance.ranks.slice(0, 8) : [],
    diagnosis: Array.isArray(finance.diagnosis) ? finance.diagnosis.slice(0, 8) : [],
  }
}

function buildIndustry(board, detail, industryList, swIndustry, fallbackName) {
  if (!board) {
    return {
      name: normaliseIndustryName(fallbackName) || null,
      swName: swIndustry ?? null,
      code: null,
      changePct: null,
      rank: null,
      total: Array.isArray(industryList) ? industryList.length : null,
      netIn: null,
      upCount: null,
      downCount: null,
      leader: null,
      peers: [],
      stockRank: null,
      hotSectors: [],
    }
  }
  const peers = (detail?.components ?? []).slice(0, 10).map((item) => ({
    code: item.code,
    name: item.name,
    price: item.price,
    changePct: item.changePct,
  }))
  return {
    name: board.name,
    swName: swIndustry ?? null,
    code: board.code ?? null,
    changePct: board.changePct ?? null,
    rank: board.rank ?? null,
    total: board.total ?? (Array.isArray(industryList) ? industryList.length : null),
    netIn: board.netIn ?? null,
    upCount: board.upCount ?? null,
    downCount: board.downCount ?? null,
    leader: board.leader ? { name: board.leader, code: board.leaderCode ?? null, changePct: board.leaderChangePct ?? null } : null,
    peers,
    stockRank: detail?.stockRank ?? null,
    hotSectors: (industryList ?? []).slice(0, 5).map((item) => ({
      name: item.name,
      changePct: item.changePct,
      netIn: item.netIn,
      leader: item.leader,
    })),
  }
}

function attachIndustryRank(board, list) {
  if (!board) return null
  const index = list.findIndex((item) => item.code === board.code)
  return {
    ...board,
    rank: index >= 0 ? index + 1 : null,
    total: list.length,
  }
}

/* ------------------------------------------------------------------ */
/* 文本报告（Agent 工具）                                              */
/* ------------------------------------------------------------------ */

function formatReport(result, section = 'all') {
  const { quote, funds, technical, finance, industry, related, news, hot, advice, meta } = result
  const lines = []
  const sections = section === 'all' ? ['summary', 'technical', 'funds', 'industry', 'finance', 'news', 'hot', 'advice'] : [section]

  for (const key of sections) {
    if (key === 'summary') {
      lines.push(`## ${quote.name}（${quote.code}.${quote.market}）`)
      lines.push(
        `现价 ${fmtPrice(quote.price)}｜涨跌 ${formatPct(quote.changePct)}｜${quote.board}｜成交额 ${formatYi(quote.amount)}｜换手 ${fmtNum(quote.turnoverRate)}%`,
      )
      lines.push(
        `PE(TTM) ${fmtNum(quote.peTTM)}｜PB ${fmtNum(quote.pb)}｜总市值 ${formatYi(quote.totalMv)}｜52 周 ${fmtPrice(quote.low52)} - ${fmtPrice(quote.high52)}`,
      )
      lines.push(`数据源：${meta.sources.map((item) => `${item.label}${item.ok ? '✓' : '✗'}`).join(' / ')}｜行情时间 ${quote.quoteAt ?? '—'}`)
      lines.push(`综合评价：**${advice.rating}**（${advice.score}/100）`)
    } else if (key === 'technical') {
      lines.push('', '### 技术面', `趋势：${technical.trend.label}（${technical.trend.score} 分）｜${technical.trend.text}`)
      for (const item of technical.items) lines.push(`- ${item.label}：${item.value}（${item.note}）`)
      lines.push(`支撑 ${fmtPrice(technical.support)}｜压力 ${fmtPrice(technical.resistance)}｜止损参考 ${fmtPrice(technical.stopLoss)}`)
    } else if (key === 'funds') {
      lines.push('', '### 资金面')
      if (funds.estimated) lines.push('（同花顺未提供四档数据，以下为外盘/内盘估算）')
      lines.push(
        `主力净额 ${formatSignedYi(funds.mainNet)}｜特大单 ${formatSignedYi(funds.superNet)}｜大单 ${formatSignedYi(funds.largeNet)}`,
      )
      lines.push(
        `中单 ${formatSignedYi(funds.mediumNet)}｜小单 ${formatSignedYi(funds.smallNet)}｜净流入 ${formatSignedYi(funds.netIn)}｜占成交额 ${fmtNum(funds.netRatio)}%`,
      )
      if (funds.em && Number.isFinite(funds.em.main5)) {
        lines.push(
          `东方财富口径：近 5 日主力净流入 ${formatSignedYi(funds.em.main5)}｜近 10 日 ${formatSignedYi(funds.em.main10)}｜近 20 日 ${formatSignedYi(funds.em.main20)}`,
        )
      }
    } else if (key === 'industry') {
      lines.push('', '### 行业与板块')
      lines.push(
        `行业：${industry.name ?? '—'}${industry.swName ? `（申万：${industry.swName}）` : ''}｜板块涨跌 ${formatPct(industry.changePct)}｜板块排名 ${industry.rank ?? '—'}/${industry.total ?? '—'}｜净流入 ${industry.netIn !== null && industry.netIn !== undefined ? `${industry.netIn} 亿` : '—'}`,
      )
      if (industry.leader) lines.push(`领涨股：${industry.leader.name}`)
      if (industry.peers.length) lines.push(`同行：${industry.peers.map((item) => `${item.name}(${formatPct(item.changePct)})`).join('、')}`)
      if (industry.hotSectors.length) {
        lines.push(`热门板块：${industry.hotSectors.map((item) => `${item.name} ${formatPct(item.changePct)}`).join('、')}`)
      }
      if (related?.concepts?.length) {
        lines.push(
          `关联概念股：${related.concepts
            .map((item) => `${item.name}（今日 ${formatPct(item.changePct)}，5 日 ${formatPct(item.change5d)}，${item.stockCount ?? '—'} 只）`)
            .join('；')}`,
        )
      }
      if (related?.sectors?.length) {
        lines.push(
          `关联板块：${related.sectors
            .map((item) => `${item.name}[${item.kind === 'concept' ? '概念' : '行业'}] 今日 ${formatPct(item.changePct)} / 5 日 ${formatPct(item.change5d)}`)
            .join('；')}`,
        )
      }
    } else if (key === 'finance') {
      lines.push('', '### 基本面')
      lines.push(`报告期：${finance.report ?? '—'}｜EPS ${fmtNum(finance.eps)}｜净利润 ${formatYi(finance.netProfit)}（同比 ${formatPct(finance.netProfitYoY)}）`)
      lines.push(
        `毛利率 ${fmtNum(finance.grossMargin)}%｜净利率 ${fmtNum(finance.netMargin)}%｜ROE ${fmtNum(finance.roe)}%｜资产负债率 ${fmtNum(finance.debtRatio)}%｜营收增速 ${formatPct(finance.revenueYoY)}`,
      )
      if (finance.diagnosis.length) for (const item of finance.diagnosis) lines.push(`- ${item}`)
    } else if (key === 'news') {
      lines.push('', '### 消息面')
      if (!news.length) lines.push('暂无相关资讯')
      for (const item of news) lines.push(`- ${item.time ? `[${item.time}] ` : ''}${item.title}`)
    } else if (key === 'hot') {
      lines.push('', '### 市场热点')
      lines.push(`热榜：${hot.rank ? `第 ${hot.rank} 名（热度 ${hot.rate ?? '—'}）` : '未进入同花顺热榜'}`)
      if (hot.reason) lines.push(`热度原因：${truncate(hot.reason, 240)}`)
      if (hot.concepts.length) lines.push(`概念：${hot.concepts.map((item) => item.name).join('、')}`)
    } else if (key === 'advice') {
      lines.push('', `### 投资建议：${advice.rating}（${advice.score}/100）`)
      lines.push(`操作：${advice.action}`)
      lines.push(`周期：${advice.horizon}｜置信度：${advice.confidence}｜建议仓位：${advice.position}`)
      lines.push('利好因素：')
      for (const item of advice.reasons) lines.push(`- ${item}`)
      lines.push('风险提示：')
      for (const item of advice.risks) lines.push(`- ${item}`)
      lines.push(
        `关键价位：支撑 ${fmtPrice(advice.levels.support)}｜压力 ${fmtPrice(advice.levels.resistance)}｜止损 ${fmtPrice(advice.levels.stopLoss)}｜目标 ${fmtPrice(advice.levels.target)}｜买入区间 ${advice.levels.buyZone ?? '—'}`,
      )
      lines.push('', advice.disclaimer)
    }
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

export const inject = ['webServer', 'tools']
export const name = 'dsh-stock-analyzer'

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    const value = config?.[key]
    if (value !== undefined && value !== null) cfg[key] = value
  }
  cfg.cacheMinutes = Math.max(1, Math.min(60, Number(cfg.cacheMinutes) || 5))
  cfg.f10CacheHours = Math.max(1, Math.min(72, Number(cfg.f10CacheHours) || 6))
  cfg.requestTimeoutMs = Math.max(5000, Math.min(60000, Number(cfg.requestTimeoutMs) || 25000))

  const state = {
    inflight: new Map(),
    lastError: null,
  }

  async function analyse(rawQuery, { refresh = false } = {}) {
    const started = Date.now()
    const timeoutMs = cfg.requestTimeoutMs
    const resolved = await resolveStock(rawQuery, timeoutMs)
    const cacheKey = `analysis:${resolved.code}`
    if (!refresh) {
      const hit = cacheGet(cacheKey)
      if (hit) return { ...hit, meta: { ...hit.meta, cached: true } }
    }
    const inflightKey = resolved.code
    if (state.inflight.has(inflightKey)) return state.inflight.get(inflightKey)
    const task = (async () => {
      const warnings = []
      const thsResults = await Promise.allSettled([
        fetchRealhead(resolved.code, timeoutMs),
        fetchKline(resolved.code, timeoutMs, refresh),
        fetchF10(resolved.code, timeoutMs),
        fetchIndustryList(timeoutMs),
        fetchHotList(timeoutMs),
        fetchNewsFeed(timeoutMs),
      ])
      const [realheadResult, klineResult, f10Result, industryResult, hotResult, newsResult] = thsResults
      if (realheadResult.status === 'rejected') throw new Error(`同花顺行情获取失败：${errorText(realheadResult.reason)}`)

      const items = realheadResult.value
      if (!items) throw new Error('同花顺未返回该股票行情，请确认代码是否正确')
      const quote = buildQuote(items, resolved)
      const kline = klineResult.status === 'fulfilled' ? klineResult.value : null
      const f10 = f10Result.status === 'fulfilled' ? f10Result.value : null
      const industryList = industryResult.status === 'fulfilled' ? industryResult.value : []
      const hotData = hotResult.status === 'fulfilled' ? hotResult.value : null
      const newsFeed = newsResult.status === 'fulfilled' ? newsResult.value : []

      if (!kline || kline.rows.length < 30) warnings.push('K 线数据不足，技术指标仅供参考')
      if (!f10) warnings.push('同花顺 F10 页面获取失败，基本面与行业信息可能缺失')
      else if (f10.failures.length) warnings.push(`F10 部分页面获取失败（${f10.failures.length} 个）`)
      if (!hotData) warnings.push('同花顺热榜获取失败')
      if (!industryList.length) warnings.push('同花顺行业板块排行获取失败')

      const technical = kline && kline.rows.length ? buildTechnical(kline.rows, quote.price ?? kline.rows[kline.rows.length - 1].close) : null
      const funds = buildFunds(items, quote)
      const finance = buildFinance(f10, f10?.company)
      if (finance.eps === null && f10?.main?.eps) finance.eps = f10.main.eps
      if (quote.eps === null) quote.eps = finance.eps ?? (quote.price && quote.peTTM ? round(quote.price / quote.peTTM, 2) : null)

      const industryNameRaw = f10?.main?.industryName ?? finance.swIndustry ?? null
      let board = findIndustryBoard(industryList, industryNameRaw)
      board = attachIndustryRank(board, industryList)
      let industryDetail = null
      let industryBottom = null
      if (board?.code) {
        const [mainDetail, bottomDetail] = await Promise.allSettled([
          fetchIndustryDetail(board.code, timeoutMs),
          fetchIndustryDetailAsc(board.code, timeoutMs),
        ])
        if (mainDetail.status === 'fulfilled') industryDetail = mainDetail.value
        else warnings.push(`行业成分股获取失败：${errorText(mainDetail.reason)}`)
        if (bottomDetail.status === 'fulfilled') industryBottom = bottomDetail.value
      }
      const industry = buildIndustry(board, industryDetail, industryList, finance.swIndustry, f10?.main?.industryName)
      const components = Array.isArray(industryDetail?.components) ? industryDetail.components : []
      const stockIndex = components.findIndex((item) => item.code === resolved.code)
      industry.stockRank =
        stockIndex >= 0
          ? { rank: stockIndex + 1, total: components.length, changePct: components[stockIndex].changePct }
          : industry.stockRank ?? null

      // 关联概念股 / 关联板块：取概念热度前两个可匹配的同花顺概念，补齐今日与近 5 日涨跌。
      const related = { concepts: [], sectors: [] }
      try {
        const conceptBoards = await fetchConceptBoards(timeoutMs)
        const heatNames = (f10?.main?.concepts ?? []).map((item) => item.name).filter(Boolean)
        const targets = []
        for (const name of heatNames) {
          const boardItem = conceptBoards.find((item) => item.name === name)
          if (boardItem && !targets.some((target) => target.code === boardItem.code)) targets.push(boardItem)
          if (targets.length >= 2) break
        }
        const details = await Promise.allSettled(targets.map((target) => fetchConceptDetail(target.code, timeoutMs)))
        const matched = targets.map((target, index) => ({
          target,
          detail: details[index].status === 'fulfilled' ? details[index].value : null,
        }))
        const bottomComponents = Array.isArray(industryBottom?.components) ? industryBottom.components : []
        const statCodes = [
          ...components.slice(0, 10).map((item) => item.code),
          ...bottomComponents.slice(0, 10).map((item) => item.code),
          ...matched.flatMap((item) => (item.detail?.components ?? []).slice(0, 10).map((stock) => stock.code)),
          ...matched.flatMap((item) =>
            (item.detail?.full ? (item.detail?.sampleComponents ?? []).slice(0, 50) : spread(item.detail?.sampleComponents ?? [], 20)).map(
              (stock) => stock.code,
            ),
          ),
        ]
        const stats = await fetchStatsMap(statCodes, timeoutMs)
        const average = (values) => {
          const list = values.filter((value) => Number.isFinite(value))
          return list.length ? round(list.reduce((sum, value) => sum + value, 0) / list.length, 2) : null
        }
        function spread(list, limit) {
          if (!Array.isArray(list) || list.length <= limit) return list ?? []
          const step = list.length / limit
          return Array.from({ length: limit }, (_, index) => list[Math.floor(index * step)])
        }
        const enrich = (stock) => {
          const stat = stats.get(stock.code)
          return {
            code: stock.code,
            name: stock.name,
            price: stock.price ?? null,
            changePct: Number.isFinite(stock.changePct) ? stock.changePct : stat?.changePct ?? null,
            change5d: stat?.change5d ?? null,
          }
        }
        industry.peers = (industry.peers ?? []).map((peer) => ({
          ...peer,
          change5d: stats.get(peer.code)?.change5d ?? null,
        }))
        for (const { target, detail } of matched) {
          const header = detail?.header ?? {}
          const stocks = (detail?.components ?? []).slice(0, 10).map(enrich)
          const sampleCodes = [
            ...(detail?.components ?? []),
            ...(detail?.full ? (detail?.sampleComponents ?? []).slice(0, 50) : spread(detail?.sampleComponents ?? [], 20)),
          ].map((stock) => stock.code)
          const stockCount =
            header.upCount !== null && header.downCount !== null
              ? header.upCount + header.downCount
              : detail?.components?.length ?? target.stockCount ?? null
          related.concepts.push({
            name: target.name,
            code: target.code,
            stockCount,
            rank: header.rank ?? null,
            rankTotal: header.total ?? null,
            upCount: header.upCount ?? null,
            downCount: header.downCount ?? null,
            changePct: header.changePct ?? average(stocks.map((stock) => stock.changePct)),
            change5d: average(sampleCodes.map((code) => stats.get(code)?.change5d)),
            stocks,
          })
        }
        const industryCodes = [
          ...components.slice(0, 10).map((item) => item.code),
          ...bottomComponents.slice(0, 10).map((item) => item.code),
        ]
        const industryChange5d = average(industryCodes.map((code) => stats.get(code)?.change5d))
        related.sectors.push({
          name: industry.name ?? normaliseIndustryName(f10?.main?.industryName) ?? null,
          code: industry.code ?? null,
          kind: 'industry',
          changePct: industry.changePct ?? null,
          change5d: industryChange5d,
          stockCount: components.length || null,
          stocks: (industry.peers ?? []).slice(0, 10),
        })
        for (const concept of related.concepts) {
          related.sectors.push({
            name: concept.name,
            code: concept.code,
            kind: 'concept',
            changePct: concept.changePct,
            change5d: concept.change5d,
            stockCount: concept.stockCount,
            stocks: concept.stocks,
          })
        }
      } catch (error) {
        warnings.push(`关联概念股/板块获取失败：${errorText(error)}`)
      }

      const hotItem = (hotData?.stocks ?? []).find((item) => item.code === resolved.code) ?? null
      const conceptList = Array.isArray(f10?.concepts) ? f10.concepts : []
      const concepts = conceptList.slice(0, 8).map((item) => ({ name: item.name, desc: truncate(item.desc, 160) }))
      const conceptHeat = (f10?.main?.concepts ?? []).slice(0, 8).map((item) => ({ name: item.name, rank: item.rank }))
      const hot = {
        rank: hotItem?.rank ?? null,
        rate: hotItem?.rate ?? null,
        reason: hotItem?.reason ? truncate(hotItem.reason, 300) : null,
        concepts,
        conceptHeat,
        marketNews: (newsFeed ?? []).slice(0, 6).map((item) => ({ title: item.title, url: item.url, time: timeOf(item.time) ?? item.time ?? null })),
      }
      if (!hotItem) hot.reason = null

      const eastmoney = await fetchEastmoney(resolved.code, quote.market, quote.name, timeoutMs, cfg)
      if (!eastmoney.available) warnings.push(`东方财富：${eastmoney.reason}`)
      if (eastmoney.data) {
        const emFinance = eastmoney.data.finance
        if (emFinance) {
          const fill = (key, value) => {
            if ((finance[key] === null || finance[key] === undefined) && value !== null && value !== undefined) {
              finance[key] = value
            }
          }
          fill('report', emFinance.report)
          fill('eps', emFinance.eps)
          fill('bps', emFinance.bps)
          fill('revenue', emFinance.revenue)
          fill('netProfit', emFinance.netProfit)
          fill('revenueYoY', emFinance.revenueYoY)
          fill('netProfitYoY', emFinance.netProfitYoY)
          fill('roe', emFinance.roe)
          fill('grossMargin', emFinance.grossMargin)
          fill('netMargin', emFinance.netMargin)
          fill('debtRatio', emFinance.debtRatio)
          fill('cashPerShare', emFinance.cashPerShare)
          finance.emReports = emFinance.reports
          if (quote.eps === null && Number.isFinite(emFinance.eps)) quote.eps = emFinance.eps
          if (quote.bvps === null && Number.isFinite(emFinance.bps)) quote.bvps = emFinance.bps
        }
        const flow = eastmoney.data.fundFlow
        if (flow) {
          funds.em = {
            main5: flow.main5,
            main10: flow.main10,
            main20: flow.main20,
            latestDate: flow.latestDate,
            latestMain: flow.latestMain,
            days: flow.days.slice(-10),
          }
        }
      }

      const news = pickNews(newsFeed, { ...(f10?.main ?? {}), name: quote.name }, industry.name, eastmoney)

      const sources = [
        {
          id: 'ths',
          label: '同花顺',
          ok: Boolean(items),
          note: [items ? '行情' : null, kline ? 'K线' : null, f10 ? 'F10' : null, industryList.length ? '行业' : null, hotData ? '热榜' : null, newsFeed.length ? '资讯' : null]
            .filter(Boolean)
            .join('/'),
        },
        {
          id: 'eastmoney',
          label: '东方财富',
          ok: eastmoney.available,
          note: eastmoney.available
            ? [
                eastmoney.data?.fundFlow ? '资金流' : null,
                eastmoney.data?.finance ? '财务' : null,
                eastmoney.data?.notices?.length ? '公告' : null,
                eastmoney.data?.news?.length ? '资讯' : null,
              ]
                .filter(Boolean)
                .join('/')
            : eastmoney.reason,
        },
      ]

      const advice = buildAdvice({ quote, technical, funds, finance, industry, hot, hotItem, sources, eastmoney })

      const result = {
        ok: true,
        error: null,
        warnings,
        meta: {
          generatedAt: new Date().toISOString(),
        tradeDate: (quote.quoteAt ?? '').slice(0, 10) || shanghaiDate(),
          quoteAt: quote.quoteAt ?? null,
          cached: false,
          stale: false,
          elapsedMs: Date.now() - started,
          sources,
        },
        query: {
          raw: resolved.raw,
          code: resolved.code,
          name: quote.name,
          market: quote.market,
          board: quote.board,
        },
        quote,
        funds,
        technical,
        finance,
        industry,
        related,
        news,
        hot,
        advice,
        eastmoney: { available: eastmoney.available, reason: eastmoney.reason, data: eastmoney.data ?? null },
      }
      cacheSet(cacheKey, result, cfg.cacheMinutes * 60_000)
      return result
    })()
    state.inflight.set(inflightKey, task)
    try {
      return await task
    } finally {
      state.inflight.delete(inflightKey)
    }
  }

  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': String(Buffer.byteLength(body)),
    })
    res.end(body)
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: API_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: '仅支持 GET', warnings: [], meta: { generatedAt: new Date().toISOString(), sources: [] }, query: null })
          return
        }
        try {
          const url = new URL(req.url ?? API_PATH, 'http://127.0.0.1')
          const q = url.searchParams.get('q') ?? ''
          const refresh = url.searchParams.get('refresh') === '1'
          const result = await analyse(q, { refresh })
          sendJson(res, 200, { ...result, serverTime: new Date().toISOString() })
        } catch (error) {
          state.lastError = errorText(error)
          sendJson(res, 200, {
            ok: false,
            error: state.lastError,
            warnings: [],
            meta: { generatedAt: new Date().toISOString(), sources: [], elapsedMs: 0 },
            query: null,
          })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: SEARCH_PATH,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: '仅支持 GET', items: [] })
          return
        }
        try {
          const url = new URL(req.url ?? SEARCH_PATH, 'http://127.0.0.1')
          const q = url.searchParams.get('q') ?? ''
          const items = await searchStocks(q, cfg.requestTimeoutMs)
          sendJson(res, 200, { ok: true, error: null, items })
        } catch (error) {
          sendJson(res, 200, { ok: false, error: errorText(error), items: [] })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'stock_analysis',
      description:
        '对单只 A 股做全维度分析：输入股票代码或名称，返回行情估值、技术指标（MA/MACD/KDJ/RSI/BOLL/ATR/量能）、四档资金流与主力动向、所属行业与板块排名、F10 财务诊断、个股公告与相关资讯、同花顺热榜热点，并给出规则化投资建议（评分、评级、操作、关键价位、风险）。' +
        '数据源：同花顺公开接口 + 东方财富（资金流历史、主要财务指标、公告与资讯）。当用户询问某只股票的走势、指标、行业、消息、热点或投资建议时使用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string', description: '股票代码，如 600519、sh600519、600519.SH。与 name 二选一。' },
          name: { type: 'string', description: '股票名称，如 贵州茅台。与 code 二选一。' },
          section: {
            type: 'string',
            enum: ['all', 'summary', 'technical', 'funds', 'industry', 'finance', 'news', 'hot', 'advice'],
            description: '返回章节，默认 all。',
          },
          refresh: { type: 'boolean', description: '是否强制刷新（跳过 5 分钟缓存），默认 false。' },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
        render(_args, value) {
          return [{ type: 'text', text: value.text }]
        },
      },
      async execute(args) {
        const query = String(args?.code ?? '').trim() || String(args?.name ?? '').trim()
        if (!query) throw new Error('请提供 code 或 name')
        const result = await analyse(query, { refresh: args?.refresh === true })
        const section = typeof args?.section === 'string' ? args.section : 'all'
        return { text: formatReport(result, section) }
      },
    }),
  )

  ctx.logger?.info?.(`[stock-analyzer] 已启动：${API_PATH}（数据源：同花顺 + 东方财富${cfg.eastmoneyEnabled === false ? '，东方财富已关闭' : ''}）`)
}
