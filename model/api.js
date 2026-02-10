import fetch from 'node-fetch'
import YAML from 'yaml'
import fs from 'fs'
import path from 'path'

// 动态获取插件根目录，无论文件夹叫什么名字都能正常工作
const PLUGIN_ROOT = path.join(import.meta.dirname, '..')
const USER_CFG = path.join(PLUGIN_ROOT, 'config/config.yaml')
const DEF_CFG = path.join(PLUGIN_ROOT, 'defSet/config.yaml')

class EndfieldApi {
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

    async request(path, method = 'GET', body = null) {
        if (!this.apiKey) throw new Error('未配置 API Key，请联系管理员')
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null,
            timeout: 15000
        })
        const data = await res.json()
        if (data.code !== 200) throw new Error(data.message || '请求失败')
        return data
    }

    // ===== 绑定 =====
    bindByToken(token) { return this.request('/skland/bind/token', 'POST', { token }) }
    sendCode(phone) { return this.request('/skland/send-code', 'POST', { phone }) }
    bindByCode(phone, code) { return this.request('/skland/bind/code', 'POST', { phone, code }) }
    // ===== 操作 =====
    getBindings() { return this.request('/skland/bindings') }
    signin(bindingId) { return this.request(`/skland/bindings/${bindingId}/signin`, 'POST') }
    unbind(bindingId) { return this.request(`/skland/bindings/${bindingId}`, 'DELETE') }
    getCard() { return this.request('/skland/endfield/card') }
    // ===== 凭证维护 =====
    refreshCred() { return this.request('/skland/refresh', 'POST') }

    /**
     * 带自动刷新凭证的请求封装
     * 如果返回 403/10001 (凭证过期)，自动刷新并重试一次
     * @returns {{ data, refreshed, refreshFailed }}
     */
    async requestWithAutoRefresh(path, method = 'GET', body = null) {
        try {
            const data = await this.request(path, method, body)
            return { data, refreshed: false }
        } catch (err) {
            // 先排除业务错误（如重复签到），它们的 message 里也可能包含 10001
            const msg = err.message || ''
            if (msg.includes('重复') || msg.includes('已签') || msg.includes('请勿')) {
                throw err // 业务错误，不要尝试刷新凭证
            }
            // 判断是否为凭证过期 (403 / 10001 / Unauthorized)
            if (msg.includes('403') || msg.includes('Unauthorized') || msg.includes('10001')) {
                try {
                    await this.refreshCred()
                    const data = await this.request(path, method, body)
                    return { data, refreshed: true } // 刷新成功并重试成功
                } catch (retryErr) {
                    // 刷新失败或重试失败 → Token 可能已失效
                    throw new Error(`凭证已失效且无法自动恢复，请重新绑定 (${retryErr.message})`)
                }
            }
            throw err // 其他错误原样抛出
        }
    }
}

export default new EndfieldApi()
