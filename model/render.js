import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'path'
import { fileURLToPath } from 'url'

// Compatible way to get plugin root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_ROOT = path.resolve(__dirname, '..')

export default class Render {
    static async renderProfile(data) {
        const base = data.detail.base
        const dungeon = data.detail.dungeon || {}
        const dailyMission = data.detail.dailyMission || {}
        const player = {
            name: base.name,
            uid: base.roleId,
            level: base.level,
            worldLevel: base.worldLevel,
            avatar: base.avatarUrl || '',
            charNum: base.charNum,
            weaponNum: base.weaponNum,
            stamina: `${dungeon.curStamina || 0}/${dungeon.maxStamina || 0}`,
            dailyMission: `${dailyMission.dailyActivation || 0}/${dailyMission.maxDailyActivation || 100}`,
            progress: base.mainMission.description,
            days: Math.ceil((Date.now() / 1000 - base.createTime) / 86400)
        }

        return await puppeteer.screenshot('endfield-profile', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'profile.html'),
            player
        })
    }

    static async renderCharacter(data, charName) {
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
            character
        })
    }

    static async renderSpaceship(data) {
        const base = data.detail.base
        const ship = data.detail.spaceShip || {}
        const charList = data.detail.chars || []

        // 房间类型映射
        const ROOM_NAMES = {
            0: '总控中枢',
            1: '培养仓',
            2: '制造仓',
            3: '会客厅',
            5: '线索交换'
        }

        // 房间 ID 后缀映射编号
        const getRoomDisplayName = (room) => {
            const baseName = ROOM_NAMES[room.type] || `房间(${room.type})`
            // 如果 id 有 _1, _2 后缀就加编号
            const match = room.id.match(/_(\d+)$/)
            if (match && (room.type === 1 || room.type === 2)) {
                return `${baseName}${match[1]}`
            }
            return baseName
        }

        // 通过 charId 查找角色名称和头像
        const resolveChar = (charId) => {
            for (const c of charList) {
                // charId 可能是 hash，尝试匹配
                if (c.charData && (c.charId === charId || c.charData.id === charId)) {
                    return {
                        name: c.charData.name,
                        avatar: c.charData.avatarUrl || c.charData.avatarRtUrl || ''
                    }
                }
            }
            return { name: charId.substring(0, 8) + '...', avatar: '' }
        }

        const rooms = (ship.rooms || []).map(room => ({
            name: getRoomDisplayName(room),
            level: room.level,
            chars: (room.chars || []).map(ch => {
                const resolved = resolveChar(ch.charId)
                return {
                    name: resolved.name,
                    avatar: resolved.avatar,
                    favorability: ch.favorability || 0
                }
            })
        }))

        return await puppeteer.screenshot('endfield-spaceship', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'spaceship.html'),
            playerName: base.name,
            rooms
        })
    }

    static async renderDomain(data) {
        const base = data.detail.base
        const domainList = data.detail.domain || []
        const charList = data.detail.chars || []

        // 通过 charId 查找角色名称
        const resolveCharName = (charId) => {
            if (!charId || charId === '0') return null
            for (const c of charList) {
                if (c.charData && (c.charId === charId || c.charData.id === charId)) {
                    return c.charData.name
                }
            }
            return charId.substring(0, 8) + '...'
        }

        const domains = domainList.map(dm => {
            // 汇总收集进度
            let totalPuzzle = 0, totalChest = 0, totalPiece = 0, totalBlackbox = 0
            for (const col of (dm.collections || [])) {
                totalPuzzle += col.puzzleCount || 0
                totalChest += col.trchestCount || 0
                totalPiece += col.pieceCount || 0
                totalBlackbox += col.blackboxCount || 0
            }

            return {
                name: dm.name || dm.domainId,
                level: dm.level,
                settlements: (dm.settlements || []).map(stm => ({
                    name: stm.name,
                    level: stm.level,
                    officer: resolveCharName(stm.officerCharIds)
                })),
                totalPuzzle,
                totalChest,
                totalPiece,
                totalBlackbox
            }
        })

        return await puppeteer.screenshot('endfield-domain', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'domain.html'),
            playerName: base.name,
            domains
        })
    }
}