import plugin from '../../../lib/plugins/plugin.js'

export class HelpApp extends plugin {
    constructor() {
        super({
            name: 'Endfield帮助',
            dsc: '终末地帮助指令',
            event: 'message',
            priority: 500,
            rule: [
                { reg: '^#终末地帮助$', fnc: 'help' }
            ]
        })
    }

    async help(e) {
        const msg = `📖 终末地助手 · 指令帮助

📌 账号绑定
  #终末地绑定 <token>　Token绑定(私聊)
  #终末地手机绑定 <手机号>　手机绑定(私聊)
  #终末地解绑　　解除绑定

📋 签到
  #终末地签到　　手动签到
  #终末地刷新　　刷新凭证

🔍 信息查询
  #终末地信息　　玩家资料卡
  #终末地角色 <名称>　角色详情卡
  #终末地帝江号　帝江号基建
  #终末地基建　　领地基建

⚡ 自动提醒
  理智提醒　每30分钟检查(≥240提醒)
  每日任务　每天21:00检查

🔧 管理员
  #终末地更新　　更新插件
  #终末地强制更新　强制更新

Powered by Endfield Suzuki Plugin`

        e.reply(msg)
    }
}
