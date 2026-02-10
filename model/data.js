import fs from 'fs'
import path from 'path'

// 动态获取插件根目录
const PLUGIN_ROOT = path.join(import.meta.dirname, '..')
const DATA_DIR = path.join(PLUGIN_ROOT, 'data')
const PATH = path.join(DATA_DIR, 'bindings.json')

class DataStore {
    constructor() { this.data = fs.existsSync(PATH) ? JSON.parse(fs.readFileSync(PATH, 'utf8')) : {} }
    save() {
        fs.mkdirSync(DATA_DIR, { recursive: true })
        fs.writeFileSync(PATH, JSON.stringify(this.data, null, 2))
    }
    bind(qq, bindingId) { this.data[qq] = { bindingId, time: Date.now() }; this.save() }
    unbind(qq) { delete this.data[qq]; this.save() }
    getBindingId(qq) { return this.data[qq]?.bindingId || null }
    getAll() { return Object.entries(this.data).map(([qq, v]) => ({ qq, ...v })) }
}

export default new DataStore()
