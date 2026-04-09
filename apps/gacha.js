import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'
import Render from '../model/render.js'

// 用于防止同一用户重复发起同步的锁
const _syncLocks = new Map()

export class GachaApp extends plugin {
    constructor() {
        super({
            name: 'Endfield抽卡',
            dsc: '终末地抽卡记录与统计',
            event: 'message',
            priority: 400,
            rule: [
                { reg: '^#终末地同步抽卡$', fnc: 'sync' },
                { reg: '^#终末地抽卡记录(.*)$', fnc: 'records' },
                { reg: '^#终末地角色池记录$', fnc: 'charRecords' },
                { reg: '^#终末地武器池记录$', fnc: 'weaponRecords' },
                { reg: '^#终末地抽卡统计$', fnc: 'stats' }
            ]
        })
    }

    // ========== 同步抽卡记录（异步后台执行） ==========
    async sync(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        // 防止同一用户重复发起同步
        if (_syncLocks.has(e.user_id)) {
            return e.reply('⏳ 你的抽卡记录正在同步中，请耐心等待结果...')
        }

        e.reply('⏳ 已开始后台同步抽卡记录，完成后会自动通知你~')

        // 标记为同步中
        _syncLocks.set(e.user_id, Date.now())

        // 后台异步执行，不阻塞命令返回
        api.requestWithAutoRefresh(
            `/skland/endfield/gacha/sync?bindingId=${bindingId}`, 'POST', null, bindingId, 120000, 2
        ).then(({ data: result }) => {
            const d = result.data || result || {}
            const newCount = d.newRecords ?? d.newCount ?? d.new_count ?? '?'
            const totalCount = d.totalRecords ?? d.totalCount ?? d.total_count ?? '?'
            e.reply(`✅ 同步完成！\n新增 ${newCount} 条记录\n总计 ${totalCount} 条记录`)
        }).catch(err => {
            const msg = err.message || ''
            if (msg.includes('失效') || msg.includes('重新绑定')) {
                e.reply(`❌ ${msg}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else if (msg.includes('524') || msg.includes('超时') || msg.includes('繁忙')) {
                e.reply('❌ 服务器响应超时（524），可能服务器繁忙，请等待1~2分钟后重试\n💡 提示：高峰期同步可能需要多试几次')
            } else {
                e.reply(`❌ 同步失败: ${msg || '未知错误'}`)
            }
        }).finally(() => {
            _syncLocks.delete(e.user_id)
        })
    }

    // ========== 抽卡记录 (全部 / 按池名) ==========
    async records(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        const poolName = e.msg.match(/抽卡记录(.*)$/)?.[1]?.trim()

        try {
            e.reply('⏳ 正在生成抽卡统计...')
            const [poolsRes, recordsRes, cardRes] = await Promise.all([
                api.requestWithAutoRefresh(`/skland/endfield/gacha/pools?bindingId=${bindingId}`, 'GET', null, bindingId),
                api.requestWithAutoRefresh(`/skland/endfield/gacha?bindingId=${bindingId}`, 'GET', null, bindingId),
                api.requestWithAutoRefresh(`/skland/endfield/card?bindingId=${bindingId}`, 'GET', null, bindingId).catch(() => null)
            ])

            let pools = poolsRes.data.data || []
            let records = recordsRes.data.data || []
            const playerInfo = this._extractPlayerInfo(cardRes)

            // 按池名过滤
            if (poolName) {
                const matchedPools = pools.filter(p => p.poolName && p.poolName.includes(poolName))
                if (matchedPools.length === 0) {
                    const names = pools.map(p => p.poolName).filter(Boolean).join('、')
                    return e.reply(`❌ 未找到池: ${poolName}\n可用池: ${names || '暂无'}`)
                }
                const poolIds = new Set(matchedPools.map(p => p.poolId))
                records = records.filter(r => poolIds.has(r.poolId) || matchedPools.some(p => p.poolName === r.poolName))
                pools = matchedPools
            }

            if (records.length === 0) return e.reply('📋 暂无抽卡记录，请先同步: #终末地同步抽卡')

            // 有池名筛选时用紧凑单列模板，否则用全量三列模板
            const img = poolName
                ? await Render.renderGachaPool(records, pools, playerInfo, `${poolName}`)
                : await Render.renderGachaStats(records, pools, playerInfo)
            e.reply(img)
        } catch (err) {
            if (err.message && (err.message.includes('失效') || err.message.includes('重新绑定'))) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 查询失败: ${err.message || '未知错误'}`)
            }
        }
    }

    // ========== 角色池记录 ==========
    async charRecords(e) {
        return this._recordsByType(e, 'char', '角色池')
    }

    // ========== 武器池记录 ==========
    async weaponRecords(e) {
        return this._recordsByType(e, 'weapon', '武器池')
    }

    async _recordsByType(e, poolType, displayName) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        try {
            e.reply(`⏳ 正在生成${displayName}统计...`)
            const [poolsRes, recordsRes, cardRes] = await Promise.all([
                api.requestWithAutoRefresh(`/skland/endfield/gacha/pools?bindingId=${bindingId}`, 'GET', null, bindingId),
                api.requestWithAutoRefresh(`/skland/endfield/gacha?bindingId=${bindingId}&poolType=${poolType}`, 'GET', null, bindingId),
                api.requestWithAutoRefresh(`/skland/endfield/card?bindingId=${bindingId}`, 'GET', null, bindingId).catch(() => null)
            ])

            const pools = (poolsRes.data.data || []).filter(p => p.poolType === poolType)
            const records = recordsRes.data.data || []
            const playerInfo = this._extractPlayerInfo(cardRes)

            if (records.length === 0) return e.reply('📋 暂无记录，请先同步: #终末地同步抽卡')

            const img = await Render.renderGachaPool(records, pools, playerInfo, displayName)
            e.reply(img)
        } catch (err) {
            if (err.message && (err.message.includes('失效') || err.message.includes('重新绑定'))) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 查询失败: ${err.message || '未知错误'}`)
            }
        }
    }

    // ========== 抽卡统计 ==========
    async stats(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        try {
            e.reply('⏳ 正在生成抽卡统计...')
            // 获取池列表、全部记录和玩家信息
            const [poolsRes, recordsRes, cardRes] = await Promise.all([
                api.requestWithAutoRefresh(`/skland/endfield/gacha/pools?bindingId=${bindingId}`, 'GET', null, bindingId),
                api.requestWithAutoRefresh(`/skland/endfield/gacha?bindingId=${bindingId}`, 'GET', null, bindingId),
                api.requestWithAutoRefresh(`/skland/endfield/card?bindingId=${bindingId}`, 'GET', null, bindingId).catch(() => null)
            ])

            const pools = poolsRes.data.data || []
            const records = recordsRes.data.data || []
            const playerInfo = this._extractPlayerInfo(cardRes)

            if (records.length === 0) return e.reply('📋 暂无抽卡记录，请先同步: #终末地同步抽卡')

            const img = await Render.renderGachaStats(records, pools, playerInfo)
            e.reply(img)
        } catch (err) {
            if (err.message && (err.message.includes('失效') || err.message.includes('重新绑定'))) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 统计失败: ${err.message || '未知错误'}`)
            }
        }
    }

    // ========== 提取玩家信息 ==========
    _extractPlayerInfo(cardRes) {
        try {
            if (!cardRes) return {}
            const detail = cardRes.data?.data?.detail || cardRes.data?.detail || {}
            const base = detail.base || {}
            const charList = detail.chars || []

            // 构建角色名 -> 头像 映射
            const charAvatars = {}
            for (const c of charList) {
                if (c.charData && c.charData.name) {
                    charAvatars[c.charData.name] = c.charData.avatarSqUrl || c.charData.avatarRtUrl || ''
                }
            }

            return {
                name: base.name || '',
                uid: base.roleId || '',
                avatar: base.avatarUrl || '',
                charAvatars
            }
        } catch {
            return {}
        }
    }
}
