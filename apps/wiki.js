import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import Render from '../model/render.js'

const WIKI_PREFIX_RE = /^#(?:终末地|endfield)(?:百科|wiki|Wiki|图鉴)/

function stripHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

function compactText(value, maxLength = 80) {
    const text = stripHtml(value).replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function displaySimpleValue(value) {
    if (value === undefined || value === null || value === '') return ''
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'string') {
        if (/^https?:\/\//i.test(value)) return ''
        return compactText(value, 120)
    }
    if (Array.isArray(value)) {
        return value.map(v => displaySimpleValue(v)).filter(Boolean).slice(0, 5).join(' / ')
    }
    if (typeof value === 'object') {
        for (const key of ['value', 'name', 'title', 'text', 'description', 'desc']) {
            const text = displaySimpleValue(value[key])
            if (text) return text
        }
    }
    return ''
}

function collectRows(value, limit = 6) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const rows = []
    const skipKeys = new Set(['id', 'cover', 'image', 'icon', 'avatar', 'avatarUrl', 'avatarSqUrl', 'avatarRtUrl', 'illustrationUrl', 'createdAt', 'updatedAt', 'detailData', 'chapters', 'widgets'])

    for (const [key, child] of Object.entries(value)) {
        if (rows.length >= limit) break
        if (skipKeys.has(key) || key.toLowerCase().includes('url')) continue
        const valueText = displaySimpleValue(child)
        if (valueText) rows.push({ label: key, value: valueText })
    }
    return rows
}

function normalizeTagIds(tagIds) {
    if (!tagIds) return []
    if (Array.isArray(tagIds)) return tagIds.map(String).filter(Boolean)
    if (typeof tagIds === 'string') return tagIds.split(',').map(s => s.trim()).filter(Boolean)
    if (typeof tagIds === 'object') return Object.values(tagIds).flat().map(String).filter(Boolean)
    return []
}

function formatTime(value) {
    if (!value) return ''
    const date = typeof value === 'number'
        ? new Date(value > 1000000000000 ? value : value * 1000)
        : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export class WikiApp extends plugin {
    constructor() {
        super({
            name: 'Endfield百科',
            dsc: '终末地 Wiki 百科查询',
            event: 'message',
            priority: 450,
            rule: [
                { reg: '^#(?:终末地|endfield)(?:百科|wiki|Wiki|图鉴)(?:详情|条目)\\s*(.+)$', fnc: 'detail' },
                { reg: '^#(?:终末地|endfield)(?:百科|wiki|Wiki|图鉴)(?:目录|分类)$', fnc: 'sidebar' },
                { reg: '^#(?:终末地|endfield)(?:百科|wiki|Wiki|图鉴)\\s*(.*)$', fnc: 'search' }
            ]
        })
    }

    async search(e) {
        const keyword = e.msg.replace(WIKI_PREFIX_RE, '').trim()
        if (!keyword) return this.sidebar(e)

        try {
            await e.reply(`⏳ 正在检索 Wiki：${keyword}`)
            const res = await api.searchWiki(keyword, 1, 8)
            const page = res.data || {}
            const list = page.list || []

            if (list.length === 0) {
                return await e.reply(`❌ Wiki 中没有找到「${keyword}」`)
            }

            const exact = list.find(item => item.name === keyword) || (list.length === 1 ? list[0] : null)
            if (exact) {
                return this.replyDetail(e, exact.id || exact.officialItemId, true)
            }

            await e.reply(this.formatSearchResult(keyword, list, page))
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async detail(e) {
        const query = e.msg
            .replace(/^#(?:终末地|endfield)(?:百科|wiki|Wiki|图鉴)(?:详情|条目)/, '')
            .trim()
        if (!query) return e.reply('❌ 请指定条目 ID 或名称，例如：#终末地百科详情 洛茜')

        try {
            await e.reply(`⏳ 正在获取 Wiki 详情：${query}`)
            await this.replyDetail(e, query, true)
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async sidebar(e) {
        try {
            await e.reply('⏳ 正在获取 Wiki 目录...')
            const res = await api.getWikiSidebar()
            const catalogs = res.data || []
            const lines = ['📚 终末地 Wiki 目录']

            for (const catalog of catalogs) {
                lines.push(`\n【${catalog.name}】`)
                const categories = catalog.typeSub || []
                for (const category of categories.slice(0, 20)) {
                    lines.push(`- ${category.name}（ID: ${category.id}）`)
                }
                if (categories.length > 20) lines.push(`- ... 还有 ${categories.length - 20} 个分类`)
            }

            lines.push('\n查询：#终末地百科 <关键词>')
            lines.push('详情：#终末地百科详情 <条目ID或名称>')
            await e.reply(lines.join('\n'))
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async replyDetail(e, query, suppressLoading = false) {
        if (!suppressLoading) await e.reply(`⏳ 正在获取 Wiki 详情：${query}`)
        const item = await this.resolveDetail(query)
        const filters = await this.getFilters(item.categoryId || item.subTypeId)
        try {
            const img = await Render.renderWikiDetail(item, filters)
            await e.reply(img)
        } catch (err) {
            logger.warn(`[Endfield Wiki] 详情图片发送失败: ${err.message}`)
            await e.reply(this.formatDetail(item, filters))
        }
    }

    async resolveDetail(query) {
        try {
            const res = await api.getWikiItemDetail(query)
            return res.data
        } catch (detailErr) {
            const searchRes = await api.searchWiki(query, 1, 5)
            const list = searchRes.data?.list || []
            const matched = list.find(item => item.name === query) || list.find(item => item.name?.includes(query)) || list[0]
            if (!matched) throw detailErr

            const res = await api.getWikiItemDetail(matched.id || matched.officialItemId)
            return res.data
        }
    }

    async getFilters(categoryId) {
        if (!categoryId) return []
        try {
            const res = await api.getWikiFilters({ categoryId })
            return res.data || []
        } catch (err) {
            logger.warn(`[Endfield Wiki] 获取筛选标签失败: ${err.message}`)
            return []
        }
    }

    formatSearchResult(keyword, list, page = {}) {
        const total = page.total || list.length
        const lines = [`📚 Wiki 搜索：${keyword}`, `共 ${total} 条，显示前 ${list.length} 条`]

        list.forEach((item, index) => {
            const id = item.id || item.officialItemId || ''
            const desc = this.getSummary(item, 72)
            lines.push(`\n${index + 1}. ${item.name || '未命名条目'}（ID: ${id}）`)
            if (desc) lines.push(`   ${desc}`)
            lines.push(`   详情：#终末地百科详情 ${id}`)
        })

        return lines.join('\n')
    }

    formatDetail(item, filters = []) {
        const filterMap = new Map(filters.map(f => [String(f.tagId), f.name]))
        const tags = normalizeTagIds(item.tagIds)
            .map(tag => filterMap.get(String(tag)) || String(tag))
            .filter(Boolean)
            .slice(0, 8)
        const rows = [
            ...collectRows(item.briefData, 6),
            ...collectRows(item.caption, 4)
        ].slice(0, 10)
        const image = api.getWikiItemImage(item)

        const lines = [`📖 ${item.name || 'Wiki 条目'}`]
        lines.push(`ID：${item.id || item.officialItemId || '-'}`)
        if (item.categoryId || item.subTypeId) lines.push(`分类：${item.categoryId || item.subTypeId}`)
        if (item.updatedAt || item.publishedAt) lines.push(`更新：${formatTime(item.updatedAt || item.publishedAt)}`)
        if (tags.length) lines.push(`标签：${tags.join('、')}`)
        if (image) lines.push(`图片：${image}`)
        if (rows.length) {
            lines.push('\n【资料】')
            rows.forEach(row => lines.push(`${row.label}：${compactText(row.value, 90)}`))
        } else {
            const summary = this.getSummary(item, 180)
            if (summary) lines.push(`简介：${summary}`)
        }
        return lines.join('\n')
    }

    getSummary(item, maxLength = 80) {
        const caption = displaySimpleValue(item.caption?.title)
            || displaySimpleValue(item.caption?.desc)
            || displaySimpleValue(item.caption?.description)
            || displaySimpleValue(item.caption)
        if (caption) return compactText(caption, maxLength)

        const rows = collectRows(item.briefData, 3)
        if (rows.length) {
            return compactText(rows.map(row => `${row.label}: ${row.value}`).join(' · '), maxLength)
        }
        return item.hasDetail ? '已同步详情' : '暂无详情'
    }

    handleError(e, err) {
        e.reply(`❌ Wiki 查询失败: ${err.message || '未知错误'}`)
    }
}
