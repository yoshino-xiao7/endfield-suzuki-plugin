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
            logger.error('[Endfield] Profile CSS load failed:', e)
        }

        const base = data.detail.base
        const player = {
            name: base.name,
            uid: base.roleId,
            level: base.level,
            worldLevel: base.worldLevel,
            avatar: Render.resize(base.avatarUrl, 150),
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
            logger.error('[Endfield] Character CSS load failed:', e)
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
            illustrationUrl: Render.resize(c.illustrationUrl, 1000) || Render.resize(c.avatarRtUrl, 800),
            avatarRtUrl: Render.resize(c.avatarRtUrl, 600),
            rarity: c.rarity,
            profession: c.profession,
            property: c.property,
            level: charData.level,
            potentialLevel: charData.potentialLevel,
            evolvePhase: charData.evolvePhase,
            weapon: charData.weapon ? {
                name: charData.weapon.weaponData.name,
                icon: Render.resize(charData.weapon.weaponData.iconUrl, 120),
                level: charData.weapon.level,
                refineLevel: charData.weapon.refineLevel
            } : null,
            skills: (c.skills || []).map(s => {
                const userSkill = charData.userSkills ? charData.userSkills[s.id] : null
                return {
                    name: s.name,
                    icon: Render.resize(s.iconUrl, 100),
                    level: userSkill ? userSkill.level : 1
                }
            }),
            equips: ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory', 'tacticalItem'].map(key => {
                if (charData[key]) {
                    const eqData = charData[key].equipData || charData[key].tacticalItemData
                    return {
                        name: eqData.name,
                        icon: Render.resize(eqData.iconUrl, 120),
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

    static resize(url, size = 100) {
        if (!url) return ''
        if (url.includes('x-oss-process')) return url
        return `${url}?x-oss-process=image/resize,s_${size}`
    }
}