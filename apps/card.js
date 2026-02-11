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
                { reg: '^#终末地信息$', fnc: 'profile' },
                { reg: '^#终末地角色.*$', fnc: 'card' }
            ]
        })
    }

    /**
     * User Profile Card
     */
    async profile(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        try {
            e.reply('⏳ 正在获取终末地信息...')
            const { data: result } = await api.requestWithAutoRefresh(`/skland/endfield/card?bindingId=${bindingId}`, 'GET', null, bindingId)

            // Render Profile Image
            const img = await Render.renderProfile(result.data)
            e.reply(img)
        } catch (err) {
            this.handleError(e, err)
        }
    }

    /**
     * Character Detail Card
     */
    async card(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 请先绑定: 私聊发送 #终末地绑定 <token>')

        // Parse character name
        let name = e.msg.replace(/^#终末地角色/, '').trim()
        if (!name) {
            return e.reply('❌ 请指定角色名称，例如：#终末地角色 佩丽卡')
        }

        try {
            e.reply(`⏳ 正在获取 ${name} 的信息...`)
            const { data: result } = await api.requestWithAutoRefresh(`/skland/endfield/card?bindingId=${bindingId}`, 'GET', null, bindingId)

            // Render Character Image
            const img = await Render.renderCharacter(result.data, name)
            e.reply(img)

        } catch (err) {
            this.handleError(e, err)
        }
    }

    handleError(e, err) {
        if (err.message && (err.message.includes('失效') || err.message.includes('重新绑定'))) {
            e.reply(`❌ ${err.message}\n请私聊发送 #终末地绑定 <新token> 重新绑定`)
        } else {
            e.reply(`❌ 查询失败: ${err.message || '未知错误'}`)
        }
    }
}
