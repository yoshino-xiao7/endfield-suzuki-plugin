import fs from 'fs'
import path from 'path'

const apps = {}
const appDir = path.join(import.meta.dirname, 'apps')

const files = fs.readdirSync(appDir).filter(f => f.endsWith('.js'))
for (const file of files) {
    const module = await import(`./apps/${file}`)
    for (const [key, value] of Object.entries(module)) {
        apps[key] = value
    }
}

export { apps }
