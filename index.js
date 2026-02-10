import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const apps = {}
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appDir = path.join(__dirname, 'apps')

const files = fs.readdirSync(appDir).filter(f => f.endsWith('.js'))
for (const file of files) {
    const module = await import(`./apps/${file}`)
    for (const [key, value] of Object.entries(module)) {
        apps[key] = value
    }
}

export { apps }
