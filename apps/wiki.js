import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'fs'
import os from 'os'
import path from 'path'
import api from '../model/api.js'
import Render from '../model/render.js'
import { extractWikiMedia, parseWikiOperator } from '../model/wiki.js'

const WIKI_COMMAND_PATTERN = '#(?:终末地|endfield)\\s*(?:百科|[wW][iI][kK][iI]|图鉴)'
const WIKI_PREFIX_RE = /^#(?:终末地|endfield)\s*(?:百科|wiki|图鉴)/i
const WIKI_DETAIL_PREFIX_RE = /^#(?:终末地|endfield)\s*(?:百科|wiki|图鉴)\s*(?:详情|详细|条目)/i
const WIKI_SEARCH_PREFIX_RE = /^#(?:终末地|endfield)\s*(?:百科|wiki|图鉴)\s*(?:搜索|查询)/i
const WIKI_VOICE_PREFIX_RE = /^#(?:终末地|endfield)\s*(?:百科|wiki|图鉴)\s*(?:语音|音频)/i
const WIKI_VIDEO_PREFIX_RE = /^#(?:终末地|endfield)\s*(?:百科|wiki|图鉴)\s*(?:mv|视频|演示)/i
const WIKI_MEDIA_DIR = path.join(os.tmpdir(), 'endfield-wiki-media')

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
                { reg: `${WIKI_COMMAND_PATTERN}\\s*(?:语音|音频)\\s*(.+)$`, fnc: 'voice' },
                { reg: `${WIKI_COMMAND_PATTERN}\\s*(?:[mM][vV]|视频|演示)\\s*(.+)$`, fnc: 'video' },
                { reg: `${WIKI_COMMAND_PATTERN}\\s*(?:详情|详细|条目)\\s*(.+)$`, fnc: 'detail' },
                { reg: `${WIKI_COMMAND_PATTERN}\\s*(?:目录|分类)$`, fnc: 'sidebar' },
                { reg: `${WIKI_COMMAND_PATTERN}\\s*(?:搜索|查询)\\s*(.+)$`, fnc: 'search' },
                { reg: `${WIKI_COMMAND_PATTERN}\\s*$`, fnc: 'index' },
                { reg: `${WIKI_COMMAND_PATTERN}(?!\\s*(?:详情|详细|条目|目录|分类|搜索|查询|语音|音频|[mM][vV]|视频|演示))\\s*(.+)$`, fnc: 'search' }
            ]
        })
    }

    async index(e) {
        return this.sidebar(e)
    }

    async search(e) {
        const keyword = e.msg
            .replace(WIKI_SEARCH_PREFIX_RE, '')
            .replace(WIKI_PREFIX_RE, '')
            .trim()
        if (!keyword) return this.index(e)

        try {
            await e.reply(`⏳ 正在检索 Wiki：${keyword}`)
            const res = await api.searchWiki(keyword, 1, 6)
            const page = res.data || {}
            const list = page.list || []

            if (list.length === 0) {
                return await e.reply(`❌ Wiki 中没有找到「${keyword}」`)
            }

            const exact = list.find(item => item.name === keyword) || (list.length === 1 ? list[0] : null)
            const forceList = WIKI_SEARCH_PREFIX_RE.test(e.msg)
            if (exact && !forceList) {
                return this.replyDetail(e, exact.id || exact.officialItemId, true)
            }

            const img = await Render.renderWikiList(list, {
                keyword,
                total: page.total || list.length,
                page: page.page || 1,
                size: page.size || 6
            })
            await e.reply(img)
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async voice(e) {
        const raw = e.msg.replace(WIKI_VOICE_PREFIX_RE, '').trim()
        if (!raw) return e.reply('❌ 请指定干员名称，例如：#终末地wiki语音 弭弗')

        try {
            const { query, language } = this.parseMediaQuery(raw)
            await e.reply(`⏳ 正在解析 ${query} 的 Wiki 语音...`)
            const item = await this.resolveDetail(query)
            const media = extractWikiMedia(item)
            const voices = this.filterVoices(media.voices, language)
            if (voices.length === 0) return e.reply(`❌ 没有找到 ${item.name || query} 的语音文件`)

            const label = language && language !== '全部' ? `${language}语音` : '语音'
            await this.downloadAndSendMedia(e, item.name || query, voices, label)
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async video(e) {
        const query = e.msg.replace(WIKI_VIDEO_PREFIX_RE, '').trim()
        if (!query) return e.reply('❌ 请指定干员名称，例如：#终末地wiki mv 弭弗')

        try {
            await e.reply(`⏳ 正在解析 ${query} 的 Wiki MV/演示资源...`)
            const item = await this.resolveDetail(query)
            const media = extractWikiMedia(item)
            if (media.videos.length > 0) {
                return this.downloadAndSendMedia(e, item.name || query, media.videos, 'MV')
            }

            if (media.videoLinks.length > 0) {
                const lines = [`📺 ${item.name || query} 暂无可直接下载的视频文件，找到以下官方链接：`]
                media.videoLinks.slice(0, 8).forEach((link, index) => {
                    lines.push(`${index + 1}. ${link.title || link.widgetTitle || '视频'}：${link.url}`)
                })
                return e.reply(lines.join('\n'))
            }

            return e.reply(`❌ 没有找到 ${item.name || query} 的 MV/演示资源`)
        } catch (err) {
            this.handleError(e, err)
        }
    }

    async detail(e) {
        const query = e.msg.replace(WIKI_DETAIL_PREFIX_RE, '').trim()
        if (!query) return e.reply('❌ 请指定条目 ID 或名称，例如：#终末地wiki详情 洛茜')

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

            lines.push('\n查询：#终末地wiki <关键词>（或 #终末地百科 <关键词>）')
            lines.push('详情：#终末地wiki详情 <条目ID或名称>')
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
            const operator = parseWikiOperator(item)
            const img = operator
                ? await Render.renderWikiOperator(operator)
                : await Render.renderWikiDetail(item, filters)
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
            lines.push(`   详情：#终末地wiki详情 ${id}`)
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

    parseMediaQuery(raw) {
        const parts = String(raw || '').trim().split(/\s+/).filter(Boolean)
        const aliases = {
            中: '中文',
            中文: '中文',
            cn: '中文',
            CN: '中文',
            英: '英语',
            英语: '英语',
            en: '英语',
            EN: '英语',
            日: '日语',
            日语: '日语',
            jp: '日语',
            JP: '日语',
            ja: '日语',
            JA: '日语',
            韩: '韩语',
            韩语: '韩语',
            kr: '韩语',
            KR: '韩语',
            ko: '韩语',
            KO: '韩语',
            全部: '全部',
            all: '全部',
            ALL: '全部'
        }
        const last = parts.at(-1)
        const language = aliases[last]
        const query = language ? parts.slice(0, -1).join(' ') : parts.join(' ')
        return { query: query || raw, language }
    }

    filterVoices(voices, language) {
        if (!Array.isArray(voices) || voices.length === 0) return []
        if (language === '全部') return voices

        const target = language || '中文'
        const filtered = voices.filter(voice => String(voice.language || '').includes(target))
        return filtered.length > 0 ? filtered : voices
    }

    safeFileName(value) {
        return String(value || 'media')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80) || 'media'
    }

    async downloadAndSendMedia(e, itemName, mediaList, label) {
        const safeName = this.safeFileName(itemName)
        const safeLabel = this.safeFileName(label)
        const dir = path.join(WIKI_MEDIA_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        fs.mkdirSync(dir, { recursive: true })

        await e.reply(`📦 找到 ${mediaList.length} 个${safeLabel}文件，开始下载并发送...`)
        let sent = 0
        let failed = 0

        for (let index = 0; index < mediaList.length; index++) {
            const media = mediaList[index]
            const ext = media.extension || 'dat'
            const fileName = `${safeName}-${safeLabel}${String(index + 1).padStart(2, '0')}.${ext}`
            const filePath = path.join(dir, fileName)
            try {
                await this.downloadMedia(media.url, filePath)
                await this.sendLocalFile(e, filePath, fileName, media.type)
                sent++
            } catch (err) {
                failed++
                logger.warn(`[Endfield Wiki] 发送媒体失败 ${fileName}: ${err.message}`)
            }
        }

        await e.reply(`✅ ${safeName}${safeLabel}发送完成：成功 ${sent}，失败 ${failed}`)
    }

    async downloadMedia(url, filePath) {
        const urls = [...new Set([url, api.getWikiMediaProxyUrl(url)].filter(Boolean))]
        let lastErr
        for (const target of urls) {
            try {
                const res = await fetch(target, { timeout: 120000 })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const buffer = Buffer.from(await res.arrayBuffer())
                fs.writeFileSync(filePath, buffer)
                return
            } catch (err) {
                lastErr = err
            }
        }
        throw lastErr || new Error('下载失败')
    }

    async sendLocalFile(e, filePath, fileName, mediaType = '') {
        const errors = []
        const bot = globalThis.Bot
        const target = e.group_id ? bot?.pickGroup?.(e.group_id) : bot?.pickUser?.(e.user_id)

        const attempts = []
        if (e.group_id && target?.fs?.upload) {
            attempts.push(() => target.fs.upload(filePath, '/', fileName))
            attempts.push(() => target.fs.upload(filePath, fileName))
            attempts.push(() => target.fs.upload(filePath))
        }
        if (!e.group_id && target?.sendFile) {
            attempts.push(() => target.sendFile(filePath, fileName))
            attempts.push(() => target.sendFile(filePath))
        }
        attempts.push(() => e.reply([{ type: 'file', data: { file: filePath, name: fileName } }]))
        attempts.push(() => e.reply([{ type: 'file', data: { file: `file://${filePath}`, name: fileName } }]))
        if (mediaType === 'audio') {
            attempts.push(() => e.reply([{ type: 'record', data: { file: filePath } }]))
        }

        for (const attempt of attempts) {
            try {
                await attempt()
                return
            } catch (err) {
                errors.push(err.message)
            }
        }
        throw new Error(errors.filter(Boolean).join('；') || '当前适配器不支持发送文件')
    }

    handleError(e, err) {
        e.reply(`❌ Wiki 查询失败: ${err.message || '未知错误'}`)
    }
}
