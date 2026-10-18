/**
 * dsh-stock-analyzer / ths-pages.js
 *
 * 同花顺公开页面解析（纯函数）。
 *
 * 约束：
 * - 零依赖：不 import 任何包，不做网络 / 文件 IO，不使用 DOM，不访问全局状态。
 * - 输入都是「抓取到的文本」（HTML 或 JSON/JSONP 文本），输出结构化对象。
 * - 所有数值统一 Number；缺失一律返回 null（绝不拿 0 冒充缺失）。
 * - 价格 / 涨跌幅保持原始精度；百分比字段直接是百分数（1.22 => 1.22%）。
 * - 每个导出函数自带 try/catch，异常时返回空结构，绝不抛错。
 *
 * 页面样本：_probe/{main,finance,concept,company,field}.html、industry-list.html、
 * industry-881273.html、hot-list.json、news.json、realhead-600519.js、line-600519.js
 */

/* ------------------------------------------------------------------ */
/* 通用小工具                                                          */
/* ------------------------------------------------------------------ */

const EMPTY = ''

/** HTML 实体表（同花顺页面里最常见的一批）。 */
const ENTITIES = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  middot: '\u00b7',
  times: '\u00d7',
  divide: '\u00f7',
  deg: '\u00b0',
  permil: '\u2030',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  yen: '\u00a5',
  sup2: '\u00b2',
  sup3: '\u00b3',
}

/** 解码 HTML 实体（数字实体按码点处理，未知实体原样保留）。 */
function decodeEntities(input) {
  if (input === null || input === undefined) return EMPTY
  return String(input).replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (all, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return all
      try {
        return String.fromCodePoint(code)
      } catch {
        return all
      }
    }
    const key = body.toLowerCase()
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : all
  })
}

/**
 * 去掉标签、脚本、注释并解码实体，压缩空白。
 * 传入非字符串时返回空串。
 */
export function stripHtml(html) {
  try {
    if (html === null || html === undefined) return EMPTY
    let s = String(html)
    s = s.replace(/<!--[\s\S]*?-->/g, ' ')
    s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    s = s.replace(/<br\s*\/?>/gi, ' ')
    s = s.replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|ul|ol|dl|dd|dt|table|tbody|thead|span|em|strong|a)\s*>/gi, ' ')
    s = s.replace(/<[^>]*>/g, ' ')
    s = decodeEntities(s)
    s = s.replace(/[\s\u00a0\u3000]+/g, ' ')
    return s.trim()
  } catch {
    return EMPTY
  }
}

/** 文本化并去掉空值：空串 => null。 */
function text(input) {
  const s = stripHtml(input)
  return s ? s : null
}

/** 原始文本（不 stripHtml），压缩空白；空串 => null。 */
function rawText(input) {
  if (input === null || input === undefined) return null
  const s = decodeEntities(String(input)).replace(/[\s\u00a0\u3000]+/g, ' ').trim()
  return s ? s : null
}

/** 是否为「占位式空值」（页面常用这些表示没有数据）。 */
function isBlankValue(s) {
  if (s === null || s === undefined) return true
  const v = String(s).replace(/[\s\u00a0\u3000]/g, '')
  return v === '' || v === '-' || v === '--' || v === '---' || v === '\u2014' || v === '未公布' || v === '暂无' || v === '不适用' || v === 'N/A' || v === 'null'
}

/** 解析成 Number，保留符号与小数；不可解析返回 null。 */
function num(input) {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (isBlankValue(input)) return null
  const s = String(input).replace(/,/g, '').replace(/[\s\u00a0]/g, '')
  const m = s.match(/[-+]?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * 带中文量级单位解析成「元 / 股」级别的数值：
 * "445.17亿元" => 44517000000，"12.50亿股" => 1250000000，"2438.48万股" => 24384800。
 * 无单位时原样返回数值（保留精度）。
 */
function scaledNum(input) {
  if (input === null || input === undefined) return null
  if (isBlankValue(input)) return null
  const s = String(input).replace(/,/g, '').replace(/[\s\u00a0]/g, '')
  const m = s.match(/[-+]?\d+(?:\.\d+)?(万亿|亿|万)?/)
  if (!m) return null
  const base = Number((m[0].match(/[-+]?\d+(?:\.\d+)?/) || [NaN])[0])
  if (!Number.isFinite(base)) return null
  const unit = m[1]
  if (unit === '万亿') return Math.round(base * 1e12)
  if (unit === '亿') return Math.round(base * 1e8)
  if (unit === '万') return Math.round(base * 1e4)
  return base
}

/** "20260320" / "2026-03-20" / "2026/03/20" => "2026-03-20"；其它原样返回。 */
function isoDate(input) {
  if (isBlankValue(input)) return null
  const s = String(input).trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/)
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
  }
  return s || null
}

/** 季度末日期 => 中文报告期，如 "2026-06-30" => "2026年中报"。 */
function reportPeriodFromDate(input) {
  const s = String(input || EMPTY)
  const m = s.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/)
  if (!m) return null
  const suffix = { '03': '一季报', '06': '中报', '09': '三季报', '12': '年报' }[m[2]]
  return suffix ? `${m[1]}年${suffix}` : null
}

/** unix 秒 => "YYYY-MM-DD HH:mm"（按东八区，A 股数据惯例）。 */
function tsToText(input) {
  const n = num(input)
  if (n === null || n <= 0) return null
  const d = new Date(n * 1000 + 8 * 3600 * 1000)
  if (Number.isNaN(d.getTime())) return null
  const iso = d.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** 宽松 JSON / JSONP 解析：取第一个 `{`/`[` 到最后一个 `}`/`]`。 */
function parseJsonLoose(input) {
  if (input === null || input === undefined) return null
  if (typeof input === 'object') return input
  const s = String(input).trim()
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    /* 继续尝试 JSONP 包裹 */
  }
  const candidates = [s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0)
  if (candidates.length === 0) return null
  const start = Math.min(...candidates)
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * 在 marker 之后的一段窗口里执行正则，返回 match 或 null。
 * 容忍空白、属性顺序与标签差异。
 */
function captureAfter(html, marker, pattern, windowSize) {
  const idx = html.indexOf(marker)
  if (idx < 0) return null
  const zone = html.slice(idx, idx + (windowSize || 600))
  return zone.match(pattern)
}

/** 读取 `<input ... id="x" ... value="y">` 的 value（容忍属性顺序）。 */
function hiddenValue(html, id) {
  const re = new RegExp(`<input\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`, 'i')
  const tag = html.match(re)
  if (!tag) return null
  const v = tag[0].match(/\bvalue\s*=\s*["']([^"]*)["']/i)
  return v ? rawText(decodeEntities(v[1])) : null
}

/** 大量页面在页脚隐藏了 F002=上交/深交/北交，用作「上市场所」。 */
function hiddenMarketPlace(html) {
  return hiddenValue(html, 'F002')
}

/** 去掉注释 / script / style，并把 &nbsp; 归一成空格，避免把 JS 模板字符串当成页面内容解析。 */
function stripNoise(html) {
  return String(html || EMPTY)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
}

/* ------------------------------------------------------------------ */
/* F10 最新动态（main.html）                                           */
/* ------------------------------------------------------------------ */

function emptyF10Main() {
  return {
    name: null,
    industryName: null,
    business: null,
    highlight: null,
    area: null,
    marketPlace: null,
    peDynamic: null,
    peStatic: null,
    peTTM: null,
    eps: null,
    epsTTM: null,
    cashPerShare: null,
    totalShares: null,
    floatShares: null,
    pledgeRatio: null,
    holderConcentration: null,
    financeTags: [],
    report: { period: null, eps: null, netProfit: null, netProfitYoY: null },
    concepts: [],
    notices: [],
  }
}

/** 概念行情贴合度（main.html 公司概要里的 newconcept 区块）。 */
function parseF10ConceptRanks(html) {
  const out = []
  const idx = html.indexOf('newconcept')
  if (idx < 0) return out
  const stop = html.indexOf('详情&gt;&gt;', idx)
  const stop2 = html.indexOf('详情>>', idx)
  let end = html.length
  if (stop > idx) end = Math.min(end, stop)
  if (stop2 > idx) end = Math.min(end, stop2)
  const close = html.indexOf('</div>', idx)
  if (close > idx) end = Math.min(end, close)
  const zone = html.slice(idx, end)
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
  let m
  let lastRank = 0
  while ((m = re.exec(zone)) !== null) {
    const attrs = m[1] || EMPTY
    if (/\balltext\b/i.test(attrs)) continue
    const inner = m[2]
    const name = stripHtml(inner.replace(/<em\b[^>]*>[\s\S]*?<\/em\s*>/gi, EMPTY))
    if (!name || name === '详情>>' || name.indexOf('详情') === 0) continue
    const em = inner.match(/ccept_top(\d+)/i)
    let rank = em ? Number(em[1]) : lastRank + 1
    if (!Number.isFinite(rank) || rank <= 0) rank = lastRank + 1
    lastRank = rank
    out.push({ name, rank })
  }
  return out
}

/** 公司公告区块（main.html「公司公告」新闻列表）。 */
function parseF10Notices(html) {
  const out = []
  const idx = html.indexOf('公司公告')
  if (idx < 0) return out
  let end = html.indexOf('</ul>', idx)
  if (end < 0) end = Math.min(html.length, idx + 8000)
  const zone = html.slice(idx, end)
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
  let m
  while ((m = re.exec(zone)) !== null) {
    const attrs = m[1] || EMPTY
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue
    const href = decodeEntities(hrefMatch[1].trim())
    if (!/news\.10jqka\.com\.cn\/field\/sn\//i.test(href)) continue
    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']*)["']/i)
    let title = titleMatch ? rawText(decodeEntities(titleMatch[1])) : null
    if (!title) title = rawText(m[2])
    if (!title) continue
    if (title.indexOf('点击查看') === 0) continue
    out.push({ title, url: href })
  }
  // 去重（同一公告可能重复出现，保序）
  const seen = new Set()
  return out.filter((item) => {
    if (!item.url || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

/**
 * 解析同花顺 F10「最新动态」页（basic.10jqka.com.cn/<code>/index.html）。
 *
 * @param {string} html
 * @returns {{
 *   name: string|null, industryName: string|null, business: string|null,
 *   highlight: string|null, area: string|null, marketPlace: string|null,
 *   peDynamic: number|null, peStatic: number|null, peTTM: number|null,
 *   eps: number|null, epsTTM: number|null, cashPerShare: number|null,
 *   totalShares: number|null, floatShares: number|null,
 *   pledgeRatio: number|null, holderConcentration: number|null,
 *   financeTags: string[],
 *   report: {period: string|null, eps: number|null, netProfit: number|null, netProfitYoY: number|null},
 *   concepts: Array<{name: string, rank: number}>,
 *   notices: Array<{title: string, url: string}>
 * }}
 */
export function parseF10Main(html) {
  const out = emptyF10Main()
  try {
    if (typeof html !== 'string' || !html) return out
    html = stripNoise(html)

    // 名称：页脚隐藏域最稳，其次 <title>贵州茅台(600519)
    out.name = hiddenValue(html, 'stockName')
    if (!out.name) {
      const t = html.match(/<title\b[^>]*>\s*([^<(（]+?)\s*[(（]\d{6}/)
      if (t) out.name = rawText(decodeEntities(t[1]))
    }
    out.marketPlace = hiddenMarketPlace(html)
    if (!out.marketPlace) {
      const m = captureAfter(html, '上市场所：', /<span\b[^>]*>\s*([^<>]{1,40}?)\s*<\/span>/)
      if (m) out.marketPlace = rawText(decodeEntities(m[1]))
    }

    // 所属申万行业（「所属行业」span 是 JS 填充的空壳，不能解析）
    const sw = captureAfter(html, '所属申万行业：', /<span\b[^>]*>\s*([^<>]*?)\s*<\/span>/, 300)
    if (sw) out.industryName = text(sw[1])

    // 主营业务 / 公司亮点
    const business = captureAfter(html, 'main-bussiness-text', />([\s\S]*?)<\/span>/, 600)
    if (business) out.business = text(business[1])
    const highlight = captureAfter(html, 'core-view-text', />([\s\S]*?)<\/span>/, 600)
    if (highlight) out.highlight = text(highlight[1])

    // 所属地域（main.html 为 JS 填充，一般取不到，取到就用）
    const area = captureAfter(html, '所属地域：', /<span\b[^>]*>\s*([^<>]*?)\s*<\/span>/, 300)
    if (area) out.area = text(area[1])

    // 估值
    const peDyn = captureAfter(html, '市盈率(动态)：', /id\s*=\s*["']dtsyl["'][^>]*>\s*([-\d.,]+)/, 400)
    out.peDynamic = peDyn ? num(peDyn[1]) : null
    if (out.peDynamic === null) {
      const m = captureAfter(html, '市盈率(动态)：', /<span\b[^>]*>\s*([-\d.,]+)\s*<\/span>/, 400)
      if (m) out.peDynamic = num(m[1])
    }
    const peStat = captureAfter(html, '市盈率(静态)：', /id\s*=\s*["']jtsyl["'][^>]*>\s*([-\d.,]+)/, 400)
    out.peStatic = peStat ? num(peStat[1]) : null
    if (out.peStatic === null) {
      const m = captureAfter(html, '市盈率(静态)：', /<span\b[^>]*>\s*([-\d.,]+)\s*<\/span>/, 400)
      if (m) out.peStatic = num(m[1])
    }
    // 页面没有独立 TTM 字段时，用动态市盈率兜底（同花顺 F10 默认口径）
    const peTTM = captureAfter(html, '市盈率(TTM)', /<(?:span|td|li|div)\b[^>]*>\s*([-\d.,]+)\s*<\/(?:span|td|li|div)>/, 400)
    out.peTTM = peTTM ? num(peTTM[1]) : out.peDynamic

    // 每股指标
    const eps = captureAfter(html, '每股收益：', /<span\b[^>]*>\s*([-\d.,]+)\s*元/, 300)
    out.eps = eps ? num(eps[1]) : null

    const epsTTM = captureAfter(html, '每股收益(ttm)', /<td\b[^>]*>\s*([-\d.,]+)\s*元/, 300)
    out.epsTTM = epsTTM ? num(epsTTM[1]) : null

    const cfps = captureAfter(html, '每股经营现金流：', /<span\b[^>]*>\s*([-\d.,]+)\s*元/, 300)
    out.cashPerShare = cfps ? num(cfps[1]) : null

    // 股本（页面写作「12.50亿股」，这里换算成股）
    const total = captureAfter(html, '总股本：', /<span\b[^>]*>[\s\S]{0,160}?([-\d.,]+)\s*(万亿|亿|万)?\s*股/, 500)
    if (total) out.totalShares = scaledNum(`${total[1]}${total[2] || EMPTY}`)
    const float = captureAfter(html, '流通A股：', /<span\b[^>]*>\s*([-\d.,]+)\s*(万亿|亿|万)?\s*股/, 300)
    if (float) out.floatShares = scaledNum(`${float[1]}${float[2] || EMPTY}`)

    // 质押 / 股东集中度
    const pledge = captureAfter(html, '质押股份占A股总股本比：', /<span\b[^>]*>\s*([-\d.,]+)\s*%/, 400)
    out.pledgeRatio = pledge ? num(pledge[1]) : null

    const holder = html.match(/前十大流通股东持有[\s\S]{0,80}?占流通盘\s*<strong\b[^>]*>\s*([-\d.,]+)\s*%/i)
    out.holderConcentration = holder ? num(holder[1]) : null

    // 财务标签：权重股 / 一线蓝筹 / 绩优股 ...
    const tags = captureAfter(html, '财务分析：', /<div\b[^>]*>([\s\S]*?)<\/div>/, 2000)
    if (tags) {
      const list = []
      const re = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi
      let m
      while ((m = re.exec(tags[1])) !== null) {
        const v = stripHtml(m[1])
        if (v && v !== '详情>>' && v !== '对比>>' && list.indexOf(v) < 0) list.push(v)
      }
      out.financeTags = list
    }

    // 最新业绩：2026年中报每股收益35.57元，净利润445.17亿元，同比去年增长-1.95%
    const rep = html.match(
      /(\d{4}年(?:一季报|中报|三季报|年报))\s*[，,]?\s*每股收益\s*([-\d.,]+)\s*元\s*[，,]\s*净利润\s*([-\d.,]+)\s*(万亿|亿|万)?元\s*[，,]\s*同比去年增长\s*([-\d.,]+)\s*%/,
    )
    if (rep) {
      out.report = {
        period: rep[1],
        eps: num(rep[2]),
        netProfit: scaledNum(`${rep[3]}${rep[4] || EMPTY}`),
        netProfitYoY: num(rep[5]),
      }
    }

    out.concepts = parseF10ConceptRanks(html)
    out.notices = parseF10Notices(html)

    return out
  } catch {
    return emptyF10Main()
  }
}

/* ------------------------------------------------------------------ */
/* 公司资料（company.html）                                            */
/* ------------------------------------------------------------------ */

function emptyCompany() {
  return {
    swIndustry: null,
    business: null,
    area: null,
    marketPlace: null,
    listedAt: null,
    chairman: null,
    employees: null,
    registeredCapital: null,
    companyProfile: null,
  }
}

/**
 * 解析同花顺 F10「公司资料」页（basic.10jqka.com.cn/<code>/company.html）。
 *
 * @param {string} html
 * @returns {{
 *   swIndustry: string|null, business: string|null, area: string|null,
 *   marketPlace: string|null, listedAt: string|null, chairman: string|null,
 *   employees: number|null, registeredCapital: number|null, companyProfile: string|null
 * }}
 */
export function parseCompany(html) {
  const out = emptyCompany()
  try {
    if (typeof html !== 'string' || !html) return out
    html = stripNoise(html)

    const sw = captureAfter(html, '所属申万行业：', /<span\b[^>]*>([\s\S]*?)<\/span>/, 400)
    if (sw) out.swIndustry = text(sw[1])

    const business = captureAfter(html, '主营业务：', /<\/strong>\s*<span\b[^>]*>([\s\S]*?)<\/span>/, 600)
    if (business) out.business = text(business[1])

    const area = captureAfter(html, '所属地域：', /<span\b[^>]*>([\s\S]*?)<\/span>/, 400)
    if (area) out.area = text(area[1])

    out.marketPlace = hiddenMarketPlace(html)
    if (!out.marketPlace) {
      const m = captureAfter(html, '上市场所：', /<span\b[^>]*>([\s\S]*?)<\/span>/, 400)
      if (m) out.marketPlace = text(m[1])
    }

    const listed = captureAfter(html, '上市日期：', /<span\b[^>]*>\s*([-\d/.]{8,14})\s*<\/span>/, 400)
    if (listed) out.listedAt = isoDate(rawText(listed[1]))

    const chairman = captureAfter(html, '董事长：', /<span\b[^>]*>[\s\S]{0,800}?<a\b[^>]*>([^<>]+?)<\/a\s*>/, 1200)
    if (chairman) out.chairman = rawText(decodeEntities(chairman[1]))

    const employees = captureAfter(html, '员工人数：', /<span\b[^>]*>\s*([-\d,]+)\s*<\/span>/, 400)
    if (employees) out.employees = num(employees[1])

    const capital = captureAfter(html, '注册资金：', /<span\b[^>]*>([\s\S]{0,60}?)<\/span>/, 400)
    if (capital) out.registeredCapital = scaledNum(stripHtml(capital[1]))

    const profile = captureAfter(html, '公司简介：', /<p\b[^>]*>([\s\S]*?)<\/p\s*>/, 4000)
    if (profile) {
      let v = stripHtml(profile[1])
      v = v.replace(/查看全部\s*[▼▽]?$/, '').trim()
      out.companyProfile = v || null
    }

    return out
  } catch {
    return emptyCompany()
  }
}

/* ------------------------------------------------------------------ */
/* 财务诊断（finance.html）                                            */
/* ------------------------------------------------------------------ */

function emptyFinanceDiagnosis() {
  return {
    reportPeriod: null,
    grossMargin: null,
    netMargin: null,
    roe: null,
    debtRatio: null,
    revenueYoY: null,
    profitYoY: null,
    cashRatio: null,
    ranks: [],
    diagnosis: [],
  }
}

/** 从「本期毛利率89.56%,...」这类句子中切出 {item, value}。 */
function splitDiagnosisText(raw) {
  if (!raw) return null
  const s = stripHtml(raw)
  if (!s) return null
  const m = s.match(/^(?:\d+[.、]\s*)?((?:本期|中报|年报|一季报|三季报|上期)\s*)?([\u4e00-\u9fa5A-Za-z（）()\-\/]{2,30}?)\s*(-?\d+(?:\.\d+)?)\s*%?\s*[,，]/)
  if (!m) return null
  return { item: m[2].trim(), value: num(m[3]) }
}

/** 杜邦分析区（新版页面没有财务诊断文本时的兜底）。 */
function parseDupontMetric(html, label) {
  const idx = html.indexOf('dupont_icons')
  if (idx < 0) return null
  const zone = html.slice(idx)
  const re = new RegExp(`<p?[^>]*class=["']name["'][^>]*>${label}</[a-z]+>[\\s\\S]{0,600}?<span\\b[^>]*dupont_analysis_content[^>]*>\\s*(-?[\\d.,]+)\\s*%`, 'i')
  const m = zone.match(re)
  return m ? num(m[1]) : null
}

/**
 * 解析同花顺 F10「财务分析」页（basic.10jqka.com.cn/<code>/finance.html）顶部财务诊断。
 *
 * @param {string} html
 * @returns {{
 *   reportPeriod: string|null, grossMargin: number|null, netMargin: number|null,
 *   roe: number|null, debtRatio: number|null, revenueYoY: number|null,
 *   profitYoY: number|null, cashRatio: number|null,
 *   ranks: Array<{item: string, rank: string, text: string}>,
 *   diagnosis: string[]
 * }}
 */
export function parseFinanceDiagnosis(html) {
  const out = emptyFinanceDiagnosis()
  try {
    if (typeof html !== 'string' || !html) return out
    html = stripNoise(html)

    // 报告期：正文「2026年中报」=> chartData 首个报告期 => 页面首个季度末日期
    const direct = html.match(/(\d{4}年(?:一季报|中报|三季报|年报))/)
    if (direct) out.reportPeriod = direct[1]
    if (!out.reportPeriod) {
      const chart = html.match(/id\s*=\s*["']chartData["'][\s\S]{0,4000}?(\d{4}-\d{2}-\d{2})/)
      if (chart) out.reportPeriod = reportPeriodFromDate(chart[1])
    }
    if (!out.reportPeriod) {
      const qe = html.match(/20\d{2}-(?:03-31|06-30|09-30|12-31)/)
      if (qe) out.reportPeriod = reportPeriodFromDate(qe[0])
    }

    // 财务诊断条目：<li><a ... cid="profit" ...>行业排名 <span>1/20</span></a>1.本期毛利率...</li>
    const ranks = []
    const texts = []
    const byItem = new Map()
    const liRe = /<li\b[^>]*>\s*<a\b[^>]*cid\s*=\s*["']([A-Za-z]+)["'][^>]*>\s*行业排名\s*<span\b[^>]*>\s*([^<>]*?)\s*<\/span>\s*<\/a\s*>([\s\S]*?)<\/li\s*>/gi
    let m
    while ((m = liRe.exec(html)) !== null) {
      const rank = rawText(m[2])
      const body = stripHtml(m[3])
      if (!body) continue
      const parsed = splitDiagnosisText(body)
      const item = parsed ? parsed.item : null
      const entry = { item, rank, text: body }
      ranks.push(entry)
      texts.push(body)
      if (item && parsed && parsed.value !== null && !byItem.has(item)) {
        byItem.set(item, parsed.value)
      }
    }
    out.ranks = ranks
    out.diagnosis = texts

    const pick = (...keys) => {
      for (const key of keys) {
        if (byItem.has(key)) return byItem.get(key)
      }
      return null
    }
    out.grossMargin = pick('毛利率', '销售毛利率')
    out.netMargin = pick('净利率', '销售净利率')
    out.roe = pick('净资产收益率', '加权净资产收益率')
    out.debtRatio = pick('资产负债率')
    out.revenueYoY = pick('营业收入增长率', '营业总收入增长率')
    out.profitYoY = pick('净利润增长率')
    // 同花顺「销售现金比率」是财务诊断 cash 组里经常出现的现金指标；
    // 若页面只有「现金比率」则用它兜底。
    out.cashRatio = pick('销售现金比率', '现金比率')

    // 新版财务页（如平安银行样本）没有诊断文本块，用杜邦分析补 ROE / 资产负债率
    if (out.roe === null) out.roe = parseDupontMetric(html, '净资产收益率')
    if (out.debtRatio === null) out.debtRatio = parseDupontMetric(html, '资产负债率')

    return out
  } catch {
    return emptyFinanceDiagnosis()
  }
}

/* ------------------------------------------------------------------ */
/* 概念题材（concept.html）                                            */
/* ------------------------------------------------------------------ */

const CONCEPT_SECTIONS = ['常规概念', '新兴概念', '其他概念', '题材要点']

/** 题材要点区块（新版页面由 JS 填充，取不到就返回空数组）。 */
function parseMaterialPoints(zone) {
  const out = []
  const blocks = zone.split(/<div\b[^>]*class\s*=\s*["'][^"']*ifindCon[^"']*["']/i)
  for (let i = 1; i < blocks.length; i += 1) {
    const block = blocks[i]
    const nameM = block.match(/<span\b[^>]*class\s*=\s*["'][^"']*gnmc[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)
    const name = nameM ? text(nameM[1]) : null
    if (!name) continue
    let desc = null
    const full = block.match(/<div\b[^>]*class\s*=\s*["'][^"']*comPoint[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    if (full) desc = text(full[1].replace(/<span\b[^>]*class\s*=\s*["'][^"']*spreadCommon[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, EMPTY))
    if (!desc) {
      const short = block.match(/<div\b[^>]*class\s*=\s*["'][^"']*mPoint[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
      if (short) desc = text(short[1].replace(/<span\b[^>]*class\s*=\s*["'][^"']*retractCommon[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, EMPTY))
    }
    out.push({ name, desc, category: '题材要点' })
  }
  return out
}

/**
 * 解析同花顺 F10「概念题材」页（basic.10jqka.com.cn/<code>/concept.html）。
 * category: 常规概念 / 新兴概念 / 其他概念 / 题材要点
 *
 * @param {string} html
 * @returns {Array<{name: string, desc: string|null, category: string}>}
 */
export function parseConcepts(html) {
  try {
    if (typeof html !== 'string' || !html) return []
    html = stripNoise(html)
    const marks = []
    const headRe = new RegExp(`<h2\\b[^>]*>\\s*(${CONCEPT_SECTIONS.join('|')})\\s*<\\/h2\\s*>`, 'gi')
    let hm
    while ((hm = headRe.exec(html)) !== null) {
      marks.push({ category: hm[1], start: hm.index, contentStart: hm.index + hm[0].length })
    }
    if (marks.length === 0) return []

    const out = []
    for (let i = 0; i < marks.length; i += 1) {
      const mark = marks[i]
      const end = i + 1 < marks.length ? marks[i + 1].start : html.length
      const zone = html.slice(mark.contentStart, end)
      if (mark.category === '题材要点') {
        const points = parseMaterialPoints(zone)
        for (const p of points) out.push(p)
        continue
      }

      const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi
      let rm
      let current = null
      while ((rm = rowRe.exec(zone)) !== null) {
        const attrs = rm[1] || EMPTY
        const body = rm[2]
        if (/extend_content/i.test(attrs)) {
          if (current) {
            const full = body.match(/<div\b[^>]*class\s*=\s*["'][^"']*(?:scrollbar-macosx|scrollbar)[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i)
            const desc = full ? text(full[1]) : null
            if (desc) current.desc = desc
          }
          current = null
          continue
        }
        const nameRaw = body.match(/<td\b[^>]*class\s*=\s*["'](?:gnName|gnStockList)[^"']*["'][^>]*>([\s\S]*?)<\/td\s*>/i)
        if (!nameRaw) continue
        const name = text(nameRaw[1])
        if (!name) continue
        const shortRaw = body.match(/<div\b[^>]*class\s*=\s*["'][^"']*tdContent[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i)
        const desc = shortRaw ? text(shortRaw[1]) : null
        current = { name, desc, category: mark.category }
        out.push(current)
      }
    }

    // 同章节内同名概念去重，保持页面顺序
    const seen = new Set()
    return out.filter((item) => {
      const key = `${item.category}::${item.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/* 行业板块（q.10jqka.com.cn）                                         */
/* ------------------------------------------------------------------ */

/** 取第一个 class 含 m-pager-table 的表格（同花顺排行页通用结构）。 */
function firstPagerTable(html) {
  const m = html.match(/<table\b[^>]*class\s*=\s*["'][^"']*m-pager-table[^"']*["'][^>]*>([\s\S]*?)<\/table\s*>/i)
  return m ? m[1] : null
}

/** 把表格 body 拆成数据行（排除表头 / th 行）。 */
function dataRows(tableHtml) {
  const rows = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi
  let m
  while ((m = rowRe.exec(tableHtml)) !== null) {
    const body = m[1]
    if (/<th\b/i.test(body)) continue
    const cells = []
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi
    let cm
    while ((cm = cellRe.exec(body)) !== null) {
      cells.push({ html: cm[1], text: stripHtml(cm[1]) })
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

function firstHref(fragment) {
  const m = String(fragment || EMPTY).match(/href\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

function hrefCode(fragment, pattern) {
  const href = firstHref(fragment)
  if (!href) return null
  const m = href.match(pattern || /(\d{6})/)
  return m ? m[1] : null
}

/**
 * 解析同花顺行业板块排行页（q.10jqka.com.cn/thshy/）。
 * 单位：amount / netIn 为亿元（页面即亿元，不再换算）。
 *
 * @param {string} html
 * @returns {Array<{code: string|null, name: string|null, changePct: number|null,
 *   amount: number|null, netIn: number|null, upCount: number|null,
 *   downCount: number|null, leader: string|null}>}
 */
export function parseIndustryList(html) {
  try {
    if (typeof html !== 'string' || !html) return []
    html = stripNoise(html)
    const table = firstPagerTable(html)
    if (!table) return []
    const rows = dataRows(table)
    const out = []
    for (const cells of rows) {
      if (cells.length < 8) continue
      const name = cells[1].text || null
      if (!name) continue
      const code = hrefCode(cells[1].html, /\/code\/(\d{5,6})\/?/)
      // 列序：序号|板块|涨跌幅|总成交量|总成交额|净流入|上涨家数|下跌家数|均价|领涨股|最新价|涨跌幅
      out.push({
        code,
        name,
        changePct: num(cells[2] ? cells[2].text : null),
        amount: num(cells[4] ? cells[4].text : null),
        netIn: num(cells[5] ? cells[5].text : null),
        upCount: num(cells[6] ? cells[6].text : null),
        downCount: num(cells[7] ? cells[7].text : null),
        leader: cells[9] ? cells[9].text || null : null,
        leaderCode: cells[9] ? hrefCode(cells[9].html, /stockpage\.10jqka\.com\.cn\/(\d{6})/) : null,
      })
    }
    return out
  } catch {
    return []
  }
}

function emptyIndustryDetail() {
  return { name: null, components: [], total: 0 }
}

/**
 * 解析同花顺行业详情页（q.10jqka.com.cn/thshy/detail/code/881273/）。
 * 注意：页面只渲染当前分页（约 20 行）的成分股，未给出总家数时
 * total 退化为已解析的成分股数量。
 *
 * @param {string} html
 * @returns {{name: string|null, components: Array<{rank: number|null, code: string|null,
 *   name: string|null, price: number|null, changePct: number|null}>, total: number}}
 */
export function parseIndustryDetail(html) {
  const out = emptyIndustryDetail()
  try {
    if (typeof html !== 'string' || !html) return out
    html = stripNoise(html)

    const head = html.match(/<h2\b[^>]*>\s*([^<>]*?行业成分股涨跌排行榜)\s*<\/h2\s*>/i)
    if (head) {
      const name = stripHtml(head[1]).replace(/行业成分股涨跌排行榜$/, '').trim()
      out.name = name || null
    }

    const table = firstPagerTable(html)
    if (!table) return out
    const rows = dataRows(table)
    const components = []
    for (const cells of rows) {
      if (cells.length < 5) continue
      const code = hrefCode(cells[1] ? cells[1].html : EMPTY, /stockpage\.10jqka\.com\.cn\/(\d{6})/) || (cells[1] ? cells[1].text : null)
      const name = cells[2] ? cells[2].text || null : null
      if (!code && !name) continue
      components.push({
        rank: num(cells[0] ? cells[0].text : null),
        code: code || null,
        name,
        price: num(cells[3] ? cells[3].text : null),
        changePct: num(cells[4] ? cells[4].text : null),
      })
    }
    out.components = components
    // 若页面单独给出总家数就用它，否则退化为当前分页数量
    const totalM = html.match(/(?:共|总计)\s*(\d+)\s*家/)
    out.total = totalM ? num(totalM[1]) : components.length
    out.total = out.total === null ? components.length : out.total
    return out
  } catch {
    return emptyIndustryDetail()
  }
}

/* ------------------------------------------------------------------ */
/* 热榜（dq.10jqka.com.cn）                                            */
/* ------------------------------------------------------------------ */

/**
 * 解析同花顺热榜 JSON 文本。
 *
 * @param {string} text JSON 或 JSONP 文本
 * @returns {{stocks: Array<{code: string|null, name: string|null, rank: number,
 *   rate: number|null, changePct: number|null, reason: string|null}>, asOf: string|null}}
 */
export function parseHotList(textInput) {
  const out = { stocks: [], asOf: null }
  try {
    const parsed = parseJsonLoose(textInput)
    if (!parsed || typeof parsed !== 'object') return out
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed
    const list = Array.isArray(data.stock_list) ? data.stock_list : Array.isArray(data.list) ? data.list : Array.isArray(parsed) ? parsed : []
    const stocks = []
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]
      if (!item || typeof item !== 'object') continue
      const code = item.code !== undefined && item.code !== null ? String(item.code).trim() : null
      if (!code) continue
      const reason = item.analyse !== undefined && item.analyse !== null ? rawText(item.analyse) : item.analyse_title ? rawText(item.analyse_title) : null
      stocks.push({
        code,
        name: item.name !== undefined && item.name !== null ? rawText(item.name) : null,
        rank: i + 1,
        rate: num(item.rate),
        changePct: num(item.rise_and_fall !== undefined ? item.rise_and_fall : item.changePct),
        reason,
      })
    }
    out.stocks = stocks
    const asOf = data.asOf || data.as_of || data.date || data.time || data.updatedAt || parsed.asOf
    if (asOf !== undefined && asOf !== null && asOf !== '') {
      const asText = rawText(asOf)
      out.asOf = asText && /^\d{9,13}$/.test(asText) ? tsToText(Number(asText)) : asText
    }
    return out
  } catch {
    return { stocks: [], asOf: null }
  }
}

/* ------------------------------------------------------------------ */
/* realhead 行情                                                        */
/* ------------------------------------------------------------------ */

/**
 * 解析同花顺 realhead 行情文本（d.10jqka.com.cn/v6/realhead/hs_<code>/last.js）。
 * items 保持页面原始键值（值多为字符串），由调用方自行取字段。
 *
 * @param {string} text
 * @returns {{items: Object<string, any>, name: string|null, updateTime: string|null}}
 */
export function parseThsRealhead(textInput) {
  const out = { items: {}, name: null, updateTime: null }
  try {
    const parsed = parseJsonLoose(textInput)
    if (!parsed || typeof parsed !== 'object') return out
    const items = parsed.items && typeof parsed.items === 'object' ? parsed.items : null
    if (!items) return out
    out.items = items
    // 同花顺接口把 name / updateTime 也塞在 items 里，个别版本提到顶层，两处都认
    const pickText = (key) => {
      if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') return rawText(parsed[key])
      if (items[key] !== undefined && items[key] !== null && items[key] !== '') return rawText(items[key])
      return null
    }
    out.name = pickText('name')
    out.updateTime = pickText('updateTime')
    return out
  } catch {
    return { items: {}, name: null, updateTime: null }
  }
}

/* ------------------------------------------------------------------ */
/* K 线（d.10jqka.com.cn/v6/line/.../last.js）                          */
/* ------------------------------------------------------------------ */

function emptyLine() {
  return { name: null, start: null, total: null, rows: [] }
}

/**
 * 解析同花顺 K 线文本。
 * data 字段为 `日期,开,高,低,收,成交量,成交额,换手率,,,` 以 `;` 分隔的行；
 * 日期统一成 "YYYY-MM-DD"（start 同理）。
 *
 * @param {string} text
 * @returns {{name: string|null, start: string|null, total: number|null,
 *   rows: Array<{date: string|null, open: number|null, high: number|null,
 *   low: number|null, close: number|null, volume: number|null,
 *   amount: number|null, turnoverRate: number|null}>}}
 */
export function parseThsLine(textInput) {
  const out = emptyLine()
  try {
    const parsed = parseJsonLoose(textInput)
    if (!parsed || typeof parsed !== 'object') return out
    out.name = parsed.name !== undefined && parsed.name !== null ? rawText(parsed.name) : null
    out.start = isoDate(parsed.start)
    out.total = num(parsed.total)

    const rows = []
    const data = typeof parsed.data === 'string' ? parsed.data : EMPTY
    const chunks = data.split(';')
    for (const chunk of chunks) {
      const line = chunk.trim()
      if (!line) continue
      const parts = line.split(',')
      if (parts.length < 8) continue
      const date = isoDate(parts[0])
      if (!date) continue
      rows.push({
        date,
        open: num(parts[1]),
        high: num(parts[2]),
        low: num(parts[3]),
        close: num(parts[4]),
        volume: num(parts[5]),
        amount: num(parts[6]),
        turnoverRate: num(parts[7]),
      })
    }
    out.rows = rows
    return out
  } catch {
    return emptyLine()
  }
}

/* ------------------------------------------------------------------ */
/* 资讯 / 公告列表（news.json）                                        */
/* ------------------------------------------------------------------ */

/**
 * 解析同花顺资讯列表 JSON 文本。
 *
 * @param {string} text JSON / JSONP 文本
 * @returns {Array<{title: string|null, url: string|null, time: string|null, source: string|null}>}
 */
export function parseNews(textInput) {
  try {
    const parsed = parseJsonLoose(textInput)
    if (!parsed || typeof parsed !== 'object') return []
    const list = Array.isArray(parsed.data && parsed.data.list)
      ? parsed.data.list
      : Array.isArray(parsed.list)
        ? parsed.list
        : Array.isArray(parsed)
          ? parsed
          : []
    const out = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const title = item.title !== undefined && item.title !== null ? rawText(item.title) : null
      if (!title) continue
      const url = item.url !== undefined && item.url !== null ? rawText(item.url) : null
      const stamp = item.rtime || item.ctime || item.time || item.pubTime || null
      const time = /^\d{9,13}$/.test(String(stamp || EMPTY)) ? tsToText(stamp) : rawText(stamp)
      const source = item.source !== undefined && item.source !== null ? rawText(item.source) : null
      out.push({
        title,
        url: url || null,
        time: time || null,
        source: source || null,
      })
    }
    return out
  } catch {
    return []
  }
}
