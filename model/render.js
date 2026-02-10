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
                const char = c.charData || {}
                const weapon = c.weapon?.weaponData
                const evolvePhase = c.evolvePhase || 0

                // Process Skills
                const skillList = (char.skills || []).map(skill => {
                    const userSkill = (c.userSkills || {})[skill.id] || {}
                    return {
                        name: skill.name,
                        icon: skill.iconUrl,
                        type: skill.type?.value, // e.g. "普通攻击", "战技"
                        level: userSkill.level || 1,
                        maxLevel: userSkill.maxLevel || '?'
                    }
                })

                // Process Weapon
                let weaponData = null
                if (c.weapon) {
                    const wd = c.weapon.weaponData
                    if (wd) {
                        weaponData = {
                            name: wd.name,
                            icon: wd.iconUrl,
                            rarity: wd.rarity?.value,
                            level: c.weapon.level
                        }
                    }
                }

                // Process Other Equipment
                const otherEquips = [
                    c.bodyEquip,
                    c.armEquip,
                    c.firstAccessory,
                    c.secondAccessory,
                    c.tacticalItem
                ].map(eq => {
                    if (!eq) return null
                    const data = eq.equipData || eq.tacticalItemData

                    // Determine level
                    let level = 1
                    if (eq.level) {
                        level = eq.level // Weapon or top-level level
                    } else if (data && data.level && data.level.value) {
                        level = data.level.value // Equipment inner level object
                    } else if (eq.activeEffect) {
                        level = '' // Tactical item usually doesn't show level like others
                    }

                    return data ? {
                        name: data.name,
                        icon: data.iconUrl,
                        rarity: data.rarity?.value,
                        level: level
                    } : null
                }).filter(Boolean)

                return {
                    name: char.name,
                    level: c.level,
                    rarity: char.rarity?.value || '5',
                    profession: char.profession?.value || '',
                    property: char.property?.value || '',
                    avatar: char.avatarSqUrl || char.avatarRtUrl,
                    potential: c.potentialLevel || 0,
                    evolvePhase,
                    weapon: weaponData,
                    equips: otherEquips,
                    skills: skillList,
                    tags: char.tags || []
                }
            })
        }

        // Generate HTML
        const html = generateHtml(renderData)

        // Read CSS file to inject directly
        const cssPath = path.join(PLUGIN_ROOT, 'resources', 'style.css')
        const css = fs.readFileSync(cssPath, 'utf8')

        // Generate Image using Yunzai puppeteer
        const img = await puppeteer.screenshot('endfield-suzuki-plugin', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'card.html'),
            saveId: 'card',
            imgType: 'jpeg',
            quality: 90,
            style: css,
            ...renderData
        })

        // DEBUG: Save debug files
        fs.writeFileSync(path.join(PLUGIN_ROOT, 'debug_card.html'), JSON.stringify(html, null, 2) || 'No HTML gen?') // generateHtml returns renderData, template does HTML
        // Wait, generateHtml returned DATA, not HTML string. The logic above usage was confusing.
        // But we can check if `img` is valid.
        if (img) {
            // img is base64 or segment. 
            // If it's a segment object, it might be { type: 'image', file: ... } 
            // Yunzai puppeteer.screenshot usually returns a segment object for direct reply
            // OR a base64 string if configured?
            // Let's log the type.
            logger.info(`[Endfield] Generated image type: ${typeof img}`)
            if (typeof img === 'object') logger.info(`[Endfield] Image msg: ${JSON.stringify(img).slice(0, 100)}`)
        } else {
            logger.error('[Endfield] Generated image is Empty!')
        }

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
