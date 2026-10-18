/**
 * 个股智能分析（Client half）
 *
 * 在 Web 界面注册「个股智能分析」主面板与侧边栏图标：输入股票代码 / 名称，
 * 由 Host 抓取同花顺与东方财富数据，页面展示概览、技术面、资金面、
 * 行业与板块、基本面、消息面、热点与规则化投资建议。
 *
 * 数据来自 Host 的 GET /dsh-stock/analyze.json?q=...（refresh=1 强制刷新）；
 * 页面只做展示与刷新，不与行情源直接通信。样式全部使用主题 token，跟随明暗主题。
 */
window.__ModuleLoader__.load({
  id: 'dsh-stock-analyzer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'stock-analyzer'
    const API = '/dsh-stock/analyze.json'

    const EXAMPLES = [
      { q: '600519', label: '600519 贵州茅台' },
      { q: '000001', label: '000001 平安银行' },
      { q: '300750', label: '300750 宁德时代' },
    ]

    /* ------------------------------------------------------------ */
    /* 文案                                                          */
    /* ------------------------------------------------------------ */

    const DICT = {
      zh: {
        panel: '个股分析',
        title: '个股智能分析',
        subtitle: '同花顺 · 东方财富 双数据源',
        placeholder: '输入股票代码或名称，如 600519 / 贵州茅台',
        analyze: '分析',
        analyzing: '分析中…',
        refresh: '刷新',
        refreshing: '刷新中…',
        retry: '重试',
        loading: '正在抓取行情与指标…',
        loadFailed: '分析失败',
        requestFailed: '请求失败',
        errorHint: '请确认股票代码或名称是否正确；数据源可能短暂限流，可稍后重试。',
        queryLabel: '查询',
        warnings: '提示',
        empty: '暂无数据',
        emptyTitle: '输入股票代码或名称开始分析',
        emptyHint: '支持 6 位代码（如 600519）、带市场前缀（sh600519）、带后缀（600519.SH）或中文名称 / 名称片段',
        examples: '示例',
        recent: '最近查询',
        notConnected: '未连接',
        updatedAt: '更新于',
        tradeDate: '交易日',
        cached: '缓存',
        stale: '可能过期',
        overview: '概览',
        quoteAt: '行情时间',
        amount: '成交额',
        turnoverRate: '换手率',
        volumeRatio: '量比',
        amplitude: '振幅',
        peTTM: 'PE(TTM)',
        pb: 'PB',
        totalMv: '总市值',
        circMv: '流通市值',
        range52: '52 周区间',
        technical: '技术面',
        barsInfo: 'K 线样本',
        trendScore: '趋势评分',
        support: '支撑',
        resistance: '压力',
        stopLoss: '止损',
        funds: '资金面',
        'order.super': '特大单',
        'order.large': '大单',
        'order.medium': '中单',
        'order.small': '小单',
        mainNet: '主力净额',
        mainNetRatio: '主力净占比',
        netRatio: '净流入占比',
        outerVol: '外盘',
        innerVol: '内盘',
        estimated: '估算',
        em5: '东财近5日主力',
        em10: '东财近10日主力',
        em20: '东财近20日主力',
        industry: '行业与板块',
        industryName: '行业',
        swName: '申万行业',
        sectorChange: '板块涨跌幅',
        sectorRank: '行业排名',
        netIn: '板块净流入',
        upDown: '上涨 / 下跌',
        leader: '领涨股',
        stockRank: '个股行业排名',
        peers: '同行对比',
        peerCode: '代码',
        peerName: '名称',
        peerPrice: '现价',
        peerChange: '涨跌幅',
        hotSectors: '热门板块',
        finance: '基本面',
        report: '报告期',
        eps: 'EPS',
        netProfit: '净利润',
        netProfitYoY: '净利润同比',
        revenue: '营业收入',
        revenueYoY: '营收增速',
        grossMargin: '毛利率',
        netMargin: '净利率',
        roe: 'ROE',
        debtRatio: '资产负债率',
        holderConcentration: '股东集中度',
        pledgeRatio: '质押比例',
        totalShares: '总股本',
        floatShares: '流通股本',
        diagnosis: '财务诊断',
        ranks: '指标排名',
        news: '消息面',
        marketNews: '市场要闻',
        kindNotice: '公告',
        kindNews: '资讯',
        hot: '热点',
        hotRank: '市场热榜第 N 名',
        hotRate: '人气',
        concepts: '相关概念',
        conceptHeat: '概念热度',
        advice: '投资建议',
        rating: '评级',
        scoreLabel: '综合评分',
        action: '操作建议',
        horizon: '建议周期',
        confidence: '信心',
        position: '建议仓位',
        reasons: '利好因素',
        risks: '风险提示',
        levels: '关键价位',
        target: '目标价',
        buyZone: '买入区间',
        noAdvice: '规则模型暂未给出建议',
        footNote: '数据来源：同花顺 + 东方财富公开接口 · 计算结果仅供参考，不构成投资建议',
      },
      en: {
        panel: 'Stock Analysis',
        title: 'Stock Intelligence',
        subtitle: 'Tonghuashun · Eastmoney dual data source',
        placeholder: 'Enter a code or name, e.g. 600519 / Kweichow Moutai',
        analyze: 'Analyze',
        analyzing: 'Analyzing…',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        retry: 'Retry',
        loading: 'Fetching quotes and indicators…',
        loadFailed: 'Analysis failed',
        requestFailed: 'Request failed',
        errorHint: 'Check the stock code or name; the data source may be briefly rate-limited — try again later.',
        queryLabel: 'Query',
        warnings: 'Notes',
        empty: 'No data',
        emptyTitle: 'Enter a stock code or name to start',
        emptyHint: 'Supports 6-digit codes (600519), market prefixes (sh600519), suffixes (600519.SH), or a Chinese name / name fragment',
        examples: 'Examples',
        recent: 'Recent',
        notConnected: 'Not connected',
        updatedAt: 'Updated',
        tradeDate: 'Trade date',
        cached: 'Cached',
        stale: 'May be stale',
        overview: 'Overview',
        quoteAt: 'Quote time',
        amount: 'Turnover',
        turnoverRate: 'Turnover rate',
        volumeRatio: 'Volume ratio',
        amplitude: 'Amplitude',
        peTTM: 'PE (TTM)',
        pb: 'PB',
        totalMv: 'Market cap',
        circMv: 'Float cap',
        range52: '52-week range',
        technical: 'Technicals',
        barsInfo: 'Bars',
        trendScore: 'Trend score',
        support: 'Support',
        resistance: 'Resistance',
        stopLoss: 'Stop loss',
        funds: 'Fund flow',
        'order.super': 'Super-large',
        'order.large': 'Large',
        'order.medium': 'Medium',
        'order.small': 'Small',
        mainNet: 'Main net',
        mainNetRatio: 'Main net ratio',
        netRatio: 'Net ratio',
        outerVol: 'Outer vol',
        innerVol: 'Inner vol',
        estimated: 'Est.',
        em5: 'EM main 5d',
        em10: 'EM main 10d',
        em20: 'EM main 20d',
        industry: 'Industry & sectors',
        industryName: 'Industry',
        swName: 'SW industry',
        sectorChange: 'Sector change',
        sectorRank: 'Industry rank',
        netIn: 'Sector net inflow',
        upDown: 'Advancers / decliners',
        leader: 'Leader',
        stockRank: 'Stock rank in industry',
        peers: 'Peers',
        peerCode: 'Code',
        peerName: 'Name',
        peerPrice: 'Price',
        peerChange: 'Change',
        hotSectors: 'Hot sectors',
        finance: 'Fundamentals',
        report: 'Report period',
        eps: 'EPS',
        netProfit: 'Net profit',
        netProfitYoY: 'Net profit YoY',
        revenue: 'Revenue',
        revenueYoY: 'Revenue growth',
        grossMargin: 'Gross margin',
        netMargin: 'Net margin',
        roe: 'ROE',
        debtRatio: 'Debt ratio',
        holderConcentration: 'Holder concentration',
        pledgeRatio: 'Pledge ratio',
        totalShares: 'Total shares',
        floatShares: 'Float shares',
        diagnosis: 'Diagnosis',
        ranks: 'Metric ranks',
        news: 'News',
        marketNews: 'Market news',
        kindNotice: 'Notice',
        kindNews: 'News',
        hot: 'Hotspot',
        hotRank: 'Market heat rank #N',
        hotRate: 'Heat',
        concepts: 'Concepts',
        conceptHeat: 'Concept heat',
        advice: 'Investment view',
        rating: 'Rating',
        scoreLabel: 'Score',
        action: 'Action',
        horizon: 'Horizon',
        confidence: 'Confidence',
        position: 'Position',
        reasons: 'Bullish',
        risks: 'Risks',
        levels: 'Key levels',
        target: 'Target',
        buyZone: 'Buy zone',
        noAdvice: 'The rule model did not produce a view',
        footNote: 'Source: Tonghuashun + Eastmoney public APIs · for reference only, not investment advice',
      },
    }

    let translate = (key) => DICT.zh[key] ?? key
    let localeService = null

    function useT() {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => {
        if (!localeService || typeof localeService.subscribe !== 'function') return undefined
        return localeService.subscribe(() => force())
      }, [])
      return translate
    }

    /* ------------------------------------------------------------ */
    /* 格式化工具（null 一律显示「—」）                              */
    /* ------------------------------------------------------------ */

    function num(value) {
      if (value === null || value === undefined) return null
      if (typeof value === 'string' && value.trim() === '') return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    function fixed(value, digits) {
      const parsed = num(value)
      if (parsed === null) return '—'
      return parsed.toFixed(digits === undefined ? 2 : digits)
    }

    function pct(value) {
      const parsed = num(value)
      if (parsed === null) return '—'
      return `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`
    }

    function pctPlain(value) {
      const parsed = num(value)
      if (parsed === null) return '—'
      return `${parsed.toFixed(2)}%`
    }

    /** 元 → 万亿 / 亿 / 万。 */
    function money(value, signed) {
      const parsed = num(value)
      if (parsed === null) return '—'
      const abs = Math.abs(parsed)
      let text
      if (abs >= 1e12) text = `${(abs / 1e12).toFixed(2)}万亿`
      else if (abs >= 1e8) text = `${(abs / 1e8).toFixed(2)}亿`
      else if (abs >= 1e4) text = `${(abs / 1e4).toFixed(2)}万`
      else text = abs.toFixed(2)
      if (signed) return `${parsed > 0 ? '+' : parsed < 0 ? '-' : ''}${text}`
      return `${parsed < 0 ? '-' : ''}${text}`
    }

    /** 已经是亿元单位的数值（如行业净流入）。 */
    function yi(value, signed) {
      const parsed = num(value)
      if (parsed === null) return '—'
      const sign = signed === false ? '' : parsed > 0 ? '+' : parsed < 0 ? '-' : ''
      return `${sign}${Math.abs(parsed).toFixed(2)}亿`
    }

    /** 手 / 股数等大整数。 */
    function count(value) {
      const parsed = num(value)
      if (parsed === null) return '—'
      const abs = Math.abs(parsed)
      if (abs >= 1e8) return `${(abs / 1e8).toFixed(2)}亿`
      if (abs >= 1e4) return `${(abs / 1e4).toFixed(2)}万`
      return String(Math.round(abs))
    }

    function shares(value) {
      const parsed = num(value)
      if (parsed === null) return '—'
      return `${(parsed / 1e8).toFixed(2)}亿股`
    }

    function signedFixed(value, digits) {
      const parsed = num(value)
      if (parsed === null) return '—'
      return `${parsed > 0 ? '+' : ''}${parsed.toFixed(digits === undefined ? 2 : digits)}`
    }

    /** A 股习惯：涨红、跌绿、零灰。 */
    function toneOf(value) {
      const parsed = num(value)
      if (parsed === null || parsed === 0) return 'sa-flat'
      return parsed > 0 ? 'sa-up' : 'sa-down'
    }

    function statusTone(status) {
      const text = String(status === null || status === undefined ? '' : status).toLowerCase()
      if (text === 'bull' || text === 'up' || text === 'strong' || text === 'positive') return 'sa-up'
      if (text === 'bear' || text === 'down' || text === 'weak' || text === 'negative') return 'sa-down'
      return 'sa-flat'
    }

    function ratingTone(rating) {
      const text = String(rating === null || rating === undefined ? '' : rating)
      if (/看多|买入|增持|推荐|bull|buy/i.test(text)) return 'sa-up'
      if (/看空|卖出|减持|bear|sell/i.test(text)) return 'sa-down'
      return 'sa-flat'
    }

    function textOf(value) {
      if (value === null || value === undefined) return '—'
      const text = String(value).trim()
      return text === '' ? '—' : text
    }

    function rangeText(low, high) {
      if (num(low) === null && num(high) === null) return '—'
      return `${fixed(low)} ~ ${fixed(high)}`
    }

    function dateTimeText(value) {
      if (!value) return '—'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      const pad = (part) => String(part).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function listOf(value) {
      if (!Array.isArray(value)) return []
      return value.filter((item) => item !== null && item !== undefined)
    }

    function rankText(rank, total) {
      if (num(rank) === null) return '—'
      return num(total) === null ? String(rank) : `${rank} / ${total}`
    }

    /* ------------------------------------------------------------ */
    /* 基础组件                                                      */
    /* ------------------------------------------------------------ */

    function Card(props) {
      return h(
        'section',
        { className: props.className ? `sa-card ${props.className}` : 'sa-card' },
        props.title
          ? h(
              'header',
              { className: 'sa-card-head' },
              h('div', { className: 'sa-card-title' }, props.title),
              props.note ? h('div', { className: 'sa-card-note' }, props.note) : null,
            )
          : null,
        props.children,
      )
    }

    function Empty(props) {
      return h('div', { className: 'sa-empty' }, props.text ? props.text : translate('empty'))
    }

    function Field(props) {
      return h(
        'div',
        { className: 'sa-field' },
        h('div', { className: 'sa-field-label' }, props.label),
        h(
          'div',
          { className: `sa-field-value ${props.tone ? props.tone : ''}` },
          props.value === null || props.value === undefined || props.value === '' ? '—' : props.value,
        ),
      )
    }

    function Fields(props) {
      const items = listOf(props.items)
      if (items.length === 0) return h(Empty, { text: props.emptyText })
      return h(
        'div',
        { className: 'sa-fields' },
        items.map((item, index) =>
          h(Field, {
            key: `${item.label}-${index}`,
            label: item.label,
            value: item.value,
            tone: item.tone,
          }),
        ),
      )
    }

    function LevelBox(props) {
      return h(
        'div',
        { className: 'sa-level' },
        h('div', { className: 'sa-level-label' }, props.label),
        h('div', { className: `sa-level-value ${props.tone ? props.tone : ''}` }, props.value),
      )
    }

    function SourceBadges(props) {
      const sources = listOf(props.sources)
      if (sources.length === 0) return null
      return h(
        'div',
        { className: 'sa-sources' },
        sources.map((source, index) => {
          const ok = source.ok === true
          return h(
            'span',
            {
              key: `${source.id === undefined ? 'src' : source.id}-${index}`,
              className: ok ? 'sa-source' : 'sa-source sa-source-off',
              title: source.note ? String(source.note) : '',
            },
            h('span', { className: ok ? 'sa-source-dot sa-source-dot-ok' : 'sa-source-dot sa-source-dot-off' }),
            h('span', { className: 'sa-source-label' }, textOf(source.label === undefined ? source.id : source.label)),
            ok ? null : h('span', { className: 'sa-source-state' }, translate('notConnected')),
          )
        }),
      )
    }

    function ScoreRing(props) {
      const value = clamp(num(props.score) === null ? 0 : num(props.score), 0, 100)
      const hasScore = num(props.score) !== null
      const radius = 26
      const circumference = 2 * Math.PI * radius
      const offset = circumference * (1 - value / 100)
      return h(
        'div',
        { className: `sa-ring ${props.tone ? props.tone : 'sa-flat'}` },
        h(
          'svg',
          { viewBox: '0 0 64 64', width: 64, height: 64, 'aria-hidden': 'true' },
          h('circle', { className: 'sa-ring-track', cx: 32, cy: 32, r: radius, fill: 'none', strokeWidth: 6 }),
          hasScore
            ? h('circle', {
                className: 'sa-ring-fill',
                cx: 32,
                cy: 32,
                r: radius,
                fill: 'none',
                strokeWidth: 6,
                strokeLinecap: 'round',
                strokeDasharray: String(circumference),
                strokeDashoffset: String(offset),
                transform: 'rotate(-90 32 32)',
              })
            : null,
        ),
        h(
          'div',
          { className: 'sa-ring-text' },
          h('span', { className: 'sa-ring-score' }, hasScore ? String(Math.round(value)) : '—'),
          h('span', { className: 'sa-ring-unit' }, '/100'),
        ),
      )
    }

    function FundBar(props) {
      const parsed = num(props.value)
      const ratio = parsed === null || !(props.max > 0) ? 0 : (Math.abs(parsed) / props.max) * 50
      const style =
        parsed !== null && parsed < 0
          ? { left: `${50 - ratio}%`, width: `${ratio}%` }
          : { left: '50%', width: `${ratio}%` }
      return h(
        'div',
        { className: 'sa-bar-row' },
        h('span', { className: 'sa-bar-label' }, props.label),
        h(
          'span',
          { className: 'sa-bar-track' },
          h('span', { className: `sa-bar-fill ${toneOf(props.value)}`, style }),
        ),
        h('span', { className: `sa-bar-value ${toneOf(props.value)}` }, money(props.value, true)),
      )
    }

    function NewsList(props) {
      const items = listOf(props.items).slice(0, props.limit === undefined ? 12 : props.limit)
      if (items.length === 0) return h(Empty, { text: translate('empty') })
      return h(
        'div',
        { className: 'sa-news' },
        items.map((item, index) => {
          const title = textOf(item.title)
          const kind = item.kind === 'notice' ? translate('kindNotice') : item.kind === 'news' ? translate('kindNews') : null
          const link = typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
          return h(
            'div',
            { className: 'sa-news-row', key: `${index}-${title}` },
            h('span', { className: 'sa-news-time' }, textOf(item.time)),
            props.showKind === false || kind === null ? null : h('span', { className: 'sa-news-kind' }, kind),
            link
              ? h(
                  'a',
                  {
                    className: 'sa-news-title',
                    href: item.url,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title,
                  },
                  title,
                )
              : h('span', { className: 'sa-news-title' }, title),
          )
        }),
      )
    }

    function PeersTable(props) {
      const rows = listOf(props.rows).slice(0, props.limit === undefined ? 10 : props.limit)
      if (rows.length === 0) return h(Empty, { text: translate('empty') })
      const t = translate
      return h(
        'table',
        { className: 'sa-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, t('peerCode')),
            h('th', null, t('peerName')),
            h('th', { className: 'sa-num' }, t('peerPrice')),
            h('th', { className: 'sa-num' }, t('peerChange')),
          ),
        ),
        h(
          'tbody',
          null,
          rows.map((row, index) =>
            h(
              'tr',
              { key: `${row.code === undefined ? index : row.code}-${index}` },
              h('td', { className: 'sa-mono' }, textOf(row.code)),
              h('td', null, textOf(row.name)),
              h('td', { className: 'sa-num' }, fixed(row.price, 2)),
              h('td', { className: `sa-num ${toneOf(row.changePct)}` }, pct(row.changePct)),
            ),
          ),
        ),
      )
    }

    function ErrorCard(props) {
      const t = translate
      const warnings = listOf(props.warnings)
      return h(
        'div',
        { className: 'sa-error-card' },
        h('div', { className: 'sa-error-title' }, props.title ? props.title : t('loadFailed')),
        props.query
          ? h(
              'div',
              { className: 'sa-error-query' },
              `${t('queryLabel')}：${props.query}`,
            )
          : null,
        h('div', { className: 'sa-error-detail' }, props.detail ? String(props.detail) : '—'),
        warnings.length > 0
          ? h(
              'ul',
              { className: 'sa-warn-list' },
              warnings.map((warning, index) => h('li', { key: index }, String(warning))),
            )
          : null,
        h('div', { className: 'sa-error-hint' }, t('errorHint')),
        h(
          'button',
          { type: 'button', className: 'sa-btn sa-btn-accent', onClick: props.onRetry },
          t('retry'),
        ),
      )
    }

    /* ------------------------------------------------------------ */
    /* 报告卡片                                                      */
    /* ------------------------------------------------------------ */

    function OverviewCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const meta = data.meta ? data.meta : {}
      const quote = data.quote ? data.quote : {}
      const query = data.query ? data.query : {}
      const name = textOf(quote.name === undefined ? query.name : quote.name)
      const code = textOf(quote.code === undefined ? query.code : quote.code)
      const market = textOf(quote.market === undefined ? query.market : quote.market)
      const board = textOf(quote.board === undefined ? query.board : quote.board)
      const tone = toneOf(quote.changePct)
      const change = num(quote.change)
      const quoteTime = textOf(quote.quoteAt === undefined ? meta.quoteAt : quote.quoteAt)
      const fields = [
        { label: t('amount'), value: money(quote.amount) },
        { label: t('turnoverRate'), value: pctPlain(quote.turnoverRate) },
        { label: t('volumeRatio'), value: fixed(quote.volumeRatio, 2) },
        { label: t('amplitude'), value: pctPlain(quote.amplitude) },
        { label: t('peTTM'), value: fixed(quote.peTTM, 2) },
        { label: t('pb'), value: fixed(quote.pb, 2) },
        { label: t('totalMv'), value: money(quote.totalMv) },
        { label: t('circMv'), value: money(quote.circMv) },
        { label: t('range52'), value: rangeText(quote.low52, quote.high52) },
        { label: t('quoteAt'), value: quoteTime },
      ]
      return h(
        Card,
        { title: t('overview'), note: `${t('updatedAt')} ${quoteTime}` },
        h(
          'div',
          { className: 'sa-ov' },
          h(
            'div',
            { className: 'sa-ov-id' },
            h('div', { className: 'sa-ov-name' }, name),
            h(
              'div',
              { className: 'sa-ov-tags' },
              h('span', { className: 'sa-tag sa-tag-strong' }, code),
              market === '—' ? null : h('span', { className: 'sa-tag' }, market),
              board === '—' ? null : h('span', { className: 'sa-tag' }, board),
            ),
          ),
          h(
            'div',
            { className: 'sa-ov-price' },
            h('div', { className: `sa-ov-price-value ${tone}` }, fixed(quote.price, 2)),
            h(
              'div',
              { className: 'sa-ov-price-meta' },
              h('span', { className: tone }, signedFixed(change, 2)),
              h('span', { className: tone }, pct(quote.changePct)),
            ),
          ),
        ),
        h(Fields, { items: fields }),
      )
    }

    function TechnicalCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const technical = data.technical ? data.technical : {}
      const trend = technical.trend ? technical.trend : null
      const items = listOf(technical.items)
      const bars = technical.bars ? technical.bars : {}
      const barCount = num(bars.count)
      const barsNote =
        barCount === null ? null : `${t('barsInfo')} ${barCount} · ${textOf(bars.from)} ~ ${textOf(bars.to)}`
      const score = trend ? num(trend.score) : null
      return h(
        Card,
        { title: t('technical'), note: barsNote },
        trend
          ? h(
              'div',
              { className: 'sa-trend' },
              h(
                'div',
                { className: 'sa-trend-line' },
                h('span', { className: `sa-pill ${ratingTone(trend.label)}` }, textOf(trend.label)),
                score === null
                  ? null
                  : h('span', { className: 'sa-trend-score' }, `${t('trendScore')} ${Math.round(score)}`),
              ),
              trend.text ? h('div', { className: 'sa-trend-text' }, textOf(trend.text)) : null,
            )
          : null,
        items.length > 0
          ? h(
              'div',
              { className: 'sa-items' },
              items.map((item, index) =>
                h(
                  'div',
                  {
                    className: 'sa-item',
                    key: `${item.key === undefined ? 'item' : item.key}-${index}`,
                    title: item.note ? String(item.note) : '',
                  },
                  h('span', { className: `sa-dot ${statusTone(item.status)}` }),
                  h('span', { className: 'sa-item-label' }, textOf(item.label)),
                  h('span', { className: 'sa-item-value' }, textOf(item.value)),
                ),
              ),
            )
          : h(Empty, { text: t('empty') }),
        h(
          'div',
          { className: 'sa-levels' },
          h(LevelBox, { label: t('support'), value: fixed(technical.support, 2) }),
          h(LevelBox, { label: t('resistance'), value: fixed(technical.resistance, 2) }),
          h(LevelBox, { label: t('stopLoss'), value: fixed(technical.stopLoss, 2), tone: 'sa-warn' }),
        ),
      )
    }

    function FundsCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const funds = data.funds ? data.funds : {}
      const quote = data.quote ? data.quote : {}
      const rows = [
        { key: 'super', label: t('order.super'), value: funds.superNet },
        { key: 'large', label: t('order.large'), value: funds.largeNet },
        { key: 'medium', label: t('order.medium'), value: funds.mediumNet },
        { key: 'small', label: t('order.small'), value: funds.smallNet },
      ]
      const hasValue = rows.some((row) => num(row.value) !== null)
      const max = Math.max(1, ...rows.map((row) => Math.abs(num(row.value) === null ? 0 : num(row.value))))
      const outer = num(funds.outerVol) === null ? quote.outerVol : funds.outerVol
      const inner = num(funds.innerVol) === null ? quote.innerVol : funds.innerVol
      const em = funds.em ? funds.em : {}
      const emValues = [num(em.main5), num(em.main10), num(em.main20)].some((value) => value !== null)
      const note = funds.estimated === true ? t('estimated') : null
      return h(
        Card,
        { title: t('funds'), note },
        hasValue
          ? h(
              'div',
              { className: 'sa-bars' },
              rows.map((row) => h(FundBar, { key: row.key, label: row.label, value: row.value, max })),
            )
          : h(Empty, { text: t('empty') }),
        h(Fields, {
          items: [
            { label: t('mainNet'), value: money(funds.mainNet, true), tone: toneOf(funds.mainNet) },
            { label: t('mainNetRatio'), value: pctPlain(funds.mainNetRatio), tone: toneOf(funds.mainNetRatio) },
            { label: t('netRatio'), value: pctPlain(funds.netRatio), tone: toneOf(funds.netRatio) },
            { label: t('outerVol'), value: count(outer) },
            { label: t('innerVol'), value: count(inner) },
            ...(emValues
              ? [
                  { label: t('em5'), value: money(em.main5, true), tone: toneOf(em.main5) },
                  { label: t('em10'), value: money(em.main10, true), tone: toneOf(em.main10) },
                  { label: t('em20'), value: money(em.main20, true), tone: toneOf(em.main20) },
                ]
              : []),
          ],
        }),
      )
    }

    function IndustryCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const industry = data.industry ? data.industry : {}
      if (Object.keys(industry).length === 0) {
        return h(Card, { title: t('industry') }, h(Empty, { text: t('empty') }))
      }
      const peers = listOf(industry.peers)
      const hotSectors = listOf(industry.hotSectors).slice(0, 5)
      const leader = industry.leader ? industry.leader : null
      const stockRank = industry.stockRank ? industry.stockRank : null
      const fields = [
        { label: t('industryName'), value: textOf(industry.name) },
        { label: t('swName'), value: textOf(industry.swName) },
        { label: t('sectorChange'), value: pct(industry.changePct), tone: toneOf(industry.changePct) },
        { label: t('sectorRank'), value: rankText(industry.rank, industry.total) },
        { label: t('netIn'), value: yi(industry.netIn), tone: toneOf(industry.netIn) },
        {
          label: t('upDown'),
          value: `${num(industry.upCount) === null ? '—' : industry.upCount} / ${
            num(industry.downCount) === null ? '—' : industry.downCount
          }`,
        },
        {
          label: t('leader'),
          value: leader ? `${textOf(leader.name)} ${pct(leader.changePct)}` : '—',
        },
        {
          label: t('stockRank'),
          value:
            stockRank && num(stockRank.rank) !== null
              ? `${rankText(stockRank.rank, stockRank.total)}（${pct(stockRank.changePct)}）`
              : '—',
        },
      ]
      return h(
        Card,
        { title: t('industry'), note: textOf(industry.code) === '—' ? null : textOf(industry.code) },
        h(Fields, { items: fields }),
        h(
          'div',
          { className: 'sa-sub-block' },
          h('div', { className: 'sa-mini-title' }, t('peers')),
          h(PeersTable, { rows: peers, limit: 10 }),
        ),
        hotSectors.length > 0
          ? h(
              'div',
              { className: 'sa-sub-block' },
              h('div', { className: 'sa-mini-title' }, t('hotSectors')),
              h(
                'div',
                { className: 'sa-sublist' },
                hotSectors.map((sector, index) =>
                  h(
                    'div',
                    {
                      className: 'sa-sublist-row',
                      key: `${sector.name === undefined ? index : sector.name}-${index}`,
                    },
                    h('span', { className: 'sa-sublist-name' }, textOf(sector.name)),
                    h('span', { className: 'sa-sublist-meta' }, textOf(sector.leader)),
                    h('span', { className: `sa-sublist-pct ${toneOf(sector.changePct)}` }, pct(sector.changePct)),
                    h('span', { className: `sa-sublist-val ${toneOf(sector.netIn)}` }, yi(sector.netIn)),
                  ),
                ),
              ),
            )
          : null,
      )
    }

    function FinanceCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const finance = data.finance ? data.finance : {}
      if (Object.keys(finance).length === 0) {
        return h(Card, { title: t('finance') }, h(Empty, { text: t('empty') }))
      }
      const diagnosis = listOf(finance.diagnosis)
      const ranks = listOf(finance.ranks)
      const fields = [
        { label: t('report'), value: textOf(finance.report) },
        { label: t('eps'), value: fixed(finance.eps, 2) },
        { label: t('netProfit'), value: money(finance.netProfit) },
        { label: t('netProfitYoY'), value: pct(finance.netProfitYoY), tone: toneOf(finance.netProfitYoY) },
        { label: t('revenue'), value: money(finance.revenue) },
        { label: t('revenueYoY'), value: pct(finance.revenueYoY), tone: toneOf(finance.revenueYoY) },
        { label: t('grossMargin'), value: pctPlain(finance.grossMargin) },
        { label: t('netMargin'), value: pctPlain(finance.netMargin) },
        { label: t('roe'), value: pctPlain(finance.roe) },
        { label: t('debtRatio'), value: pctPlain(finance.debtRatio) },
        { label: t('holderConcentration'), value: pctPlain(finance.holderConcentration) },
        { label: t('pledgeRatio'), value: pctPlain(finance.pledgeRatio) },
        { label: t('totalShares'), value: shares(finance.totalShares) },
        { label: t('floatShares'), value: shares(finance.floatShares) },
      ]
      return h(
        Card,
        { title: t('finance'), note: textOf(finance.report) === '—' ? null : textOf(finance.report) },
        h(Fields, { items: fields }),
        h(
          'div',
          { className: 'sa-sub-block' },
          h('div', { className: 'sa-mini-title' }, t('diagnosis')),
          diagnosis.length > 0
            ? h(
                'ul',
                { className: 'sa-bullets' },
                diagnosis.map((line, index) => h('li', { key: index }, String(line))),
              )
            : h(Empty, { text: t('empty') }),
        ),
        ranks.length > 0
          ? h(
              'div',
              { className: 'sa-sub-block' },
              h('div', { className: 'sa-mini-title' }, t('ranks')),
              h(
                'div',
                { className: 'sa-sublist' },
                ranks.map((row, index) =>
                  h(
                    'div',
                    { className: 'sa-sublist-row', key: index },
                    h('span', { className: 'sa-sublist-name' }, textOf(row.item === undefined ? row.name : row.item)),
                    h('span', { className: 'sa-sublist-meta' }, textOf(row.text)),
                    h('span', { className: 'sa-sublist-val sa-mono' }, textOf(row.rank)),
                  ),
                ),
              ),
            )
          : null,
      )
    }

    function NewsCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const news = listOf(data.news)
      const hot = data.hot ? data.hot : {}
      const marketNews = listOf(hot.marketNews)
      if (news.length === 0 && marketNews.length === 0) {
        return h(Card, { title: t('news') }, h(Empty, { text: t('empty') }))
      }
      return h(
        Card,
        { title: t('news'), note: news.length > 0 ? String(news.length) : null },
        news.length > 0 ? h(NewsList, { items: news, limit: 12 }) : h(Empty, { text: t('empty') }),
        marketNews.length > 0
          ? h(
              'div',
              { className: 'sa-sub-block' },
              h('div', { className: 'sa-mini-title' }, t('marketNews')),
              h(NewsList, { items: marketNews, limit: 8, showKind: false }),
            )
          : null,
      )
    }

    function HotCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const hot = data.hot ? data.hot : {}
      const concepts = listOf(hot.concepts)
      const heat = listOf(hot.conceptHeat)
      const rank = num(hot.rank)
      const rate = num(hot.rate)
      const hasAny = rank !== null || hot.reason || concepts.length > 0 || heat.length > 0 || rate !== null
      if (!hasAny) return h(Card, { title: t('hot') }, h(Empty, { text: t('empty') }))
      return h(
        Card,
        { title: t('hot'), note: rate === null ? null : `${t('hotRate')} ${count(rate)}` },
        rank === null
          ? null
          : h('div', { className: 'sa-hot-rank' }, t('hotRank').replace('N', String(Math.round(rank)))),
        hot.reason ? h('div', { className: 'sa-hot-reason' }, textOf(hot.reason)) : null,
        concepts.length > 0
          ? h(
              'div',
              { className: 'sa-sub-block' },
              h('div', { className: 'sa-mini-title' }, t('concepts')),
              h(
                'div',
                { className: 'sa-chips' },
                concepts.map((concept, index) =>
                  h(
                    'span',
                    {
                      className: 'sa-chip',
                      key: `${concept.name === undefined ? index : concept.name}-${index}`,
                      title: textOf(concept.desc),
                    },
                    textOf(concept.name),
                  ),
                ),
              ),
            )
          : null,
        heat.length > 0
          ? h(
              'div',
              { className: 'sa-sub-block' },
              h('div', { className: 'sa-mini-title' }, t('conceptHeat')),
              h(
                'div',
                { className: 'sa-chips' },
                heat.map((item, index) =>
                  h(
                    'span',
                    { className: 'sa-chip', key: `${item.name === undefined ? index : item.name}-${index}` },
                    h('span', null, textOf(item.name)),
                    num(item.rank) === null
                      ? null
                      : h('span', { className: 'sa-chip-rank' }, `#${Math.round(num(item.rank))}`),
                  ),
                ),
              ),
            )
          : null,
      )
    }

    function AdviceCard(props) {
      const t = translate
      const data = props.data ? props.data : {}
      const advice = data.advice ? data.advice : {}
      if (Object.keys(advice).length === 0) {
        return h(Card, { title: t('advice') }, h(Empty, { text: t('noAdvice') }))
      }
      const levels = advice.levels ? advice.levels : {}
      const reasons = listOf(advice.reasons)
      const risks = listOf(advice.risks)
      const tone = ratingTone(advice.rating)
      const score = num(advice.score)
      const metaItems = [
        { key: 'horizon', label: t('horizon'), value: advice.horizon },
        { key: 'confidence', label: t('confidence'), value: advice.confidence },
        { key: 'position', label: t('position'), value: advice.position },
      ].filter((item) => textOf(item.value) !== '—')
      return h(
        Card,
        {
          title: t('advice'),
          note: textOf(advice.rating) === '—' ? null : `${t('rating')} ${textOf(advice.rating)}`,
        },
        h(
          'div',
          { className: 'sa-advice-head' },
          h(ScoreRing, { score, tone }),
          h(
            'div',
            { className: 'sa-advice-main' },
            h(
              'div',
              { className: 'sa-advice-line' },
              h('span', { className: `sa-pill sa-pill-lg ${tone}` }, textOf(advice.rating)),
              score === null
                ? null
                : h('span', { className: 'sa-advice-score' }, `${t('scoreLabel')} ${Math.round(score)}`),
            ),
            h(
              'div',
              { className: 'sa-advice-action' },
              h('span', { className: 'sa-advice-action-label' }, `${t('action')}：`),
              textOf(advice.action),
            ),
            metaItems.length > 0
              ? h(
                  'div',
                  { className: 'sa-advice-meta' },
                  metaItems.map((item) =>
                    h(
                      'span',
                      { className: 'sa-advice-meta-item', key: item.key },
                      h('span', { className: 'sa-advice-meta-label' }, item.label),
                      h('span', null, textOf(item.value)),
                    ),
                  ),
                )
              : null,
          ),
        ),
        h('div', { className: 'sa-mini-title' }, t('levels')),
        h(
          'div',
          { className: 'sa-levels sa-levels-5' },
          h(LevelBox, { label: t('support'), value: fixed(levels.support, 2) }),
          h(LevelBox, { label: t('resistance'), value: fixed(levels.resistance, 2) }),
          h(LevelBox, { label: t('stopLoss'), value: fixed(levels.stopLoss, 2), tone: 'sa-warn' }),
          h(LevelBox, { label: t('target'), value: fixed(levels.target, 2), tone: 'sa-up' }),
          h(LevelBox, { label: t('buyZone'), value: textOf(levels.buyZone) }),
        ),
        h(
          'div',
          { className: 'sa-grid2 sa-grid2-inner' },
          h(
            'div',
            { className: 'sa-list-block' },
            h('div', { className: 'sa-mini-title' }, t('reasons')),
            reasons.length > 0
              ? h(
                  'ul',
                  { className: 'sa-list' },
                  reasons.map((reason, index) =>
                    h(
                      'li',
                      { key: index },
                      h('span', { className: 'sa-dot sa-up' }),
                      h('span', null, String(reason)),
                    ),
                  ),
                )
              : h(Empty, { text: t('empty') }),
          ),
          h(
            'div',
            { className: 'sa-list-block' },
            h('div', { className: 'sa-mini-title' }, t('risks')),
            risks.length > 0
              ? h(
                  'ul',
                  { className: 'sa-list' },
                  risks.map((risk, index) =>
                    h(
                      'li',
                      { key: index },
                      h('span', { className: 'sa-dot sa-down' }),
                      h('span', null, String(risk)),
                    ),
                  ),
                )
              : h(Empty, { text: t('empty') }),
          ),
        ),
        advice.disclaimer ? h('div', { className: 'sa-disclaimer' }, textOf(advice.disclaimer)) : null,
      )
    }

    /* ------------------------------------------------------------ */
    /* 页面                                                          */
    /* ------------------------------------------------------------ */

    function Page() {
      const t = useT()
      const [input, setInput] = React.useState('')
      const [view, setView] = React.useState({ phase: 'idle', data: null, error: null, query: '' })
      const [recent, setRecent] = React.useState([])
      const [busy, setBusy] = React.useState(false)
      const alive = React.useRef(true)
      const seqRef = React.useRef(0)

      const run = React.useCallback(async (raw, force) => {
        const q = String(raw === null || raw === undefined ? '' : raw).trim()
        if (q === '') return
        const seq = ++seqRef.current
        setBusy(true)
        setView({ phase: 'loading', data: null, error: null, query: q })
        try {
          const suffix = force === true ? '&refresh=1' : ''
          const response = await fetch(`${API}?q=${encodeURIComponent(q)}${suffix}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const json = await response.json()
          if (!alive.current || seq !== seqRef.current) return
          if (json && json.ok === true) {
            setView({ phase: 'ready', data: json, error: null, query: q })
            setRecent((previous) => [q].concat(previous.filter((item) => item !== q)).slice(0, 6))
          } else {
            setView({
              phase: 'failed',
              data: json && typeof json === 'object' ? json : null,
              error: (json && json.error) || translate('loadFailed'),
              query: q,
            })
          }
        } catch (error) {
          if (!alive.current || seq !== seqRef.current) return
          setView({
            phase: 'error',
            data: null,
            error: String((error && error.message) || error),
            query: q,
          })
        } finally {
          if (alive.current && seq === seqRef.current) setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
          seqRef.current += 1
        }
      }, [])

      const submit = (raw, force) => {
        const q = String(raw === null || raw === undefined ? '' : raw).trim()
        if (q === '') return
        setInput(q)
        run(q, force === true)
      }

      const meta = view.data && view.data.meta ? view.data.meta : {}
      const sources = listOf(meta.sources)

      const header = h(
        'header',
        { className: 'sa-head' },
        h(
          'div',
          { className: 'sa-head-main' },
          h('div', { className: 'sa-title' }, h('span', { className: 'sa-title-dot' }), t('title')),
          h(
            'div',
            { className: 'sa-sub' },
            h('span', { className: 'sa-src-note' }, t('subtitle')),
            meta.tradeDate ? h('span', null, `${t('tradeDate')} ${meta.tradeDate}`) : null,
            meta.cached === true ? h('span', { className: 'sa-tag' }, t('cached')) : null,
            meta.stale === true ? h('span', { className: 'sa-tag sa-warn' }, t('stale')) : null,
          ),
        ),
        h('div', { className: 'sa-head-right' }, h(SourceBadges, { sources })),
      )

      const search = h(
        'form',
        {
          className: 'sa-search',
          onSubmit: (event) => {
            event.preventDefault()
            submit(input, false)
          },
        },
        h('input', {
          className: 'sa-input',
          type: 'search',
          value: input,
          placeholder: t('placeholder'),
          'aria-label': t('placeholder'),
          disabled: busy,
          onChange: (event) => setInput(event.target.value),
        }),
        h(
          'button',
          { type: 'submit', className: 'sa-btn sa-btn-accent', disabled: busy || input.trim() === '' },
          busy ? t('analyzing') : t('analyze'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'sa-btn',
            disabled: busy || view.query === '',
            onClick: () => run(view.query, true),
          },
          busy ? t('refreshing') : t('refresh'),
        ),
      )

      const recentRow =
        recent.length > 0
          ? h(
              'div',
              { className: 'sa-recent' },
              h('span', { className: 'sa-recent-label' }, t('recent')),
              h(
                'div',
                { className: 'sa-chips' },
                recent.map((code) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sa-chip sa-chip-btn',
                      key: code,
                      disabled: busy,
                      onClick: () => submit(code, false),
                    },
                    code,
                  ),
                ),
              ),
            )
          : null

      const idleBlock = h(
        'div',
        { className: 'sa-idle' },
        h('div', { className: 'sa-idle-title' }, t('emptyTitle')),
        h('div', { className: 'sa-idle-hint' }, t('emptyHint')),
        h(
          'div',
          { className: 'sa-idle-examples' },
          h('span', { className: 'sa-recent-label' }, t('examples')),
          h(
            'div',
            { className: 'sa-chips' },
            EXAMPLES.map((example) =>
              h(
                'button',
                {
                  type: 'button',
                  className: 'sa-chip sa-chip-btn',
                  key: example.q,
                  disabled: busy,
                  onClick: () => submit(example.q, false),
                },
                example.label,
              ),
            ),
          ),
        ),
      )

      const body = (() => {
        if (view.phase === 'idle') return idleBlock
        if (view.phase === 'loading') {
          return h(
            'div',
            { className: 'sa-placeholder' },
            h('div', { className: 'sa-spinner' }),
            h('div', { className: 'sa-placeholder-text' }, t('loading')),
            view.query ? h('div', { className: 'sa-placeholder-sub' }, `${t('queryLabel')}：${view.query}`) : null,
          )
        }
        if (view.phase === 'failed') {
          return h(ErrorCard, {
            title: t('loadFailed'),
            query: view.query,
            detail: view.error,
            warnings: view.data ? view.data.warnings : null,
            onRetry: () => run(view.query, false),
          })
        }
        if (view.phase === 'error' || !view.data) {
          return h(ErrorCard, {
            title: t('requestFailed'),
            query: view.query,
            detail: view.error,
            warnings: null,
            onRetry: () => run(view.query, false),
          })
        }

        const data = view.data
        const warnings = listOf(data.warnings)
        const elapsed = num(data.meta ? data.meta.elapsedMs : null)
        return h(
          React.Fragment,
          null,
          warnings.length > 0
            ? h(
                'div',
                { className: 'sa-warn-banner' },
                h('div', { className: 'sa-warn-title' }, t('warnings')),
                h(
                  'ul',
                  { className: 'sa-warn-list' },
                  warnings.map((warning, index) => h('li', { key: index }, String(warning))),
                ),
              )
            : null,
          h(OverviewCard, { data }),
          h('div', { className: 'sa-grid2' }, h(TechnicalCard, { data }), h(FundsCard, { data })),
          h(IndustryCard, { data }),
          h(FinanceCard, { data }),
          h('div', { className: 'sa-grid2' }, h(NewsCard, { data }), h(HotCard, { data })),
          h(AdviceCard, { data }),
          h(
            'footer',
            { className: 'sa-foot' },
            h('div', null, t('footNote')),
            h(
              'div',
              null,
              [
                meta.tradeDate ? `${t('tradeDate')} ${meta.tradeDate}` : null,
                meta.generatedAt ? `${t('updatedAt')} ${dateTimeText(meta.generatedAt)}` : null,
                elapsed === null ? null : `${Math.round(elapsed)} ms`,
              ]
                .filter((part) => part !== null && part !== '')
                .join(' · '),
            ),
          ),
        )
      })()

      return h('div', { className: 'sa-page' }, h('style', null, CSS), h('div', { className: 'sa-inner' }, header, search, recentRow, body))
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        console.warn('[stock-analyzer] panel render failed:', error)
      }

      render() {
        if (this.state.failed) {
          return h(
            'div',
            { className: 'sa-page' },
            h('style', null, CSS),
            h('div', { className: 'sa-placeholder' }, h('div', { className: 'sa-placeholder-title' }, DICT.zh.loadFailed)),
          )
        }
        return this.props.children
      }
    }

    function PanelRoot() {
      return h(Boundary, null, h(Page))
    }

    /* ------------------------------------------------------------ */
    /* 样式（仅使用主题 token）                                       */
    /* ------------------------------------------------------------ */

    const CSS = `
.sa-page{height:100%;overflow-y:auto;overflow-x:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}
.sa-inner{max-width:1120px;margin:0 auto;padding:24px 30px 64px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box;}
.sa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:2px 2px 0;}
.sa-head-main{min-width:0;}
.sa-title{font-size:20px;font-weight:600;letter-spacing:.01em;display:flex;align-items:center;gap:9px;}
.sa-title-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);}
.sa-sub{margin-top:7px;font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;flex-wrap:wrap;gap:5px 12px;align-items:center;}
.sa-src-note{opacity:.9;}
.sa-head-right{flex:none;display:flex;align-items:center;}
.sa-sources{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}
.sa-source{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;color:var(--dsw-alias-label-primary);white-space:nowrap;}
.sa-source-off{color:var(--dsw-alias-label-secondary);opacity:.78;}
.sa-source-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none;}
.sa-source-dot-ok{color:var(--dsw-alias-state-success-primary);}
.sa-source-dot-off{color:var(--dsw-alias-label-secondary);}
.sa-source-state{font-size:10.5px;opacity:.85;}
.sa-search{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.sa-input{flex:1 1 240px;min-width:0;height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;box-sizing:border-box;}
.sa-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent);}
.sa-input::placeholder{color:var(--dsw-alias-label-secondary);}
.sa-input:disabled{opacity:.6;}
.sa-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1;cursor:pointer;text-decoration:none;transition:background .12s ease,border-color .12s ease;font-family:inherit;white-space:nowrap;box-sizing:border-box;}
.sa-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.sa-btn:disabled{opacity:.55;cursor:default;}
.sa-btn-accent{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1));}
.sa-recent{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;}
.sa-recent-label{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.sa-chips{display:flex;flex-wrap:wrap;gap:6px;}
.sa-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid transparent;font-size:11.5px;color:var(--dsw-alias-label-primary);white-space:nowrap;}
.sa-chip-btn{cursor:pointer;font-family:inherit;border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);transition:background .12s ease;}
.sa-chip-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.sa-chip-btn:disabled{opacity:.55;cursor:default;}
.sa-chip-rank{font-size:10px;color:var(--dsw-alias-label-secondary);}
.sa-idle{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:18px;box-sizing:border-box;}
.sa-idle-title{font-size:14px;font-weight:600;}
.sa-idle-hint{font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center;max-width:66ch;line-height:1.65;}
.sa-idle-examples{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:center;margin-top:4px;}
.sa-placeholder{min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:13px;color:var(--dsw-alias-label-secondary);}
.sa-placeholder-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);}
.sa-placeholder-text{font-size:13px;}
.sa-placeholder-sub{font-size:11.5px;opacity:.85;font-variant-numeric:tabular-nums;}
.sa-spinner{width:18px;height:18px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:sa-spin .8s linear infinite;}
.sa-error-card{border:1px solid var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent);border-radius:12px;padding:18px 18px 16px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;}
.sa-error-title{font-size:14px;font-weight:650;color:var(--dsw-alias-state-error-primary);}
.sa-error-query{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.sa-error-detail{font-size:12.5px;line-height:1.62;color:var(--dsw-alias-label-primary);word-break:break-word;}
.sa-error-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6;}
.sa-error-card .sa-btn{align-self:flex-start;margin-top:2px;}
.sa-warn-banner{border:1px solid var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);border-radius:10px;padding:10px 13px;font-size:12px;color:var(--dsw-alias-state-warn-primary);box-sizing:border-box;}
.sa-warn-title{font-weight:600;margin-bottom:4px;}
.sa-warn-list{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:3px;font-size:11.5px;line-height:1.6;}
.sa-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:13px 15px 12px;min-width:0;box-sizing:border-box;}
.sa-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;}
.sa-card-title{font-size:13px;font-weight:600;letter-spacing:.01em;}
.sa-card-note{font-size:11.5px;color:var(--dsw-alias-label-secondary);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sa-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(116px,1fr));gap:9px 16px;}
.sa-field{min-width:0;}
.sa-field-label{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sa-field-value{margin-top:2px;font-size:12.5px;font-weight:550;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sa-ov{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:13px;}
.sa-ov-id{min-width:0;}
.sa-ov-name{font-size:17px;font-weight:650;letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sa-ov-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.sa-ov-price{text-align:right;flex:none;}
.sa-ov-price-value{font-size:26px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums;}
.sa-ov-price-meta{display:flex;justify-content:flex-end;gap:10px;margin-top:4px;font-size:12.5px;font-variant-numeric:tabular-nums;}
.sa-tag{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:5px;font-size:10.5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.sa-tag-strong{color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
.sa-pill{display:inline-flex;align-items:center;height:21px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:600;border:1px solid currentColor;background:var(--dsw-alias-bg-layer-2);white-space:nowrap;}
.sa-pill-lg{height:28px;padding:0 14px;font-size:14px;}
.sa-trend{margin-bottom:11px;}
.sa-trend-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.sa-trend-score{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.sa-trend-text{margin-top:6px;font-size:12px;line-height:1.62;color:var(--dsw-alias-label-secondary);}
.sa-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:2px 16px;margin-bottom:12px;}
.sa-item{display:grid;grid-template-columns:7px auto minmax(0,1fr);align-items:center;gap:7px;height:26px;font-size:12px;min-width:0;}
.sa-item-label{color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.sa-item-value{text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);}
.sa-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none;display:inline-block;}
.sa-levels{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;}
.sa-level{border-radius:9px;background:var(--dsw-alias-bg-layer-2);padding:7px 10px;min-width:0;box-sizing:border-box;}
.sa-level-label{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sa-level-value{margin-top:2px;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sa-bars{display:flex;flex-direction:column;gap:9px;padding-top:2px;margin-bottom:13px;}
.sa-bar-row{display:grid;grid-template-columns:72px 1fr 92px;align-items:center;gap:10px;}
.sa-bar-label{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.sa-bar-track{position:relative;height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;}
.sa-bar-track::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--dsw-alias-border-l2);}
.sa-bar-fill{position:absolute;top:0;bottom:0;border-radius:999px;background:currentColor;opacity:.85;}
.sa-bar-value{font-size:12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.sa-sub-block{margin-top:13px;}
.sa-mini-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0 2px 6px;}
.sa-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.sa-table th{text-align:left;font-weight:500;font-size:11px;color:var(--dsw-alias-label-secondary);padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap;}
.sa-table td{padding:5px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);font-variant-numeric:tabular-nums;}
.sa-table tr:last-child td{border-bottom:none;}
.sa-table .sa-num{text-align:right;}
.sa-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);}
.sa-sublist{display:flex;flex-direction:column;}
.sa-sublist-row{display:flex;align-items:baseline;gap:10px;padding:5px 2px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12.5px;}
.sa-sublist-row:last-child{border-bottom:none;}
.sa-sublist-name{flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sa-sublist-meta{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sa-sublist-pct{flex:none;font-variant-numeric:tabular-nums;}
.sa-sublist-val{flex:none;font-variant-numeric:tabular-nums;text-align:right;}
.sa-news{display:flex;flex-direction:column;}
.sa-news-row{display:flex;align-items:baseline;gap:8px;padding:5px 2px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0;}
.sa-news-row:last-child{border-bottom:none;}
.sa-news-time{flex:none;width:76px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sa-news-kind{flex:none;font-size:10px;padding:1px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}
.sa-news-title{flex:1 1 auto;min-width:0;font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;}
a.sa-news-title:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline;}
.sa-hot-rank{font-size:13px;font-weight:600;color:var(--dsw-alias-brand-primary);margin-bottom:7px;}
.sa-hot-reason{font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-primary);padding:8px 11px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);}
.sa-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;}
.sa-grid2-inner{gap:16px;margin-top:14px;}
.sa-advice-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
.sa-advice-main{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:7px;}
.sa-advice-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.sa-advice-score{font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.sa-advice-action{font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary);}
.sa-advice-action-label{color:var(--dsw-alias-label-secondary);}
.sa-advice-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.sa-advice-meta-label{margin-right:4px;opacity:.8;}
.sa-advice-meta-item{white-space:nowrap;}
.sa-ring{position:relative;width:64px;height:64px;flex:none;}
.sa-ring svg{display:block;}
.sa-ring-track{stroke:var(--dsw-alias-bg-layer-2);}
.sa-ring-fill{stroke:currentColor;transition:stroke-dashoffset .45s ease;}
.sa-ring-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;}
.sa-ring-score{font-size:17px;font-weight:650;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;}
.sa-ring-unit{font-size:9px;color:var(--dsw-alias-label-secondary);margin-top:3px;}
.sa-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:12.5px;line-height:1.6;}
.sa-list li{display:flex;align-items:flex-start;gap:8px;min-width:0;}
.sa-list .sa-dot{margin-top:7px;}
.sa-bullets{margin:2px 0 0;padding-left:16px;display:flex;flex-direction:column;gap:5px;font-size:12.5px;line-height:1.62;}
.sa-bullets li::marker{color:var(--dsw-alias-brand-primary);}
.sa-disclaimer{margin-top:12px;padding-top:9px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6;}
.sa-foot{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6;padding:4px 2px 0;display:flex;flex-direction:column;gap:2px;}
.sa-empty{padding:16px 4px;font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center;}
.sa-up{color:var(--dsw-alias-state-error-primary);}
.sa-down{color:var(--dsw-alias-state-success-primary);}
.sa-flat{color:var(--dsw-alias-label-secondary);}
.sa-warn{color:var(--dsw-alias-state-warn-primary);}
@keyframes sa-spin{to{transform:rotate(360deg);}}
@media (max-width:960px){
  .sa-grid2{grid-template-columns:minmax(0,1fr);}
  .sa-inner{padding:18px 16px 48px;}
  .sa-head{flex-direction:column;}
  .sa-head-right{align-self:flex-start;}
  .sa-news-time{width:64px;}
  .sa-bar-row{grid-template-columns:64px 1fr 84px;}
}
@media (prefers-reduced-motion:reduce){
  .sa-spinner{animation:none;}
  .sa-ring-fill{transition:none;}
}
`

    /* ------------------------------------------------------------ */
    /* 侧边栏图标                                                    */
    /* ------------------------------------------------------------ */

    function StockIcon(props) {
      const size = Number(props && props.size) || 20
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block', opacity: props && props.active ? 1 : 0.82 },
        },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('path', { d: 'M15.6 15.6 21 21' }),
        h('path', { d: 'M7.4 12.1l2.1-2.4 1.9 1.7 2.1-2.6' }),
      )
    }

    /* ------------------------------------------------------------ */
    /* 注册                                                          */
    /* ------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        localeService = ctx.locale ? ctx.locale : null
        try {
          const disposers = [
            ctx.locale.register(NS, 'zh', DICT.zh),
            ctx.locale.register(NS, 'en', DICT.en),
          ]
          ctx.effect(() => () => {
            for (const dispose of disposers) {
              try {
                dispose()
              } catch (error) {
                /* 卸载期忽略 */
              }
            }
          })
          translate = ctx.locale.bind(NS)
        } catch (error) {
          console.warn('[stock-analyzer] locale registration failed:', error)
          translate = (key) => DICT.zh[key] ?? key
        }

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'stock-analyzer' }, PanelRoot),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'stock-analyzer', order: 30, label: () => translate('panel') },
            StockIcon,
          ),
        )
      },
    }
  },
})
