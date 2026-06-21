import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import Render from '../model/render.js'

const WIKI_PREFIX_RE = /^#(?:终末地|endfield)(?:百科|wiki|Wiki|图鉴)/

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
            e.reply(`⏳ 正在检索 Wiki：${keyword}`)
            const res = await api.searchWiki(keyword, 1, 8)
            const page = res.data || {}
            const list = page.list || []

            if (list.length === 0) {
                return e.reply(`❌ Wiki 中没有找到「${keyword}」`)
            }

            const exact = list.find(item => item.name === keyword) || (list.length === 1 ? list[0] : null)
            if (exact) {
                return this.replyDetail(e, exact.id || exact.officialItemId, true)
            }

            const img = await Render.renderWikiList(list, {
                keyword,
                total: page.total || list.length,
                page: page.page || 1,
                size: page.size || 8
            })
            e.reply(img)
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
            e.reply(`⏳ 正在获取 Wiki 详情：${query}`)
            await this.replyDetail(e, query, true)
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async sidebar(e) {
        try {
            e.reply('⏳ 正在获取 Wiki 目录...')
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
            e.reply(lines.join('\n'))
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async replyDetail(e, query, suppressLoading = false) {
        if (!suppressLoading) e.reply(`⏳ 正在获取 Wiki 详情：${query}`)
        const item = await this.resolveDetail(query)
        const filters = await this.getFilters(item.categoryId || item.subTypeId)
        const img = await Render.renderWikiDetail(item, filters)
        e.reply(img)
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

    handleError(e, err) {
        e.reply(`❌ Wiki 查询失败: ${err.message || '未知错误'}`)
    }
}
