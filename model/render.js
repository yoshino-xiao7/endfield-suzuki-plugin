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

        // --- 核心修改 1: 先处理所有干员数据，但不立即放入 renderData ---
        let allCharacters = chars.map(c => {
            const char = c.charData || {}
            // const weapon = c.weapon?.weaponData // 未使用，注释掉防lint报错
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
                level: c.level || 1,
                rarity: char.rarity?.value || '5', // 确保有默认值用于排序
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

        // --- 核心修改 2: 排序、计算隐藏数量、截断数据 ---

        // 1. 排序：优先按等级降序，其次按稀有度降序
        // 这样截断时保留的一定是练度最高的干员
        allCharacters.sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            return b.rarity - a.rarity;
        });

        // 2. 设置最大显示数量
        const MAX_DISPLAY_COUNT = 40;
        let totalHiddenCount = 0;
        let displayCharacters = allCharacters;

        // 3. 如果数量超标，进行截断
        if (allCharacters.length > MAX_DISPLAY_COUNT) {
            totalHiddenCount = allCharacters.length - MAX_DISPLAY_COUNT;
            displayCharacters = allCharacters.slice(0, MAX_DISPLAY_COUNT);
        }

        // --- 核心修改结束 ---

        // formatting data for easy access in template
        const renderData = {
            player: {
                name: base.name,
                uid: base.roleId,
                level: base.level,
                worldLevel: base.worldLevel,
                avatar: base.avatarUrl || 'https://bbs.hycdn.cn/image/2026/01/20/b0a40f991c7cd755b7273c6b5579f09f.png',
                charNum: base.charNum,
                updateTime: formatTime(Date.now())
            },
            characters: displayCharacters, // 使用截断后的数组
            totalHiddenCount: totalHiddenCount // 传递隐藏数量给 HTML
        }

        // Read CSS file
        const cssPath = path.join(PLUGIN_ROOT, 'resources', 'style.css')
        let css = ''
        try {
            css = fs.readFileSync(cssPath, 'utf8')
            // logger.info(`[Endfield] Injected CSS length: ${css.length}`)
        } catch (err) {
            logger.error('[Endfield] Failed to load style.css')
        }

        // Generate Image using Yunzai puppeteer
        const img = await puppeteer.screenshot('endfield-suzuki-plugin', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'card.html'),
            saveId: 'card',
            imgType: 'jpeg',
            quality: 90,
            cardCss: css,
            ...renderData
        })

        return img
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}