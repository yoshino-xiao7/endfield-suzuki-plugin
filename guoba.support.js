import path from 'path'
import YAML from 'yaml'
import fs from 'fs'

export function supportGuoba() {
    return {
        pluginInfo: {
            name: 'endfield-plugin',
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
                { field: 'autoSignCron', label: '签到时间(Cron)', bottomHelpMessage: '默认每天 08:05', component: 'Input' }
            ],
            getConfigData() {
                const defPath = path.join(process.cwd(), 'plugins/endfield-plugin/defSet/config.yaml')
                const cfgPath = path.join(process.cwd(), 'plugins/endfield-plugin/config/config.yaml')
                const def = YAML.parse(fs.readFileSync(defPath, 'utf8'))
                let cfg = {}
                if (fs.existsSync(cfgPath)) cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8')) || {}
                return { ...def, ...cfg }
            },
            setConfigData(data, { Result }) {
                const cfgPath = path.join(process.cwd(), 'plugins/endfield-plugin/config/config.yaml')
                fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
                fs.writeFileSync(cfgPath, YAML.stringify(data))
                return Result.ok({}, '保存成功，重启生效')
            }
        }
    }
}
