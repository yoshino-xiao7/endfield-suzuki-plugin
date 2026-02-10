import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'

export class ReminderApp extends plugin {
    constructor() {
        super({
            name: 'Endfield提醒',
            dsc: '终末地理智/每日任务提醒',
            event: 'message',
            priority: 500,
            rule: []
        })

        // 每日 21:00 检查每日任务
        this.task = {
            cron: '0 0 21 * * ?',
            name: 'Endfield每日任务提醒',
            fnc: () => this.checkDaily()
        }

        // 每 30 分钟检查理智 (用 setInterval，因为 this.task 只能有一个)
        this._staminaTimer = setInterval(() => this.checkStamina(), 30 * 60 * 1000)
        // 启动后 2 分钟先检查一次
        setTimeout(() => this.checkStamina(), 2 * 60 * 1000)
    }

    /**
     * 理智检查 — 每 30 分钟执行
     * 当用户理智 >= 阈值时私聊提醒
     */
    async checkStamina() {
        const all = data.getAll()
        if (all.length === 0) return

        const threshold = api.config.staminaThreshold || 240
        logger.info(`[Endfield] 理智检查: ${all.length} 人, 阈值: ${threshold}`)

        for (const { qq, bindingId } of all) {
            try {
                const { data: result } = await api.requestWithAutoRefresh('/skland/endfield/card')
                const dungeon = result.data?.detail?.dungeon
                if (!dungeon) continue

                const cur = parseInt(dungeon.curStamina) || 0
                const max = parseInt(dungeon.maxStamina) || 0

                if (cur >= threshold) {
                    const msg = `⚡ 终末地理智提醒\n\n你的理智已达到 ${cur}/${max}，即将溢出！\n请及时消耗理智。`
                    logger.info(`[Endfield] 理智提醒: QQ=${qq}, 理智=${cur}/${max}`)
                    Bot.pickUser(qq).sendMsg(msg)
                }
            } catch (err) {
                logger.warn(`[Endfield] 理智检查失败 QQ=${qq}: ${err.message}`)
            }
            // 每个用户之间间隔 5 秒，避免请求过快
            await new Promise(r => setTimeout(r, 5000))
        }
    }

    /**
     * 每日任务检查 — 每天 21:00 执行
     * 当用户每日任务未完成时私聊提醒
     */
    async checkDaily() {
        const all = data.getAll()
        if (all.length === 0) return

        logger.info(`[Endfield] 每日任务检查: ${all.length} 人`)

        for (const { qq, bindingId } of all) {
            try {
                const { data: result } = await api.requestWithAutoRefresh('/skland/endfield/card')
                const daily = result.data?.detail?.dailyMission
                if (!daily) continue

                const cur = daily.dailyActivation || 0
                const max = daily.maxDailyActivation || 100

                if (cur < max) {
                    const msg = `📋 终末地每日任务提醒\n\n今日每日任务尚未完成！\n当前进度: ${cur}/${max}\n记得完成每日任务哦~`
                    logger.info(`[Endfield] 每日提醒: QQ=${qq}, 进度=${cur}/${max}`)
                    Bot.pickUser(qq).sendMsg(msg)
                }
            } catch (err) {
                logger.warn(`[Endfield] 每日检查失败 QQ=${qq}: ${err.message}`)
            }
            await new Promise(r => setTimeout(r, 5000))
        }
    }
}
