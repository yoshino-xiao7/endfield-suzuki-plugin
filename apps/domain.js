import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'
import Render from '../model/render.js'

export class DomainApp extends plugin {
    constructor() {
        super({
            name: 'Endfield基建',
            dsc: '终末地领地基建查询',
            event: 'message',
            priority: 500,
            rule: [
                { reg: '^#终末地基建$', fnc: 'domain' }
            ]
        })
    }

    async domain(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        try {
            e.reply('⏳ 正在获取领地基建信息...')
            const { data: result } = await api.requestWithAutoRefresh('/skland/endfield/card', 'GET', null, bindingId)

            const img = await Render.renderDomain(result.data)
            e.reply(img)
        } catch (err) {
            if (err.message && (err.message.includes('失效') || err.message.includes('重新绑定'))) {
                e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
            } else {
                e.reply(`❌ 查询失败: ${err.message || '未知错误'}`)
            }
        }
    }
}
