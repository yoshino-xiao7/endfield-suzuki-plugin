import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'path'
import fs from 'fs'

const PLUGIN_ROOT = path.join(import.meta.dirname, '..')

export default class Render {
    static async renderProfile(data) {
        const cssPath = path.join(PLUGIN_ROOT, 'resources', 'profile.css')
        let cardCss = ''
        try {
            cardCss = fs.readFileSync(cssPath, 'utf8')
        } catch (e) {
            logger.error(`[Endfield] Profile CSS load failed from ${cssPath}:`, e)
            try {
                cardCss = fs.readFileSync(path.join(process.cwd(), 'plugins/endfield-suzuki-plugin/resources/profile.css'), 'utf8')
            } catch (e2) {
                logger.error('[Endfield] Fallback Profile CSS load failed:', e2)
            }
        }

        const base = data.detail.base
        const player = {
            name: base.name,
            uid: base.roleId,
            level: base.level,
            worldLevel: base.worldLevel,
            avatar: Render.resize(base.avatarUrl, 200),
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
        const cssPath = path.join(PLUGIN_ROOT, 'resources', 'character.css')
        let cardCss = ''
        try {
            cardCss = fs.readFileSync(cssPath, 'utf8')
        } catch (e) {
            logger.error(`[Endfield] Character CSS load failed from ${cssPath}:`, e)
            try {
                cardCss = fs.readFileSync(path.join(process.cwd(), 'plugins/endfield-suzuki-plugin/resources/character.css'), 'utf8')
            } catch (e2) {
                logger.error('[Endfield] Fallback Character CSS load failed:', e2)
            }
        }

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
            illustrationUrl: Render.resize(c.illustrationUrl, 1200) || Render.resize(c.avatarRtUrl, 1000),
            avatarRtUrl: Render.resize(c.avatarRtUrl, 800),
            rarity: c.rarity,
            profession: c.profession,
            property: c.property,
            level: charData.level,
            potentialLevel: charData.potentialLevel,
            evolvePhase: charData.evolvePhase,
            weapon: charData.weapon ? {
                name: charData.weapon.weaponData.name,
                icon: Render.resize(charData.weapon.weaponData.iconUrl, 200),
                level: charData.weapon.level,
                refineLevel: charData.weapon.refineLevel
            } : null,
            skills: (c.skills || []).map(s => {
                const userSkill = charData.userSkills ? charData.userSkills[s.id] : null
                return {
                    name: s.name,
                    icon: Render.resize(s.iconUrl, 150),
                    level: userSkill ? userSkill.level : 1
                }
            }),
            equips: ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory', 'tacticalItem'].map(key => {
                if (charData[key]) {
                    const eqData = charData[key].equipData || charData[key].tacticalItemData
                    return {
                        name: eqData.name,
                        icon: Render.resize(eqData.iconUrl, 150),
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

    static resize(url, size = 200) {
        if (!url) return ''
        if (url.includes('x-oss-process')) return url

        // Revert to 's_' as 'w_' caused broken images
        const operator = url.includes('?') ? '&' : '?'
        return `${url}${operator}x-oss-process=image/resize,s_${size}`
    }
}