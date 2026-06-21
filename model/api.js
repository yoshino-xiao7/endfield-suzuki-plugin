import fetch from 'node-fetch'
import YAML from 'yaml'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 动态获取插件根目录
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const USER_CFG = path.join(PLUGIN_ROOT, 'config/config.yaml')
const DEF_CFG = path.join(PLUGIN_ROOT, 'defSet/config.yaml')

class EndfieldApi {
    constructor() {
        // 防止同一 bindingId 并发刷新凭证的锁
        this._refreshLocks = new Map()
    }

    get config() {
        const def = YAML.parse(fs.readFileSync(DEF_CFG, 'utf8'))
        let user = {}
        if (fs.existsSync(USER_CFG)) {
            user = YAML.parse(fs.readFileSync(USER_CFG, 'utf8')) || {}
        }
        return { ...def, ...user }
    }

    get apiKey() { return this.config.apiKey }
    get baseUrl() { return this.config.apiBaseUrl }
    get wikiBaseUrl() {
        const base = String(this.baseUrl || '').replace(/\/+$/, '')
        return base.endsWith('/endfield/wiki') ? base : `${base}/endfield/wiki`
    }

    /**
     * 可重试的 HTTP 状态码（均为瞬态 / 网关超时错误）
     */
    static RETRYABLE_STATUS = new Set([502, 503, 504, 524])

    async request(reqPath, method = 'GET', body = null, timeout = 15000, maxRetries = 0) {
        if (!this.apiKey) throw new Error('未配置 API Key，请联系管理员')
        const url = `${this.baseUrl}${reqPath}`

        let lastErr
        const attempts = 1 + maxRetries  // 首次 + 重试次数

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : null,
                    timeout
                })

                if (!res.ok) {
                    let errMsg = `HTTP ${res.status}`
                    try {
                        const errData = await res.json()
                        errMsg = errData.message || errData.msg || JSON.stringify(errData)
                    } catch { }

                    // 可重试的瞬态错误
                    if (EndfieldApi.RETRYABLE_STATUS.has(res.status) && attempt < attempts) {
                        const delay = Math.min(2000 * attempt, 10000) // 2s, 4s, 6s ... 最长 10s
                        logger.warn(`[Endfield] ${method} ${reqPath} => HTTP ${res.status}，第 ${attempt}/${attempts} 次，${delay}ms 后重试...`)
                        await new Promise(r => setTimeout(r, delay))
                        lastErr = new Error(errMsg)
                        continue
                    }

                    throw new Error(errMsg)
                }

                const data = await res.json()
                if (attempt > 1) {
                    logger.info(`[Endfield] ${method} ${reqPath} => 第 ${attempt} 次尝试成功`)
                }
                logger.info(`[Endfield] ${method} ${reqPath} => ${JSON.stringify(data)}`)

                if (data.code !== 200 || data.success === false) {
                    throw new Error(data.message || '请求失败')
                }
                return data
            } catch (fetchErr) {
                // node-fetch 超时抛出的是 AbortError / FetchError
                const isTimeout = fetchErr.type === 'request-timeout' || fetchErr.name === 'AbortError'
                    || (fetchErr.message && fetchErr.message.includes('timeout'))

                if (isTimeout && attempt < attempts) {
                    const delay = Math.min(3000 * attempt, 15000)
                    logger.warn(`[Endfield] ${method} ${reqPath} => 请求超时，第 ${attempt}/${attempts} 次，${delay}ms 后重试...`)
                    await new Promise(r => setTimeout(r, delay))
                    lastErr = fetchErr
                    continue
                }

                throw fetchErr
            }
        }

        // 所有重试都失败了
        throw lastErr || new Error('请求失败，所有重试均已耗尽')
    }

    buildQuery(params = {}) {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null || value === '') continue
            query.set(key, Array.isArray(value) ? value.join(',') : String(value))
        }
        const text = query.toString()
        return text ? `?${text}` : ''
    }

    async wikiRequest(reqPath, params = {}, timeout = 15000) {
        const pathWithQuery = `${reqPath}${this.buildQuery(params)}`
        const url = `${this.wikiBaseUrl}${pathWithQuery}`
        const headers = { 'Content-Type': 'application/json' }
        if (this.apiKey) headers['X-API-Key'] = this.apiKey

        const res = await fetch(url, { method: 'GET', headers, timeout })
        if (!res.ok) {
            let errMsg = `HTTP ${res.status}`
            try {
                const errData = await res.json()
                errMsg = errData.message || errData.msg || JSON.stringify(errData)
            } catch { }
            throw new Error(errMsg)
        }

        const data = await res.json()
        logger.info(`[Endfield Wiki] GET ${pathWithQuery} => ${data.code}`)
        if (data.code !== 200 || data.success === false) {
            throw new Error(data.message || 'Wiki 请求失败')
        }
        return data
    }

    getWikiHome() { return this.wikiRequest('/home') }
    getWikiSidebar() { return this.wikiRequest('/sidebar') }
    getWikiCategories(catalogId) { return this.wikiRequest('/categories', { catalogId }) }
    getWikiFilters(params = {}) { return this.wikiRequest('/filters', params) }
    getWikiItems(params = {}) { return this.wikiRequest('/items/page', params) }
    searchWiki(keyword, page = 1, size = 10, timeout = 15000) { return this.wikiRequest('/search', { keyword, page, size }, timeout) }
    getWikiItemDetail(itemId, timeout = 15000) { return this.wikiRequest('/item/detail', { itemId }, timeout) }

    getWikiMediaProxyUrl(url) {
        if (!url || typeof url !== 'string') return url
        try {
            const parsed = new URL(url)
            if (parsed.protocol === 'https:' && parsed.hostname === 'bbs.hycdn.cn') {
                return `${this.wikiBaseUrl}/media/proxy?url=${encodeURIComponent(url)}`
            }
        } catch { }
        return url
    }

    getWikiItemImage(item) {
        const image = this.findFirstImageUrl(item)
        return image ? this.getWikiMediaProxyUrl(image) : ''
    }

    findFirstImageUrl(value, seen = new Set()) {
        if (!value) return ''
        if (typeof value === 'string') {
            return /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value) || value.includes('bbs.hycdn.cn')
                ? value
                : ''
        }
        if (typeof value !== 'object') return ''
        if (seen.has(value)) return ''
        seen.add(value)

        const preferredKeys = ['cover', 'image', 'icon', 'avatar', 'avatarUrl', 'avatarSqUrl', 'avatarRtUrl', 'illustrationUrl', 'pic', 'mobilePic']
        for (const key of preferredKeys) {
            const found = this.findFirstImageUrl(value[key], seen)
            if (found) return found
        }
        for (const child of Object.values(value)) {
            const found = this.findFirstImageUrl(child, seen)
            if (found) return found
        }
        return ''
    }

    // ===== 绑定 =====
    bindByToken(token) { return this.request('/skland/bind/token', 'POST', { token }) }
    sendCode(phone) { return this.request('/skland/send-code', 'POST', { phone }) }
    bindByCode(phone, code) { return this.request('/skland/bind/code', 'POST', { phone, code }) }

    // ===== 操作（都需要 bindingId） =====
    getBindings() { return this.request('/skland/bindings') }
    signin(bindingId) { return this.request(`/skland/bindings/${bindingId}/signin`, 'POST') }
    unbind(bindingId) { return this.request(`/skland/bindings/${bindingId}`, 'DELETE') }
    getCard(bindingId) { return this.request(`/skland/endfield/card?bindingId=${bindingId}`) }

    // ===== 抽卡 =====
    syncGacha(bindingId) { return this.request(`/skland/endfield/gacha/sync?bindingId=${bindingId}`, 'POST', null, 120000, 2) }
    getGacha(bindingId, poolType, poolId) {
        let url = `/skland/endfield/gacha?bindingId=${bindingId}`
        if (poolType) url += `&poolType=${poolType}`
        if (poolId) url += `&poolId=${encodeURIComponent(poolId)}`
        return this.request(url)
    }
    getGachaPools(bindingId) { return this.request(`/skland/endfield/gacha/pools?bindingId=${bindingId}`) }

    // ===== 凭证维护（必须传 bindingId，否则会刷新所有用户） =====
    refreshCred(bindingId) { return this.request(`/skland/refresh?bindingId=${bindingId}`, 'POST') }

    /**
     * 带自动刷新的请求封装 + 防并发刷新
     *
     * 流程:
     *   1. 发起请求
     *   2. 如果 401/403/10001 → 刷新凭证 → 重试
     *   3. 同一 bindingId 的并发刷新共享 Promise，避免竞态覆盖 cred
     *
     * @param {string} reqPath - 请求路径
     * @param {string} method - HTTP 方法
     * @param {object|null} body - 请求体
     * @param {string|number|null} bindingId - 绑定ID，用于刷新凭证
     * @returns {{ data, refreshed: boolean }}
     */
    async requestWithAutoRefresh(reqPath, method = 'GET', body = null, bindingId = null, timeout = 15000, maxRetries = 0) {
        try {
            const data = await this.request(reqPath, method, body, timeout, maxRetries)
            return { data, refreshed: false }
        } catch (err) {
            const msg = err.message || ''

            // 业务错误（重复签到等）不刷新
            if (msg.includes('重复') || msg.includes('已签') || msg.includes('请勿')) {
                throw err
            }

            // 524 超时 — 给用户友好提示
            if (msg.includes('524')) {
                throw new Error('服务器繁忙（524超时），请稍后重试')
            }

            // 凭证过期: 403 / Unauthorized / 10001 / 请求异常
            const needRefresh = msg.includes('403') || msg.includes('Unauthorized')
                || msg.includes('10001') || msg.includes('请求异常')

            if (needRefresh) {
                if (!bindingId) throw err

                // 防并发: 如果此 bindingId 已在刷新中，等待它完成
                if (this._refreshLocks.has(bindingId)) {
                    logger.info(`[Endfield] bindingId=${bindingId} 凭证刷新中，等待...`)
                    try { await this._refreshLocks.get(bindingId) } catch { }
                } else {
                    // 新建刷新任务并注册
                    const p = this.refreshCred(bindingId)
                        .finally(() => this._refreshLocks.delete(bindingId))
                    this._refreshLocks.set(bindingId, p)
                    try {
                        await p
                    } catch (refreshErr) {
                        throw new Error(`凭证已失效，请重新绑定 (${refreshErr.message})`)
                    }
                }

                // 刷新完成，重试
                try {
                    const data = await this.request(reqPath, method, body, timeout, maxRetries)
                    return { data, refreshed: true }
                } catch (retryErr) {
                    throw new Error(`凭证已失效，请重新绑定 (${retryErr.message})`)
                }
            }

            throw err
        }
    }
}

export default new EndfieldApi()
