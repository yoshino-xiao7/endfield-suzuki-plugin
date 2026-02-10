import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'

/**
 * 将 HH:MM 格式的时间转换为 Cron 表达式
 * @param {string} time - 时间字符串，格式为 HH:MM，如 '08:05'
 * @returns {string} Cron 表达式
 */
function timeToCron(time) {
    const match = time?.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return '0 5 8 * * ?' // 解析失败则使用默认 08:05
    const [, hour, minute] = match
    return `0 ${parseInt(minute)} ${parseInt(hour)} * * ?`
}

export class SigninApp extends plugin {
    constructor() {
        super({
            name: 'Endfield签到',
            event: 'message',
            priority: 500,
            rule: [
                { reg: '^#(终末地|endfield)签到$', fnc: 'signin' },
                { reg: '^#(终末地|endfield)刷新$', fnc: 'refresh' }
            ]
        })
        // 自动签到定时任务 (从 HH:MM 格式的 autoSignTime 转换为 Cron)
        this.task = {
            cron: timeToCron(api.config.autoSignTime),
            name: 'Endfield自动签到',
            fnc: () => this.autoSignAll()
        }
    }

    async signin(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        try {
            // 使用自动刷新封装，凭证过期时自动重试
            const { data: result, refreshed } = await api.requestWithAutoRefresh(
                `/skland/bindings/${bindingId}/signin`, 'POST'
            )

            // 后端对重复签到也返回 code:200，需要通过 message/data 判断
            const signinData = result.data
            if (typeof signinData === 'string' || result.message?.includes('已签到')) {
                return e.reply('📋 今日已签到')
            }

            let msg = '✅ 签到成功！'

            // 解析签到奖励: awardIds + resourceInfoMap
            if (signinData?.awardIds && signinData?.resourceInfoMap) {
                const awards = signinData.awardIds
                    .map(a => signinData.resourceInfoMap[a.id])
                    .filter(Boolean)
                    .map(item => `${item.name} ×${item.count}`)
                if (awards.length > 0) {
                    msg += `\n🎁 获得: ${awards.join('、')}`
                }
            }

            if (refreshed) msg += '\n⚠️ 凭证已自动刷新'
            e.reply(msg)
        } catch (err) {
            if (err.message.includes('重复') || err.message.includes('已签') || err.message.includes('请勿')) {
                e.reply('📋 今日已签到')
            } else if (err.message.includes('失效') || err.message.includes('重新绑定')) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 签到失败: ${err.message}`)
            }
        }
    }

    // ========== 手动刷新凭证 ==========
    async refresh(e) {
        try {
            await api.refreshCred()
            e.reply('✅ 凭证刷新成功！')
        } catch (err) {
            e.reply(`❌ 刷新失败: ${err.message}\n如果持续失败，请重新绑定`)
        }
    }

    async autoSignAll() {
        if (!api.config.autoSignEnabled) return
        const all = data.getAll()
        logger.info(`[Endfield] 自动签到: ${all.length} 人`)
        for (const { qq, bindingId } of all) {
            try {
                const { data: result, refreshed } = await api.requestWithAutoRefresh(
                    `/skland/bindings/${bindingId}/signin`, 'POST'
                )

                const signinData = result.data
                // 重复签到检测（后端返回 code:200 但 data 为字符串）
                if (typeof signinData === 'string' || result.message?.includes('已签到')) {
                    logger.info(`[Endfield] 📋 QQ=${qq}: 今日已签到`)
                    Bot.pickUser(qq).sendMsg('📋 终末地自动签到: 今日已签到')
                } else {
                    // 签到成功，解析奖励
                    let msg = '✅ 终末地自动签到成功！'
                    if (signinData?.awardIds && signinData?.resourceInfoMap) {
                        const awards = signinData.awardIds
                            .map(a => signinData.resourceInfoMap[a.id])
                            .filter(Boolean)
                            .map(item => `${item.name} ×${item.count}`)
                        if (awards.length > 0) {
                            msg += `\n🎁 获得: ${awards.join('、')}`
                        }
                    }
                    if (refreshed) msg += '\n⚠️ 凭证已自动刷新'
                    logger.info(`[Endfield] ✅ QQ=${qq}${refreshed ? ' (凭证已刷新)' : ''}`)
                    Bot.pickUser(qq).sendMsg(msg)
                }
            } catch (err) {
                logger.warn(`[Endfield] ❌ QQ=${qq}: ${err.message}`)
                if (err.message.includes('失效') || err.message.includes('重新绑定')) {
                    Bot.pickUser(qq).sendMsg('❌ 终末地自动签到失败: 凭证已失效，请私聊发送 #终末地绑定 <新token> 重新绑定')
                } else {
                    Bot.pickUser(qq).sendMsg(`❌ 终末地自动签到失败: ${err.message}`)
                }
            }
            await new Promise(r => setTimeout(r, 5000))
        }
    }
}
