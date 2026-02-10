import plugin from '../../../lib/plugins/plugin.js'
import api from '../model/api.js'
import data from '../model/data.js'

export class BindApp extends plugin {
    constructor() {
        super({
            name: 'Endfield绑定',
            dsc: '绑定/解绑森空岛账号',
            event: 'message',
            priority: 500,
            rule: [
                { reg: '^#(终末地|endfield)绑定(.+)$', fnc: 'bindToken' },
                { reg: '^#(终末地|endfield)手机绑定(.+)$', fnc: 'bindPhone' },
                { reg: '^#(终末地|endfield)解绑$', fnc: 'unbind' }
            ]
        })
    }

    // ========== Token 绑定 (一步) ==========
    async bindToken(e) {
        const token = e.msg.match(/绑定(.+)$/)?.[1]?.trim()
        if (!token) return e.reply('格式: #终末地绑定 <token>')

        if (e.isGroup) {
            e.reply('⚠️ 请私聊发送，保护您的 Token！')
            try { await e.group.recallMsg(e.message_id) } catch { }
            return
        }

        try {
            const result = await api.bindByToken(token)
            const bindingId = result.data?.id || result.data?.bindingId
            if (!bindingId) throw new Error('未获取到绑定ID')
            data.bind(e.user_id, bindingId)
            e.reply(`✅ 绑定成功！\n\n可用指令:\n#终末地签到\n#终末地角色\n#终末地解绑`)
        } catch (err) {
            e.reply(`❌ 绑定失败: ${err.message}`)
        }
    }

    // ========== 手机验证码绑定 (两步) ==========
    async bindPhone(e) {
        const phone = e.msg.match(/手机绑定(.+)$/)?.[1]?.trim()
        if (!phone || !/^1\d{10}$/.test(phone)) {
            return e.reply('格式: #终末地手机绑定 13800138000')
        }

        if (e.isGroup) {
            e.reply('⚠️ 请私聊发送，保护您的手机号！')
            try { await e.group.recallMsg(e.message_id) } catch { }
            return
        }

        try {
            await api.sendCode(phone)
            // 保存手机号到临时上下文，等待用户回复验证码
            this.setContext('receiveCode', e, { phone }, 120) // 120秒超时
            e.reply('📱 验证码已发送，请在 120 秒内回复 6 位验证码：')
        } catch (err) {
            e.reply(`❌ 发送验证码失败: ${err.message}`)
        }
    }

    // 接收验证码 (多轮对话回调)
    async receiveCode(e) {
        const code = e.msg.trim()
        if (!/^\d{4,6}$/.test(code)) {
            e.reply('❌ 请输入正确的验证码（4-6位数字），或发送 #取消')
            return
        }

        const { phone } = this.getContext('receiveCode', e)
        this.finish('receiveCode', e) // 结束多轮对话

        try {
            const result = await api.bindByCode(phone, code)
            const bindingId = result.data?.id || result.data?.bindingId
            if (!bindingId) throw new Error('未获取到绑定ID')
            data.bind(e.user_id, bindingId)
            e.reply(`✅ 绑定成功！\n\n可用指令:\n#终末地签到\n#终末地角色\n#终末地解绑`)
        } catch (err) {
            e.reply(`❌ 绑定失败: ${err.message}`)
        }
    }

    // ========== 解绑 ==========
    async unbind(e) {
        const bindingId = data.getBindingId(e.user_id)
        if (!bindingId) return e.reply('❌ 您尚未绑定')
        try { await api.unbind(bindingId) } catch { }
        data.unbind(e.user_id)
        e.reply('✅ 已解绑')
    }
}
