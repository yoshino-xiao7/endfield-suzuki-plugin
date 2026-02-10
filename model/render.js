import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Compatible way to get plugin root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_ROOT = path.resolve(__dirname, '..')

function loadCss(filename) {
    // Try absolute path first
    const absPath = path.join(PLUGIN_ROOT, 'resources', filename)
    try {
        return fs.readFileSync(absPath, 'utf8')
    } catch (e) {
        logger.error(`[Endfield] CSS load failed from ${absPath}:`, e.message)
    }
    // Fallback: relative to Yunzai cwd
    const cwdPath = path.join(process.cwd(), 'plugins', 'endfield-suzuki-plugin', 'resources', filename)
    try {
        return fs.readFileSync(cwdPath, 'utf8')
    } catch (e2) {
        logger.error(`[Endfield] Fallback CSS load also failed from ${cwdPath}:`, e2.message)
    }
    return ''
}

export default class Render {
    static async renderProfile(data) {
        const cardCss = loadCss('profile.css')

        const base = data.detail.base
        const player = {
            name: base.name,
            uid: base.roleId,
            level: base.level,
            worldLevel: base.worldLevel,
            avatar: base.avatarUrl || '',
            charNum: base.charNum,
            weaponNum: base.weaponNum,
            docNum: base.docNum,
            progress: base.mainMission.description,
            days: Math.ceil((Date.now() / 1000 - base.createTime) / 86400)
        }

        return await puppeteer.screenshot('endfield-profile', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'profile.html'),
            cardCss,
            player
        })
    }

    static async renderCharacter(data, charName) {
        const cardCss = loadCss('character.css')

        // Find character
        const charList = data.detail.chars || []
        const charData = charList.find(c => c.charData.name === charName || c.charData.name.includes(charName))

        if (!charData) {
            throw new Error(`未找到角色: ${charName}`)
        }

        const c = charData.charData
        // Format Data
        const character = {
            name: c.name,
            illustrationUrl: c.illustrationUrl || c.avatarRtUrl || '',
            avatarRtUrl: c.avatarRtUrl || '',
            rarity: c.rarity,
            profession: c.profession,
            property: c.property,
            level: charData.level,
            potentialLevel: charData.potentialLevel,
            evolvePhase: charData.evolvePhase,
            weapon: charData.weapon ? {
                name: charData.weapon.weaponData.name,
                icon: charData.weapon.weaponData.iconUrl || '',
                level: charData.weapon.level,
                refineLevel: charData.weapon.refineLevel
            } : null,
            skills: (c.skills || []).map(s => {
                const userSkill = charData.userSkills ? charData.userSkills[s.id] : null
                return {
                    name: s.name,
                    icon: s.iconUrl || '',
                    level: userSkill ? userSkill.level : 1
                }
            }),
            equips: ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory', 'tacticalItem'].map(key => {
                if (charData[key]) {
                    const eqData = charData[key].equipData || charData[key].tacticalItemData
                    return {
                        name: eqData.name,
                        icon: eqData.iconUrl || '',
                        level: charData[key].evolvePhase !== undefined ? charData[key].evolvePhase : (charData[key].level && charData[key].level.value ? charData[key].level.value : '?')
                    }
                }
                return null
            })
        }

        return await puppeteer.screenshot('endfield-character', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'character.html'),
            cardCss,
            character
        })
    }
}