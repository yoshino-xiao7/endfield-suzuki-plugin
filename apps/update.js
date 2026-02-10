import plugin from '../../../lib/plugins/plugin.js'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_ROOT = path.resolve(__dirname, '..')

export class UpdateApp extends plugin {
    constructor() {
        super({
            name: 'Endfield更新',
            dsc: '插件更新（仅管理员）',
            event: 'message',
            priority: 500,
            rule: [
                { reg: '^#(终末地|endfield)(插件)?更新$', fnc: 'update', permission: 'master' },
                { reg: '^#(终末地|endfield)(插件)?强制更新$', fnc: 'forceUpdate', permission: 'master' }
            ]
        })
    }

    async update(e) {
        e.reply('🔄 正在更新插件...')
        try {
            const result = execSync('git pull', { cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 30000 })
            if (result.includes('Already up to date') || result.includes('已经是最新')) {
                e.reply('✅ 当前已是最新版本')
            } else {
                e.reply(`✅ 更新成功！\n${result.trim()}\n\n请发送 #重启 使更新生效`)
            }
        } catch (err) {
            e.reply(`❌ 更新失败: ${err.message}\n可尝试 #终末地强制更新`)
        }
    }

    async forceUpdate(e) {
        e.reply('🔄 正在强制更新插件...')
        try {
            execSync('git fetch --all', { cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 30000 })
            const result = execSync('git reset --hard origin/main', { cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 30000 })
            e.reply(`✅ 强制更新成功！\n${result.trim()}\n\n⚠️ 本地修改已被覆盖\n请发送 #重启 使更新生效`)
        } catch (err) {
            e.reply(`❌ 强制更新失败: ${err.message}`)
        }
    }
}
