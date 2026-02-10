import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'

export class CardApp extends plugin {
    constructor() {
        super({
            name: 'Endfield角色',
            dsc: '终末地角色信息查询',
            event: 'message',
            priority: 500,
            rule: [
                { reg: '^#(终末地|endfield)(角色|卡片)$', fnc: 'card' }
            ]
        })
    }

    async card(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        try {
            const { data: result, refreshed } = await api.requestWithAutoRefresh('/skland/endfield/card')
            const card = result.data

            let msg = '🎮 终末地角色信息\n'
            if (card.nickname) msg += `👤 昵称: ${card.nickname}\n`
            if (card.level) msg += `📊 等级: ${card.level}\n`
            if (card.uid) msg += `🆔 UID: ${card.uid}\n`
            // 根据实际返回字段扩展更多信息
            if (refreshed) msg += '\n⚠️ 凭证已自动刷新'

            e.reply(msg)
        } catch (err) {
            if (err.message.includes('失效') || err.message.includes('重新绑定')) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 查询失败: ${err.message}`)
            }
        }
    }
}
