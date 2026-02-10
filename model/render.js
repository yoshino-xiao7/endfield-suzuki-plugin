import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'path'
import fs from 'fs'

const PLUGIN_ROOT = path.join(import.meta.dirname, '..')

export default class Render {
    /**
     * Render character data to image
     * @param {Object} data - The data object containing character info
     * @returns {Promise<string>} - The base64 image or segment
     */
    static async render(data) {
        // Prepare data for rendering
        const detail = data.detail || {}
        const base = detail.base || {}
        const chars = detail.chars || []

        // Sort characters: sort logic can be added here if needed, currently using API order
        // formatting data for easy access in template
        const renderData = {
            player: {
                name: base.name,
                uid: base.roleId,
                level: base.level,
                worldLevel: base.worldLevel,
                avatar: base.avatarUrl || 'https://bbs.hycdn.cn/image/2026/01/20/b0a40f991c7cd755b7273c6b5579f09f.png', // Default or from API
                charNum: base.charNum,
                updateTime: formatTime(Date.now())
            },
            characters: chars.map(c => {
                const char = c.charData
                const equip = c.weapon?.weaponData

                return {
                    name: char.name,
                    level: c.level,
                    rarity: char.rarity?.value || '5', // Assuming typical rarity values
                    profession: char.profession?.value || '',
                    property: char.property?.value || '',
                    avatar: char.avatarSqUrl || char.avatarRtUrl, // Prefer square avatar
                    weapon: {
                        name: equip?.name || '未知武器',
                        icon: equip?.iconUrl,
                        level: c.weapon?.level
                    },
                    tags: char.tags || []
                }
            })
        }

        // Generate HTML
        const html = generateHtml(renderData)

        // Generate Image using Yunzai puppeteer
        // Note: 'endfield-suzuki-plugin' is the name of the plugin folder for resource lookup
        const img = await puppeteer.screenshot('endfield-suzuki-plugin', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'card.html'), // We are injecting HTML content directly, but standard usage might require a file. 
            // However, Yunzai puppeteer usually takes 'html' param or 'tplFile'.
            // Let's rely on creating a temporary HTML file or using the `html` content directly if supported, 
            // OR standardized approach: save specific data to pass to a template file. 
            // Yunzai's puppeteer works best with passing data to an art-template file.
            // Since we wanted to avoid template engines complexity for now, let's write the HTML string to a file and render that? 
            // BETTER: Yunzai puppeteer supports `html` parameter for direct HTML string content?
            // Checking standard Yunzai puppeteer usage: usually `puppeteer.screenshot("name", data)`. 
            // It looks for /resources/name/html.html.

            // Re-evaluating strategy: 
            // To be robust and use standard Yunzai method, let's just make the `generateHtml` function produce the FULL HTML string,
            // and maybe we can pass it. 
            // BUT, writing a custom render method using `puppeteer.screenshot` often requires `tplFile` or standard folder structure.

            // Let's try passing the HTML content directly via a custom saving mechanism if `puppeteer` allows, 
            // OR easier: just use the generated HTML string and let puppeteer render it via `page.setContent`.
            // Yunzai's `puppeteer.screenshot` wrapper is opinionated.

            // Alternative: Write the HTML to a temp file in resources and point to it.
            // OR: Use the `saveHtml` param if available.

            // Let's stick to the simplest: We have `generateHtml` return the exact HTML. 
            // We can use a trick: standard `puppeteer` class in Yunzai might not expose `setContent` easily via `screenshot`.
            // Let's look at `puppeteer.js` source if we could... but we can't assume access to it.
            // Standard approach:
            // 1. Create `resources/card.html` which is an `art-template` or `ejs` template.
            // 2. Pass `renderData` to `puppeteer.screenshot`.

            // Since I promised to generate HTML in JS to avoid template dependency issues (if `art-template` isn't installed? it usually is in Yunzai),
            // I will actually implement `generateHtml` to return the full HTML string, 
            // and I will save it to `data/temp.html` and render that URL maybe? No, file protocol issues.

            // Let's go with the `art-template` approach as it is standard in Yunzai.
            // I will create `resources/card.html` as an art-template entry.
            // And use `puppeteer.screenshot` passing order data.

            saveId: 'card',
            imgType: 'jpeg',
            quality: 90,
            ...renderData
        })

        return img
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function generateHtml(data) {
    // This function is now creating the data structure for the template, mostly done above `renderData`.
    // The actual HTML structure will be in `resources/card.html` using art-template syntax.
    return data
}
