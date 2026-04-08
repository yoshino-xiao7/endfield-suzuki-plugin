import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'path'
import { fileURLToPath } from 'url'

// Compatible way to get plugin root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PLUGIN_ROOT = path.resolve(__dirname, '..')

export default class Render {
    static async renderHelp() {
        return await puppeteer.screenshot('endfield-help', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'help.html'),
            scale: 2
        })
    }

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

        // 构建 charId -> charData 的快速查找 Map
        const charByHash = new Map()
        for (const c of charList) {
            if (!c.charData) continue
            charByHash.set(c.id, c)
            if (c.charData.id && c.charData.id !== c.id) {
                charByHash.set(c.charData.id, c)
            }
        }

        // 从 reports 数据中建立 chr_xxxx_name -> hash ID 的映射
        const chrCodeToHash = new Map()
        for (const room of (ship.rooms || [])) {
            if (!room.reports || !room.chars) continue
            for (const [, report] of Object.entries(room.reports)) {
                const reportChars = report.char || []
                // reports.char 顺序通常对应当时房间的 chars 顺序
                // 我们收集所有 chr_ 开头的 ID
                for (let i = 0; i < reportChars.length; i++) {
                    const chrCode = reportChars[i]
                    if (chrCode && chrCode.startsWith('chr_') && !chrCodeToHash.has(chrCode)) {
                        // 尝试通过同一房间当前的 chars 位置来映射
                        if (i < room.chars.length) {
                            const hashId = room.chars[i].charId
                            // 只在 hashId 是 hash 格式时建立映射
                            if (hashId && !hashId.startsWith('chr_')) {
                                chrCodeToHash.set(chrCode, hashId)
                            }
                        }
                    }
                }
            }
        }

        // 通过 charId 查找角色名称和头像
        const resolveChar = (charId) => {
            // 1. 直接 hash 查找
            if (charByHash.has(charId)) {
                const c = charByHash.get(charId)
                return {
                    name: c.charData.name,
                    avatar: c.charData.avatarSqUrl || c.charData.avatarRtUrl || ''
                }
            }

            // 2. 如果是 chr_xxxx_name 格式，尝试通过 reports 映射查找
            if (charId && charId.startsWith('chr_')) {
                // 2a. 通过 chrCodeToHash 映射
                for (const [chrCode, hashId] of chrCodeToHash) {
                    if (charId === chrCode || charId.startsWith(chrCode)) {
                        if (charByHash.has(hashId)) {
                            const c = charByHash.get(hashId)
                            return {
                                name: c.charData.name,
                                avatar: c.charData.avatarSqUrl || c.charData.avatarRtUrl || ''
                            }
                        }
                    }
                }

                // 2b. 尝试用 chr 编号的数字部分做匹配（chr_0016 中的 16）
                const numMatch = charId.match(/^chr_(\d+)/)
                if (numMatch) {
                    const chrNum = numMatch[1]
                    for (const [chrCode, hashId] of chrCodeToHash) {
                        const codeNum = chrCode.match(/^chr_(\d+)/)
                        if (codeNum && codeNum[1] === chrNum && charByHash.has(hashId)) {
                            const c = charByHash.get(hashId)
                            return {
                                name: c.charData.name,
                                avatar: c.charData.avatarSqUrl || c.charData.avatarRtUrl || ''
                            }
                        }
                    }
                }
            }

            logger.warn(`[Endfield] 帝江号无法解析角色: ${charId}`)
            return { name: charId ? charId.substring(0, 12) + '...' : '???', avatar: '' }
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

    // ===== 抽卡记录列表 =====
    static async renderGachaRecords(records, poolName = '全部') {
        // 按时间倒序，取最近 30 条显示
        const sorted = [...records].sort((a, b) => (b.gachaTs || 0) - (a.gachaTs || 0))
        const showList = sorted.slice(0, 30)

        const fmtRecords = showList.map(r => ({
            itemName: r.itemName || '???',
            rarity: r.rarity || 3,
            poolName: r.poolName ? r.poolName.replace('寻访', '') : '',
            time: r.gachaTs ? new Date(r.gachaTs).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
            isUp: r.isUp
        }))

        return await puppeteer.screenshot('endfield-gacha-records', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'gacha-records.html'),
            records: fmtRecords,
            poolName,
            totalCount: records.length,
            showCount: showList.length
        })
    }

    // ===== 抽卡统计（鸣潮风格 · 增强版） =====
    static async renderGachaStats(records, pools) {
        // 按池分组
        const poolMap = new Map()
        for (const p of pools) {
            poolMap.set(p.poolId || p.poolName, {
                poolName: p.poolName,
                poolType: p.poolType,
                records: []
            })
        }

        for (const r of records) {
            const key = r.poolId || r.poolName
            if (poolMap.has(key)) {
                poolMap.get(key).records.push(r)
            } else {
                poolMap.set(key, {
                    poolName: r.poolName || key,
                    poolType: r.poolType,
                    records: [r]
                })
            }
        }

        let totalPulls = records.length
        let totalSixStar = 0
        let totalFiveStar = records.filter(r => r.rarity === 5).length
        let totalUp = 0
        let totalUpEligible = 0
        let allSixPulls = [] // 收集所有6星的抽数，用于全局 min/max

        const poolStats = []

        for (const [, pool] of poolMap) {
            if (pool.records.length === 0) continue

            const sorted = [...pool.records].sort((a, b) => (a.gachaTs || 0) - (b.gachaTs || 0))

            let pullsSinceLast = 0
            const sixStars = []

            for (const r of sorted) {
                pullsSinceLast++
                if (r.rarity === 6) {
                    sixStars.push({
                        name: r.itemName || '???',
                        pulls: pullsSinceLast,
                        isUp: r.isUp
                    })
                    allSixPulls.push(pullsSinceLast)
                    totalSixStar++
                    if (r.isUp !== null && r.isUp !== undefined) {
                        totalUpEligible++
                        if (r.isUp === true) totalUp++
                    }
                    pullsSinceLast = 0
                }
            }

            const currentPity = pullsSinceLast
            const sixCount = sixStars.length
            const avgPull = sixCount > 0 ? (sorted.length / sixCount).toFixed(1) : '-'
            const upCount = sixStars.filter(s => s.isUp === true).length
            const lostCount = sixStars.filter(s => s.isUp === false).length
            const upInfo = (upCount + lostCount) > 0 ? `${lostCount}/${upCount + lostCount}` : '-'

            // 格式化条形图
            const maxPullBase = 90
            const fmtSixStars = sixStars.map((s, i) => {
                const barWidth = Math.min(Math.max((s.pulls / maxPullBase) * 100, 8), 100)
                let barColor = 'bar-green'
                if (s.pulls > 70) barColor = 'bar-red'
                else if (s.pulls > 50) barColor = 'bar-yellow'

                let upText = '', upClass = ''
                if (s.isUp === true) { upText = '▲ UP'; upClass = 'ss-up-yes' }
                else if (s.isUp === false) { upText = '△ MISS'; upClass = 'ss-up-no' }

                return { idx: i + 1, name: s.name, pulls: s.pulls, barWidth, barColor, upText, upClass }
            })

            // 垫抽进度条
            const pityBarWidth = Math.min((currentPity / maxPullBase) * 100, 100)
            let pityBarColor = 'pity-bar-safe'
            if (currentPity > 70) pityBarColor = 'pity-bar-danger'
            else if (currentPity > 50) pityBarColor = 'pity-bar-warn'

            poolStats.push({
                poolName: pool.poolName,
                totalPulls: sorted.length,
                sixCount,
                avgPull,
                upInfo,
                sixStars: fmtSixStars,
                currentPity,
                pityBarWidth,
                pityBarColor
            })
        }

        const avgPerSix = totalSixStar > 0 ? (totalPulls / totalSixStar).toFixed(1) : '-'
        const upRate = totalUpEligible > 0 ? `${(totalUp / totalUpEligible * 100).toFixed(1)}%` : '-'
        const minPull = allSixPulls.length > 0 ? `${Math.min(...allSixPulls)}` : '-'
        const maxPull = allSixPulls.length > 0 ? `${Math.max(...allSixPulls)}` : '-'

        // 欧非评价（工业风标识）
        const avgNum = totalSixStar > 0 ? totalPulls / totalSixStar : 999
        let luckText = 'PENDING', luckClass = 'luck-normal'
        if (totalSixStar >= 2) {
            if (avgNum <= 45) { luckText = 'S · 欧皇'; luckClass = 'luck-eu' }
            else if (avgNum <= 60) { luckText = 'A · 小欧'; luckClass = 'luck-eu' }
            else if (avgNum <= 70) { luckText = 'B · 普通'; luckClass = 'luck-normal' }
            else if (avgNum <= 80) { luckText = 'C · 小非'; luckClass = 'luck-fei' }
            else { luckText = 'D · 非酋'; luckClass = 'luck-fei' }
        }

        const updateTime = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

        return await puppeteer.screenshot('endfield-gacha-stats', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'gacha-stats.html'),
            scale: 2,
            totalPulls,
            totalSixStar,
            totalFiveStar,
            avgPerSix,
            upRate,
            minPull,
            maxPull,
            luckText,
            luckClass,
            poolStats,
            updateTime
        })
    }
}