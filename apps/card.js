import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'
import Render from '../model/render.js'

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
            e.reply('⏳ 正在获取终末地数据...')
            const { data: result } = await api.requestWithAutoRefresh('/skland/endfield/card')

            // Render image
            const img = await Render.render(result.data)
            e.reply(img)

        } catch (err) {
            if (err.message.includes('失效') || err.message.includes('重新绑定')) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 查询失败: ${err.message}`)
            }
        }
    }
}
