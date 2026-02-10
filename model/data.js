import fs from 'fs'
const PATH = './plugins/endfield-plugin/data/bindings.json'

class DataStore {
    constructor() { this.data = fs.existsSync(PATH) ? JSON.parse(fs.readFileSync(PATH, 'utf8')) : {} }
    save() {
        fs.mkdirSync('./plugins/endfield-plugin/data', { recursive: true })
        fs.writeFileSync(PATH, JSON.stringify(this.data, null, 2))
    }
    bind(qq, bindingId) { this.data[qq] = { bindingId, time: Date.now() }; this.save() }
    unbind(qq) { delete this.data[qq]; this.save() }
    getBindingId(qq) { return this.data[qq]?.bindingId || null }
    getAll() { return Object.entries(this.data).map(([qq, v]) => ({ qq, ...v })) }
}

export default new DataStore()
