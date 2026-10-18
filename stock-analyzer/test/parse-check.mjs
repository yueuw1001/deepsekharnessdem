/**
 * dsh-stock-analyzer / test/parse-check.mjs
 *
 * 用 _probe/ 下的真实同花顺页面样本验证 stock-analyzer/ths-pages.js。
 * 运行（工作目录 = 项目根）：
 *   & "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" stock-analyzer/test/parse-check.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  stripHtml,
} from '../ths-pages.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROBE = path.resolve(HERE, '../../_probe')

let passed = 0
let failed = 0
const failures = []

function read(name) {
  const file = path.join(PROBE, name)
  if (!fs.existsSync(file)) throw new Error(`缺少样本文件: ${file}`)
  return fs.readFileSync(file, 'utf8')
}

function check(label, fn) {
  try {
    const value = fn()
    if (value === true) {
      passed += 1
      return true
    }
    failed += 1
    failures.push(`${label} -> 断言返回 ${JSON.stringify(value)}`)
    return false
  } catch (error) {
    failed += 1
    failures.push(`${label} -> ${error && error.message ? error.message : error}`)
    return false
  }
}

function eq(label, actual, expected) {
  return check(label, () => (actual === expected ? true : `实际 ${JSON.stringify(actual)} !== 期望 ${JSON.stringify(expected)}`))
}

function truthy(label, actual) {
  return check(label, () => Boolean(actual) || `实际 ${JSON.stringify(actual)} 为假值`)
}

function near(label, actual, expected, eps = 0.005) {
  return check(
    label,
    () => (typeof actual === 'number' && Math.abs(actual - expected) <= eps ? true : `实际 ${JSON.stringify(actual)} 与期望 ${expected} 相差超过 ${eps}`),
  )
}

function includes(label, list, needle) {
  return check(label, () => {
    if (!Array.isArray(list)) return `不是数组: ${JSON.stringify(list)}`
    const hit = list.some((item) => (typeof item === 'string' ? item.includes(needle) : item && item.name && String(item.name).includes(needle)))
    return hit || `未在 ${list.length} 项里找到 ${needle}`
  })
}

const fmt = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : JSON.stringify(v))

/* ------------------------------------------------------------------ */
/* 读取样本                                                            */
/* ------------------------------------------------------------------ */

const files = {
  main519: read('main.html'),
  main001: read('main-000001.html'),
  finance519: read('finance.html'),
  finance001: read('finance-000001.html'),
  concept519: read('concept.html'),
  concept001: read('concept-000001.html'),
  company519: read('company.html'),
  company001: read('company-000001.html'),
  field519: read('field.html'),
  industryList: read('industry-list.html'),
  industryDetail: read('industry-881273.html'),
  industryDetail2: read('industry.html'),
  hotList: read('hot-list.json'),
  news: read('news.json'),
  realhead: read('realhead-600519.js'),
  line: read('line-600519.js'),
}

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

const f10 = parseF10Main(files.main519)
const f10B = parseF10Main(files.main001)
const company = parseCompany(files.company519)
const companyB = parseCompany(files.company001)
const finance = parseFinanceDiagnosis(files.finance519)
const financeB = parseFinanceDiagnosis(files.finance001)
const concepts = parseConcepts(files.concept519)
const conceptsB = parseConcepts(files.concept001)
const industryList = parseIndustryList(files.industryList)
const industryDetail = parseIndustryDetail(files.industryDetail)
const industryDetail2 = parseIndustryDetail(files.industryDetail2)
const hot = parseHotList(files.hotList)
const realhead = parseThsRealhead(files.realhead)
const line = parseThsLine(files.line)
const news = parseNews(files.news)

/* ------------------------------------------------------------------ */
/* 600519 断言                                                         */
/* ------------------------------------------------------------------ */

eq('600519 F10 name', f10.name, '贵州茅台')
includes('600519 F10 industryName 含 白酒', [f10.industryName || ''], '白酒')
eq('600519 F10 marketPlace', f10.marketPlace, '上海证券交易所')
near('600519 F10 peTTM≈18.66', f10.peTTM, 18.66)
near('600519 F10 peDynamic≈18.66', f10.peDynamic, 18.66)
near('600519 F10 peStatic≈20.18', f10.peStatic, 20.18)
near('600519 F10 eps≈35.57', f10.eps, 35.57)
near('600519 F10 epsTTM≈65.14', f10.epsTTM, 65.14)
near('600519 F10 cashPerShare≈56.55', f10.cashPerShare, 56.55)
eq('600519 F10 totalShares=1250000000', f10.totalShares, 1250000000)
eq('600519 F10 floatShares=1250000000', f10.floatShares, 1250000000)
near('600519 F10 pledgeRatio≈0.06', f10.pledgeRatio, 0.06, 0.0001)
near('600519 F10 holderConcentration≈67.63', f10.holderConcentration, 67.63)
includes('600519 F10 financeTags 含 权重股', f10.financeTags, '权重股')
includes('600519 F10 financeTags 含 绩优股', f10.financeTags, '绩优股')
eq('600519 F10 report.period', f10.report.period, '2026年中报')
near('600519 F10 report.eps≈35.57', f10.report.eps, 35.57)
eq('600519 F10 report.netProfit=44517000000', f10.report.netProfit, 44517000000)
near('600519 F10 report.netProfitYoY≈-1.95', f10.report.netProfitYoY, -1.95)
includes('600519 F10 概念贴合度含 白酒概念', f10.concepts, '白酒概念')
eq('600519 F10 概念第一名 rank=1', f10.concepts.length > 0 ? f10.concepts[0].rank : null, 1)
truthy('600519 F10 概念贴合度 >= 5 项', f10.concepts.length >= 5)
truthy('600519 F10 notices >= 5 条', f10.notices.length >= 5)
check('600519 F10 notices[0] 指向 news.10jqka.com.cn/field/sn/', () => {
  const first = f10.notices[0]
  if (!first) return '没有公告'
  return /news\.10jqka\.com\.cn\/field\/sn\//.test(first.url) || `url 不符: ${first.url}`
})

eq('600519 company swIndustry', company.swIndustry, '食品饮料 — 白酒Ⅱ')
eq('600519 company area', company.area, '贵州省')
eq('600519 company marketPlace', company.marketPlace, '上海证券交易所')
eq('600519 company listedAt', company.listedAt, '2001-08-27')
eq('600519 company chairman', company.chairman, '陈华')
eq('600519 company employees', company.employees, 34992)
eq('600519 company registeredCapital=1250000000', company.registeredCapital, 1250000000)
truthy('600519 company business', company.business && company.business.includes('茅台酒'))
truthy('600519 company companyProfile', company.companyProfile && company.companyProfile.includes('贵州茅台酒股份有限公司'))

eq('600519 finance reportPeriod', finance.reportPeriod, '2026年中报')
near('600519 finance grossMargin≈89.56', finance.grossMargin, 89.56)
near('600519 finance netMargin≈50.75', finance.netMargin, 50.75)
near('600519 finance roe≈16.75', finance.roe, 16.75)
near('600519 finance debtRatio≈15.19', finance.debtRatio, 15.19)
near('600519 finance revenueYoY≈1.47', finance.revenueYoY, 1.47)
near('600519 finance profitYoY≈-1.95', finance.profitYoY, -1.95)
near('600519 finance cashRatio≈77.94', finance.cashRatio, 77.94)
truthy('600519 finance ranks >= 15 条', finance.ranks.length >= 15)
truthy('600519 finance diagnosis >= 15 条', finance.diagnosis.length >= 15)
check('600519 finance ranks[0] 形如 {item,rank,text}', () => {
  const first = finance.ranks[0]
  if (!first) return '没有 ranks'
  return (first.item === '毛利率' && first.rank === '1/20' && first.text.includes('89.56')) || `实际 ${JSON.stringify(first)}`
})

truthy('600519 concepts >= 5 项', concepts.length >= 5)
includes('600519 concepts 含 白酒概念', concepts, '白酒概念')
check('600519 concepts 白酒概念 有完整解析', () => {
  const item = concepts.find((c) => c.name === '白酒概念')
  if (!item) return '没有白酒概念'
  return (item.category === '常规概念' && item.desc && item.desc.includes('高端白酒龙头')) || `实际 ${JSON.stringify(item)}`
})
includes('600519 concepts 含 其他概念类目', concepts.map((c) => c.category), '其他概念')

truthy('industry list >= 40 行', industryList.length >= 40)
check('industry list 含 白酒(881273)', () => {
  const item = industryList.find((r) => r.code === '881273')
  if (!item) return `没有 881273，样例: ${JSON.stringify(industryList.slice(0, 2))}`
  return item.name === '白酒' || `名称实际 ${item.name}`
})
check('industry list 白酒行数值', () => {
  const item = industryList.find((r) => r.code === '881273')
  if (!item) return '没有 881273'
  const ok = item.changePct === 1.95 && item.amount === 132.13 && item.netIn === 9.67 && item.upCount === 19 && item.downCount === 0 && item.leader === '皇台酒业'
  return ok || `实际 ${JSON.stringify(item)}`
})

eq('industry detail name', industryDetail.name, '白酒')
truthy('industry detail components >= 10', industryDetail.components.length >= 10)
eq('industry detail total = components.length', industryDetail.total, industryDetail.components.length)
check('industry detail 含 600519', () => {
  const item = industryDetail.components.find((c) => c.code === '600519')
  if (!item) return `没有 600519，样例: ${JSON.stringify(industryDetail.components.slice(0, 2))}`
  const ok = item.name === '贵州茅台' && item.price === 1329 && item.changePct === 1.22 && item.rank === 12
  return ok || `实际 ${JSON.stringify(item)}`
})
eq('industry detail 通用性（煤炭开采加工）', industryDetail2.name, '煤炭开采加工')

eq('hot list stocks 长度', hot.stocks.length, 100)
check('hot list 含 600519', () => {
  const item = hot.stocks.find((s) => s.code === '600519')
  if (!item) return '没有 600519'
  const ok = item.name === '贵州茅台' && item.rank === 52 && item.rate === 24608 && item.changePct === 1.2209
  return ok || `实际 ${JSON.stringify(item)}`
})
check('hot list rank 从 1 连续递增', () => {
  if (hot.stocks.length === 0) return '空'
  if (hot.stocks[0].rank !== 1) return `首项 rank=${hot.stocks[0].rank}`
  const last = hot.stocks[hot.stocks.length - 1]
  return last.rank === hot.stocks.length || `末项 rank=${last.rank}`
})
check('hot list reason 是 analyse 文本', () => {
  const item = hot.stocks.find((s) => s.code === '000530')
  if (!item) return '没有 000530'
  return (typeof item.reason === 'string' && item.reason.includes('行业原因')) || `实际 ${JSON.stringify(item.reason)}`
})

eq('realhead name', realhead.name, '贵州茅台')
eq('realhead updateTime', realhead.updateTime, '2026-10-16 15:30')
eq('realhead items["10"]=1329', Number(realhead.items['10']), 1329)
eq('realhead items["5"]=600519', String(realhead.items['5']), '600519')
eq('realhead items["199112"]=1.22', Number(realhead.items['199112']), 1.22)

eq('line name', line.name, '贵州茅台')
eq('line start', line.start, '2001-08-27')
eq('line total=6022', line.total, 6022)
truthy('line rows >= 100', line.rows.length >= 100)
check('line 最后一根 close=1329 且日期正确', () => {
  const last = line.rows[line.rows.length - 1]
  if (!last) return '没有 rows'
  const ok = last.close === 1329 && last.date === '2026-10-16' && last.open === 1311.57 && last.high === 1329.88 && last.low === 1301.68 && last.volume === 3850175 && last.amount === 5075528300 && last.turnoverRate === 0.308
  return ok || `实际 ${JSON.stringify(last)}`
})

truthy('news >= 10 条', news.length >= 10)
check('news[0] 字段齐全', () => {
  const first = news[0]
  if (!first) return '没有 news'
  const ok = Boolean(first.title) && /^https?:\/\//.test(first.url || '') && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(first.time || '')
  return ok || `实际 ${JSON.stringify(first)}`
})

/* ------------------------------------------------------------------ */
/* 000001 断言（验证通用性）                                           */
/* ------------------------------------------------------------------ */

eq('000001 F10 name', f10B.name, '平安银行')
includes('000001 F10 industryName 非空且含 银行', [f10B.industryName || ''], '银行')
near('000001 F10 peDynamic≈4.343', f10B.peDynamic, 4.343, 0.001)
near('000001 F10 eps≈1.24', f10B.eps, 1.24)
eq('000001 F10 totalShares=19406000000', f10B.totalShares, 19406000000)
near('000001 F10 holderConcentration≈64.3', f10B.holderConcentration, 64.3)
eq('000001 F10 report.period', f10B.report.period, '2026年中报')
eq('000001 F10 report.netProfit=25696000000', f10B.report.netProfit, 25696000000)
includes('000001 F10 financeTags 含 破净股', f10B.financeTags, '破净股')
eq('000001 F10 epsTTM 缺失为 null', f10B.epsTTM, null)

eq('000001 company swIndustry', companyB.swIndustry, '银行 — 股份制银行Ⅱ')
eq('000001 company area', companyB.area, '广东省')
eq('000001 company listedAt', companyB.listedAt, '1991-04-03')
eq('000001 company chairman', companyB.chairman, '谢永林')
eq('000001 company employees', companyB.employees, 41043)
eq('000001 company registeredCapital=19406000000', companyB.registeredCapital, 19406000000)

// finance-000001.html 是新版财务页（没有「财务诊断」文本块，块由 JS 渲染）：
// 因此毛利率等只有页面有诊断文本时才取得到，这里验证「不抛错 + 报告期 + 杜邦兜底」。
eq('000001 finance reportPeriod', financeB.reportPeriod, '2026年中报')
near('000001 finance roe（杜邦兜底）≈4.73', financeB.roe, 4.73)
near('000001 finance debtRatio（杜邦兜底）≈90.91', financeB.debtRatio, 90.91)
check('000001 finance grossMargin 无样本数据时为 null', () => financeB.grossMargin === null || `实际 ${JSON.stringify(financeB.grossMargin)}`)
eq('000001 finance ranks 为空数组', financeB.ranks.length, 0)
eq('000001 finance diagnosis 为空数组', financeB.diagnosis.length, 0)

truthy('000001 concepts >= 2 项', conceptsB.length >= 2)
includes('000001 concepts 含 高股息精选', conceptsB, '高股息精选')
includes('000001 concepts 含 跨境支付', conceptsB, '跨境支付')

check('解析结果不混入 JS 模板文本', () => {
  const bad = (item) => !item.name || /item\.|\+|<|>|blankSpace|content/.test(item.name)
  const dirty = [...concepts, ...conceptsB].filter(bad)
  return dirty.length === 0 || `疑似脏数据: ${JSON.stringify(dirty.slice(0, 2))}`
})

/* ------------------------------------------------------------------ */
/* 容错：属性顺序 / 空白 / HTML 实体                                    */
/* ------------------------------------------------------------------ */

const mutatedMain = files.main519
  .replace(/<span class="tip f12" id="dtsyl">/g, '<span   id = "dtsyl"  class="tip f12" >')
  .replace(/<span class="tip f12" id="jtsyl">/g, '<span\n\tclass="tip f12"   id="jtsyl">')
  .replace(/<\/span>(\d+(?:\.\d+)?)亿股/g, '</span>$1&nbsp;亿股')

const mutated = parseF10Main(mutatedMain)
eq('容错：属性顺序变化后仍取到 peDynamic', mutated.peDynamic, f10.peDynamic)
eq('容错：属性顺序变化后仍取到 peStatic', mutated.peStatic, f10.peStatic)
eq('容错：&nbsp; 不影响总股本解析', mutated.totalShares, f10.totalShares)
eq('容错：&nbsp; 不影响流通股解析', mutated.floatShares, f10.floatShares)

const syntheticMain = [
  '<title>测试股份(600000)</title>',
  '<span class="hltip f12 f1">所属申万行业：</span>',
  '<span class="tip f14">银行Ⅱ</span>',
  '<span class="hltip f12">总股本：</span>',
  '<span class="tip f12" ><input type="hidden" value="20.00" id="stockzgb" />20.00&nbsp;亿股</span>',
  '<span class="hltip f12 fl core-view-text" title="亮点">',
  '  亮点文本&nbsp;含实体&amp;符号  ',
  '</span>',
].join('\n')
const synthetic = parseF10Main(syntheticMain)
eq('容错：最小页面 name', synthetic.name, '测试股份')
eq('容错：最小页面 industryName', synthetic.industryName, '银行Ⅱ')
eq('容错：最小页面 totalShares', synthetic.totalShares, 2000000000)
eq('容错：实体/空白 highlight', synthetic.highlight, '亮点文本 含实体&符号')

/* ------------------------------------------------------------------ */
/* 健壮性：异常输入不抛错                                              */
/* ------------------------------------------------------------------ */

check('空输入返回空结构', () => {
  const cases = [
    parseF10Main(''),
    parseCompany(null),
    parseFinanceDiagnosis(undefined),
    parseIndustryDetail(''),
    parseThsRealhead('not-json'),
    parseThsLine('quotebridge_x(null)'),
    parseNews(''),
    parseHotList(12345),
  ]
  if (parseConcepts('') .length !== 0) return 'parseConcepts 非空'
  if (parseIndustryList('') .length !== 0) return 'parseIndustryList 非空'
  if (cases.some((c) => c === undefined || c === null)) return '返回了 undefined/null'
  return true
})

check('破坏性 HTML 不抛错', () => {
  const broken = ['<<<>>>', '<html><body><table class="m-pager-table"><tr><td>1', '{"data": {"stock_list": [', 'quotebridge({']
  for (const s of broken) {
    parseF10Main(s)
    parseFinanceDiagnosis(s)
    parseConcepts(s)
    parseIndustryList(s)
    parseIndustryDetail(s)
    parseHotList(s)
    parseThsLine(s)
    parseNews(s)
    parseThsRealhead(s)
    parseCompany(s)
  }
  return true
})

eq('stripHtml 去标签', stripHtml('<p>白酒&nbsp;<b>龙头</b></p>'), '白酒 龙头')
eq('stripHtml 空输入', stripHtml(null), '')

/* ------------------------------------------------------------------ */
/* 简表输出                                                            */
/* ------------------------------------------------------------------ */

const table = [
  ['600519 F10', 'name / industryName', `${fmt(f10.name)} / ${fmt(f10.industryName)}`],
  ['600519 F10', 'PE 动态/静态/TTM', `${fmt(f10.peDynamic)} / ${fmt(f10.peStatic)} / ${fmt(f10.peTTM)}`],
  ['600519 F10', 'eps / epsTTM / 每股现金流', `${fmt(f10.eps)} / ${fmt(f10.epsTTM)} / ${fmt(f10.cashPerShare)}`],
  ['600519 F10', '总股本 / 流通股(股)', `${fmt(f10.totalShares)} / ${fmt(f10.floatShares)}`],
  ['600519 F10', '质押% / 前十大流通股东%', `${fmt(f10.pledgeRatio)} / ${fmt(f10.holderConcentration)}`],
  ['600519 F10', '财务标签', f10.financeTags.join('、')],
  ['600519 F10', '最新业绩', `${fmt(f10.report.period)} eps=${fmt(f10.report.eps)} 净利=${fmt(f10.report.netProfit)} 同比=${fmt(f10.report.netProfitYoY)}`],
  ['600519 F10', '概念贴合度', f10.concepts.map((c) => `${c.name}#${c.rank}`).join('、')],
  ['600519 F10', '公司公告', `${f10.notices.length} 条，首条：${f10.notices[0] ? f10.notices[0].title : '-'}`],
  ['600519 公司资料', 'swIndustry / 地区 / 上市', `${fmt(company.swIndustry)} / ${fmt(company.area)} / ${fmt(company.listedAt)}`],
  ['600519 公司资料', '董事长 / 员工 / 注册资金(元)', `${fmt(company.chairman)} / ${fmt(company.employees)} / ${fmt(company.registeredCapital)}`],
  ['600519 财务诊断', '毛利率 / 净利率 / ROE / 负债率', `${fmt(finance.grossMargin)} / ${fmt(finance.netMargin)} / ${fmt(finance.roe)} / ${fmt(finance.debtRatio)}`],
  ['600519 财务诊断', '营收增速 / 净利增速 / 现金比率', `${fmt(finance.revenueYoY)} / ${fmt(finance.profitYoY)} / ${fmt(finance.cashRatio)}`],
  ['600519 财务诊断', '报告期 / ranks / diagnosis', `${fmt(finance.reportPeriod)} / ${finance.ranks.length} / ${finance.diagnosis.length}`],
  ['600519 概念题材', '条数 / 类目', `${concepts.length} / ${[...new Set(concepts.map((c) => c.category))].join('、')}`],
  ['行业列表', '行数 / 白酒行', `${industryList.length} / ${JSON.stringify(industryList.find((r) => r.code === '881273') || null)}`],
  ['行业详情', 'name / components / total', `${fmt(industryDetail.name)} / ${industryDetail.components.length} / ${fmt(industryDetail.total)}`],
  ['行业详情', '600519 成分', JSON.stringify(industryDetail.components.find((c) => c.code === '600519') || null)],
  ['热榜', '条数 / 600519', `${hot.stocks.length} / ${JSON.stringify(hot.stocks.find((s) => s.code === '600519') || null)}`],
  ['realhead', 'name / updateTime / items["10"]', `${fmt(realhead.name)} / ${fmt(realhead.updateTime)} / ${fmt(realhead.items['10'])}`],
  ['K线', 'name / start / total / rows', `${fmt(line.name)} / ${fmt(line.start)} / ${fmt(line.total)} / ${line.rows.length}`],
  ['K线', '最后一根', JSON.stringify(line.rows[line.rows.length - 1] || null)],
  ['资讯', '条数 / 首条', `${news.length} / ${news[0] ? `${news[0].time} ${news[0].title}` : '-'}`],
  ['000001 F10', 'name / industryName', `${fmt(f10B.name)} / ${fmt(f10B.industryName)}`],
  ['000001 F10', 'eps / 总股本 / 集中度', `${fmt(f10B.eps)} / ${fmt(f10B.totalShares)} / ${fmt(f10B.holderConcentration)}`],
  ['000001 公司资料', 'swIndustry / 地区 / 董事长', `${fmt(companyB.swIndustry)} / ${fmt(companyB.area)} / ${fmt(companyB.chairman)}`],
  ['000001 财务诊断', '报告期 / ROE / 负债率 / 毛利率', `${fmt(financeB.reportPeriod)} / ${fmt(financeB.roe)} / ${fmt(financeB.debtRatio)} / ${fmt(financeB.grossMargin)}`],
  ['000001 概念题材', '条数 / 首个', `${conceptsB.length} / ${conceptsB[0] ? conceptsB[0].name : '-'}`],
]

const widths = [0, 0, 0]
for (const row of table) {
  for (let i = 0; i < 3; i += 1) widths[i] = Math.max(widths[i], row[i].length)
}
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length))
console.log('\n=== 同花顺页面解析简表 ===')
for (const row of table) {
  console.log(`${pad(row[0], widths[0])} | ${pad(row[1], widths[1])} | ${row[2]}`)
}

console.log(`\n断言：通过 ${passed}，失败 ${failed}`)
if (failed > 0) {
  console.log('\n失败明细：')
  for (const item of failures) console.log(` - ${item}`)
  process.exitCode = 1
} else {
  console.log('全部断言通过 ✔')
}
