import path from 'path'
import YAML from 'yaml'
import fs from 'fs'
import { fileURLToPath } from 'url'

// 动态获取插件根目录
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_ROOT = __dirname

export function supportGuoba() {
    const defPath = path.join(PLUGIN_ROOT, 'defSet/config.yaml')
    const cfgPath = path.join(PLUGIN_ROOT, 'config/config.yaml')

    return {
        pluginInfo: {
            name: 'endfield-suzuki-plugin',
            title: 'Endfield 终末地助手',
            author: 'Suzuki',
            authorLink: 'https://endfield.suzuki.ink',
            link: '',
            isV3: true,
            isV2: false,
            description: '终末地签到、角色查询',
            icon: 'mdi:robot-outline',
            iconColor: '#7c4dff'
        },
        configInfo: {
            schemas: [
                { field: 'apiKey', label: 'API Key', bottomHelpMessage: '在 Endfield Cloud 后台生成', component: 'Input', required: true },
                { field: 'apiBaseUrl', label: 'API 地址', bottomHelpMessage: '默认 https://api.suzuki.ink/api', component: 'Input' },
                { field: 'autoSignEnabled', label: '自动签到', component: 'Switch' },
                { field: 'autoSignTime', label: '签到时间', bottomHelpMessage: '格式 HH:MM，如 08:05 表示每天早上 8 点 5 分', component: 'Input', componentProps: { placeholder: '08:05' } },
                { field: 'staminaThreshold', label: '理智提醒阈值', bottomHelpMessage: '理智达到此值时私聊提醒，默认 240', component: 'InputNumber', componentProps: { min: 1, max: 999, placeholder: '240' } }
            ],
            getConfigData() {
                const def = YAML.parse(fs.readFileSync(defPath, 'utf8'))
                let cfg = {}
                if (fs.existsSync(cfgPath)) cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8')) || {}
                return { ...def, ...cfg }
            },
            setConfigData(data, { Result }) {
                fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
                fs.writeFileSync(cfgPath, YAML.stringify(data))
                return Result.ok({}, '保存成功，重启生效')
            }
        }
    }
}
