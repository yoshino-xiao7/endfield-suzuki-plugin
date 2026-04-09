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
        const domainList = data.detail.domain || []
        const charList = data.detail.chars || []
        const shipData = data.detail.spaceShip || {}

        // ===== 理智恢复计算 =====
        const curStamina = dungeon.curStamina || 0
        const maxStamina = dungeon.maxStamina || 0
        const STAMINA_RECOVERY_SECONDS = 7 * 60 + 12 // 7分12秒/点
        let recoveryText = ''
        let staminaPercent = maxStamina > 0 ? Math.min((curStamina / maxStamina) * 100, 100) : 0
        let staminaFull = curStamina >= maxStamina

        if (!staminaFull && maxStamina > 0) {
            const remaining = maxStamina - curStamina
            const totalSec = remaining * STAMINA_RECOVERY_SECONDS
            const hours = Math.floor(totalSec / 3600)
            const minutes = Math.floor((totalSec % 3600) / 60)
            recoveryText = `${hours}h ${minutes}min`
        }

        // ===== 苏醒日 =====
        const createDate = base.createTime
            ? new Date(base.createTime * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : ''

        // ===== 领地基建摘要 =====
        const domains = domainList.map(dm => {
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
                settlements: (dm.settlements || []).map(s => ({ name: s.name, level: s.level })),
                totalPuzzle, totalChest, totalPiece, totalBlackbox
            }
        })

        // ===== 帝江号总控中枢等级 =====
        const hubRoom = (shipData.rooms || []).find(r => r.type === 0)
        const hubLevel = hubRoom ? hubRoom.level : 0

        // ===== 活跃度 & 通行证 =====
        const dailyCur = dailyMission.dailyActivation || 0
        const dailyMax = dailyMission.maxDailyActivation || 100
        const dailyPercent = dailyMax > 0 ? Math.min((dailyCur / dailyMax) * 100, 100) : 0

        // 通行证数据
        const bpSystem = data.detail.bpSystem || {}
        const passCur = bpSystem.curLevel || 0
        const passMax = bpSystem.maxLevel || 60

        // ===== 干员列表（前8个，按稀有度+等级排序）=====
        const sortedChars = [...charList]
            .filter(c => c.charData)
            .sort((a, b) => {
                const ra = a.charData.rarity?.value || 0
                const rb = b.charData.rarity?.value || 0
                if (rb !== ra) return rb - ra
                return (b.level || 0) - (a.level || 0)
            })

        const topChars = sortedChars.slice(0, 8).map(c => ({
            name: c.charData.name,
            avatar: c.charData.avatarSqUrl || c.charData.avatarRtUrl || '',
            level: c.level || 1,
            evolvePhase: c.evolvePhase || 0,
            rarity: c.charData.rarity?.value || 3,
            profession: c.charData.profession?.value || '',
            property: c.charData.property?.key || ''
        }))

        // ===== 探索等阶 =====
        const exploreLevel = dungeon.dungeonLevel || dungeon.exploreLevel || base.worldLevel || 0
        const exploreRank = dungeon.dungeonRank || dungeon.exploreRank || 0

        // ===== 汇总收集 =====
        let totalPuzzle = 0, totalChest = 0, totalBlackbox = 0
        for (const dm of domains) {
            totalPuzzle += dm.totalPuzzle
            totalChest += dm.totalChest
            totalBlackbox += dm.totalBlackbox
        }

        return await puppeteer.screenshot('endfield-profile', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'profile.html'),
            scale: 2,
            // 玩家基础
            playerName: base.name,
            playerUid: base.roleId,
            playerLevel: base.level,
            playerAvatar: base.avatarUrl || '',
            createDate,
            days: Math.ceil((Date.now() / 1000 - base.createTime) / 86400),
            progress: base.mainMission?.description || '',
            // 理智
            curStamina, maxStamina, staminaPercent, staminaFull, recoveryText,
            // 数值统计
            worldLevel: base.worldLevel,
            exploreLevel,
            exploreRank,
            charNum: base.charNum,
            weaponNum: base.weaponNum,
            hubLevel,
            totalPuzzle, totalChest, totalBlackbox,
            // 活跃度
            dailyCur, dailyMax, dailyPercent,
            passCur, passMax,
            // 领地
            domains,
            // 干员
            topChars,
            hasChars: topChars.length > 0
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
            scale: 2,
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
            1: '制造仓',
            2: '培养仓',
            3: '会客厅',
            5: '线索交换'
        }

        // 房间显示排序优先级
        const ROOM_ORDER = { 0: 0, 5: 1, 1: 2, 2: 3, 3: 4 }

        // 罗马数字
        const ROMAN = ['I', 'II', 'III', 'IV', 'V']

        // 为同类型房间分配编号
        const roomList = ship.rooms || []
        const typeCount = {}
        for (const r of roomList) {
            typeCount[r.type] = (typeCount[r.type] || 0) + 1
        }
        const typeIndex = {}

        const getRoomDisplayName = (room) => {
            const baseName = ROOM_NAMES[room.type] || `房间(${room.type})`
            // 同类型有多个房间时加罗马数字编号
            if (typeCount[room.type] > 1) {
                typeIndex[room.type] = (typeIndex[room.type] || 0) + 1
                return `${baseName}${ROMAN[typeIndex[room.type] - 1] || typeIndex[room.type]}`
            }
            return baseName
        }

        // 构建查找 Map：同时支持 hash ID 和 chr_xxxx_name 格式
        const charMap = new Map()
        for (const c of charList) {
            if (!c.charData) continue
            // hash ID 映射
            charMap.set(c.id, c)
            if (c.charData.id && c.charData.id !== c.id) {
                charMap.set(c.charData.id, c)
            }
            // chr_xxxx_name 映射：从 abilityTalents[0].id 提取
            // 格式为 chr_0016_laevat_1，房间 charId 为 chr_0016_laevat（去掉最后 _N）
            const talents = c.charData.abilityTalents || []
            if (talents.length > 0 && talents[0].id) {
                const talentId = talents[0].id  // e.g. "chr_0016_laevat_1"
                // 去掉最后一个 _N 后缀得到 chr_xxxx_name
                const chrCode = talentId.replace(/_\d+$/, '')  // e.g. "chr_0016_laevat"
                charMap.set(chrCode, c)
                // 也存一个仅含编号的 key (chr_0016)
                const numOnly = talentId.match(/^(chr_\d+)/)
                if (numOnly) charMap.set(numOnly[1], c)
            }
        }

        // 通过 charId 查找角色名称和头像
        const resolveChar = (charId) => {
            // 1. 直接精确查找（hash 或 chr_xxxx_name）
            if (charMap.has(charId)) {
                const c = charMap.get(charId)
                return {
                    name: c.charData.name,
                    avatar: c.charData.avatarSqUrl || c.charData.avatarRtUrl || ''
                }
            }

            // 2. chr_xxxx_name 格式回退：尝试仅用编号部分匹配
            if (charId && charId.startsWith('chr_')) {
                const numOnly = charId.match(/^(chr_\d+)/)
                if (numOnly && charMap.has(numOnly[1])) {
                    const c = charMap.get(numOnly[1])
                    return {
                        name: c.charData.name,
                        avatar: c.charData.avatarSqUrl || c.charData.avatarRtUrl || ''
                    }
                }
            }

            logger.warn(`[Endfield] 帝江号无法解析角色: ${charId}`)
            return { name: charId ? charId.substring(0, 12) + '...' : '???', avatar: '' }
        }

        // 先按排序优先级排序房间，同类型按 id 排序
        const sortedRooms = [...roomList].sort((a, b) => {
            const oa = ROOM_ORDER[a.type] ?? 99
            const ob = ROOM_ORDER[b.type] ?? 99
            if (oa !== ob) return oa - ob
            return (a.id || '').localeCompare(b.id || '')
        })

        const rooms = sortedRooms.map(room => ({
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
            scale: 2,
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
            scale: 2,
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
            scale: 2,
            records: fmtRecords,
            poolName,
            totalCount: records.length,
            showCount: showList.length
        })
    }

    // ===== 抽卡统计（skland 风格） =====
    static async renderGachaStats(records, pools, playerInfo = {}) {
        const maxPullBase = 80 // Endfield 保底80

        // ===== 辅助函数 =====
        const getBarColor = (pulls) => {
            if (pulls <= 30) return 'bar-lucky'
            if (pulls <= 50) return 'bar-normal'
            if (pulls <= 65) return 'bar-warn'
            return 'bar-bad'
        }

        const getPityColor = (pity) => {
            if (pity <= 40) return 'safe'
            if (pity <= 60) return 'warn'
            return 'danger'
        }

        // ===== 池分类 =====
        const classifyPool = (poolId, poolType) => {
            if (poolId === 'beginner') return 'beginner'
            if (poolId === 'standard') return 'standard'
            if (poolId && poolId.startsWith('special_')) return 'limited'
            if (poolId && (poolId.startsWith('weponbox_') || poolId.startsWith('weaponbox_'))) {
                if (poolId.includes('constant')) return 'standard_weapon'
                return 'weapon'
            }
            // fallback by poolType
            if (poolType === 'weapon') return 'weapon'
            if (poolType === 'char') return 'limited'
            return 'standard'
        }

        // ===== 按池分组 =====
        const poolMap = new Map()
        for (const p of pools) {
            poolMap.set(p.poolId || p.poolName, {
                poolId: p.poolId,
                poolName: p.poolName,
                poolType: p.poolType,
                category: classifyPool(p.poolId, p.poolType),
                records: []
            })
        }

        for (const r of records) {
            const key = r.poolId || r.poolName
            if (poolMap.has(key)) {
                poolMap.get(key).records.push(r)
            } else {
                poolMap.set(key, {
                    poolId: r.poolId,
                    poolName: r.poolName || key,
                    poolType: r.poolType,
                    category: classifyPool(r.poolId, r.poolType),
                    records: [r]
                })
            }
        }

        // ===== 计算每个池的统计 =====
        const processPool = (pool) => {
            if (pool.records.length === 0) return null

            const sorted = [...pool.records].sort((a, b) => (a.gachaTs || 0) - (b.gachaTs || 0))

            let pullsSinceLast = 0
            const sixStars = []
            let fiveCount = 0
            let hasFreeRecords = false

            for (const r of sorted) {
                pullsSinceLast++
                if (r.isFree) hasFreeRecords = true
                if (r.rarity === 5) fiveCount++
                if (r.rarity === 6) {
                    sixStars.push({
                        name: r.itemName || '???',
                        pulls: pullsSinceLast,
                        isUp: r.isUp,
                        isNew: r.isNew,
                        isFree: r.isFree
                    })
                    pullsSinceLast = 0
                }
            }

            const currentPity = pullsSinceLast
            const sixCount = sixStars.length
            const upCount = sixStars.filter(s => s.isUp === true).length
            const lostCount = sixStars.filter(s => s.isUp === false).length

            // UP角色名推断：从 UP 的6★中取名
            const upChars = sixStars.filter(s => s.isUp === true)
            const upCharName = upChars.length > 0 ? upChars[0].name : ''

            // 格式化6★条目
            const charAvatars = playerInfo.charAvatars || {}
            const fmtSixStars = sixStars.map(s => {
                const barWidth = Math.min(Math.max((s.pulls / maxPullBase) * 100, 10), 100)
                return {
                    name: s.name,
                    avatar: charAvatars[s.name] || '',
                    pulls: s.pulls,
                    barWidth,
                    barColor: getBarColor(s.pulls),
                    isUp: s.isUp === true,
                    isMiss: s.isUp === false,
                    isNewChar: s.isNew === true,
                    wasFree: s.isFree === true
                }
            })

            // 保底进度条
            const pityBarWidth = Math.min((currentPity / maxPullBase) * 100, 100)
            const pityBarColor = getPityColor(currentPity)

            // 免费10连状态
            const freeRecords = sorted.filter(r => r.isFree)
            const freeSixStar = freeRecords.some(r => r.rarity === 6)
            const freeStatus = hasFreeRecords ? (freeSixStar ? '出6★' : '未出6★') : ''

            const sixInfo = `${sixCount}/${upCount + lostCount > 0 ? upCount + lostCount : sixCount}`
            const upAvg = sixCount > 0 ? (sorted.length / sixCount).toFixed(1) : '-'

            return {
                poolName: pool.poolName,
                poolId: pool.poolId,
                category: pool.category,
                totalPulls: sorted.length,
                sixCount,
                fiveCount,
                sixInfo,
                upAvg,
                upCharName,
                currentPity,
                sixStars: fmtSixStars,
                pityBarWidth,
                pityBarColor,
                hasFree: hasFreeRecords,
                freeStatus
            }
        }

        const allPoolStats = []
        for (const [, pool] of poolMap) {
            const stat = processPool(pool)
            if (stat) allPoolStats.push(stat)
        }

        // ===== 分类池 =====
        const limitedPools = allPoolStats.filter(p => p.category === 'limited')
        const weaponPools = allPoolStats.filter(p => p.category === 'weapon')
        const beginnerPools = allPoolStats.filter(p => p.category === 'beginner')
        const standardPools = allPoolStats.filter(p => p.category === 'standard' || p.category === 'standard_weapon')

        // ===== 总计 =====
        const totalPulls = records.length
        const charPulls = records.filter(r => r.poolType === 'char').length
        const weaponPullsCount = records.filter(r => r.poolType === 'weapon').length

        const limitedTotalPulls = limitedPools.reduce((s, p) => s + p.totalPulls, 0)
        const weaponTotalPulls = weaponPools.reduce((s, p) => s + p.totalPulls, 0)
        const beginnerTotalPulls = beginnerPools.reduce((s, p) => s + p.totalPulls, 0)
        const standardTotalPulls = standardPools.reduce((s, p) => s + p.totalPulls, 0)

        // ===== 汇总卡片 =====
        const buildCategorySummary = (label, cssClass, catPools, catTotalPulls) => {
            const totalSix = catPools.reduce((s, p) => s + p.sixCount, 0)
            const totalUpAll = catPools.reduce((s, p) => s + p.sixStars.filter(ss => ss.isUp).length, 0)
            const totalUpMiss = catPools.reduce((s, p) => s + p.sixStars.filter(ss => ss.isMiss).length, 0)
            const sixInfo = `${totalSix}/${totalUpAll + totalUpMiss > 0 ? totalUpAll + totalUpMiss : totalSix}`
            const upAvg = totalSix > 0 ? (catTotalPulls / totalSix).toFixed(1) : '-'
            // 合并当前最大已垫
            const maxPity = catPools.length > 0 ? Math.max(...catPools.map(p => p.currentPity)) : 0
            const pityWidth = Math.min((maxPity / maxPullBase) * 100, 100)
            const pityColor = getPityColor(maxPity)

            return {
                label,
                cssClass,
                totalPulls: catTotalPulls,
                sixInfo,
                upAvg,
                currentPity: maxPity,
                hasPity: catTotalPulls > 0,
                pityWidth,
                pityColor,
                pityText: `${maxPity}/80`
            }
        }

        const categorySummary = [
            buildCategorySummary('限定池', 'limited', limitedPools, limitedTotalPulls),
            buildCategorySummary('武器池', 'weapon', weaponPools, weaponTotalPulls),
            buildCategorySummary('常驻池', 'standard', standardPools, standardTotalPulls),
            buildCategorySummary('新手池', 'beginner', beginnerPools, beginnerTotalPulls)
        ]

        return await puppeteer.screenshot('endfield-gacha-stats', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'gacha-stats.html'),
            scale: 2,
            // Header
            playerName: playerInfo.name || '',
            playerUid: playerInfo.uid || '',
            playerAvatar: playerInfo.avatar || '',
            // Totals
            totalPulls,
            charPulls,
            weaponPulls: weaponPullsCount,
            // Category summaries
            categorySummary,
            // Pool lists
            limitedPools,
            weaponPools,
            beginnerPools,
            standardPools,
            limitedTotalPulls,
            weaponTotalPulls,
            beginnerTotalPulls,
            standardTotalPulls
        })
    }

    // ===== 单池/筛选抽卡统计（紧凑单列布局） =====
    static async renderGachaPool(records, pools, playerInfo = {}, filterLabel = '抽卡统计') {
        const maxPullBase = 80

        const getBarColor = (pulls) => {
            if (pulls <= 30) return 'bar-lucky'
            if (pulls <= 50) return 'bar-normal'
            if (pulls <= 65) return 'bar-warn'
            return 'bar-bad'
        }

        const getPityColor = (pity) => {
            if (pity <= 40) return 'safe'
            if (pity <= 60) return 'warn'
            return 'danger'
        }

        // 推断筛选类型（用于顶部渐变色）
        const guessFilterType = () => {
            const types = new Set(pools.map(p => p.poolType))
            if (types.size === 1) {
                if (types.has('char')) return 'char'
                if (types.has('weapon')) return 'weapon'
            }
            return 'mixed'
        }

        const getBarClass = (category) => {
            if (category === 'limited') return 'bar-purple'
            if (category === 'weapon') return 'bar-orange'
            if (category === 'beginner') return 'bar-green'
            return 'bar-cyan'
        }

        // 池分类（复用）
        const classifyPool = (poolId, poolType) => {
            if (poolId === 'beginner') return 'beginner'
            if (poolId === 'standard') return 'standard'
            if (poolId && poolId.startsWith('special_')) return 'limited'
            if (poolId && (poolId.startsWith('weponbox_') || poolId.startsWith('weaponbox_'))) {
                if (poolId.includes('constant')) return 'standard_weapon'
                return 'weapon'
            }
            if (poolType === 'weapon') return 'weapon'
            if (poolType === 'char') return 'limited'
            return 'standard'
        }

        // 按池分组
        const poolMap = new Map()
        for (const p of pools) {
            poolMap.set(p.poolId || p.poolName, {
                poolId: p.poolId,
                poolName: p.poolName,
                poolType: p.poolType,
                category: classifyPool(p.poolId, p.poolType),
                records: []
            })
        }

        for (const r of records) {
            const key = r.poolId || r.poolName
            if (poolMap.has(key)) {
                poolMap.get(key).records.push(r)
            } else {
                poolMap.set(key, {
                    poolId: r.poolId,
                    poolName: r.poolName || key,
                    poolType: r.poolType,
                    category: classifyPool(r.poolId, r.poolType),
                    records: [r]
                })
            }
        }

        // 处理池统计
        const processPool = (pool) => {
            if (pool.records.length === 0) return null
            const sorted = [...pool.records].sort((a, b) => (a.gachaTs || 0) - (b.gachaTs || 0))

            let pullsSinceLast = 0
            const sixStars = []
            let fiveCount = 0
            let hasFreeRecords = false

            for (const r of sorted) {
                pullsSinceLast++
                if (r.isFree) hasFreeRecords = true
                if (r.rarity === 5) fiveCount++
                if (r.rarity === 6) {
                    sixStars.push({
                        name: r.itemName || '???',
                        pulls: pullsSinceLast,
                        isUp: r.isUp,
                        isNew: r.isNew,
                        isFree: r.isFree
                    })
                    pullsSinceLast = 0
                }
            }

            const currentPity = pullsSinceLast
            const sixCount = sixStars.length
            const upCount = sixStars.filter(s => s.isUp === true).length
            const lostCount = sixStars.filter(s => s.isUp === false).length

            const upChars = sixStars.filter(s => s.isUp === true)
            const upCharName = upChars.length > 0 ? upChars[0].name : ''

            const charAvatars = playerInfo.charAvatars || {}
            const fmtSixStars = sixStars.map(s => ({
                name: s.name,
                avatar: charAvatars[s.name] || '',
                pulls: s.pulls,
                barWidth: Math.min(Math.max((s.pulls / maxPullBase) * 100, 10), 100),
                barColor: getBarColor(s.pulls),
                isUp: s.isUp === true,
                isMiss: s.isUp === false,
                isNewChar: s.isNew === true,
                wasFree: s.isFree === true
            }))

            const sixInfo = `${sixCount}/${upCount + lostCount > 0 ? upCount + lostCount : sixCount}`
            const upAvg = sixCount > 0 ? (sorted.length / sixCount).toFixed(1) : '-'

            const freeRecords = sorted.filter(r => r.isFree)
            const freeSixStar = freeRecords.some(r => r.rarity === 6)
            const freeStatus = hasFreeRecords ? (freeSixStar ? '出6★' : '未出6★') : ''

            return {
                poolName: pool.poolName,
                poolId: pool.poolId,
                category: pool.category,
                barClass: getBarClass(pool.category),
                totalPulls: sorted.length,
                sixCount,
                fiveCount,
                sixInfo,
                upAvg,
                upCharName,
                currentPity,
                sixStars: fmtSixStars,
                pityBarWidth: Math.min((currentPity / maxPullBase) * 100, 100),
                pityBarColor: getPityColor(currentPity),
                hasFree: hasFreeRecords,
                freeStatus
            }
        }

        const poolStats = []
        for (const [, pool] of poolMap) {
            const stat = processPool(pool)
            if (stat) poolStats.push(stat)
        }

        // 汇总
        const totalPulls = records.length
        const totalSixCount = poolStats.reduce((s, p) => s + p.sixCount, 0)
        const upCount = poolStats.reduce((s, p) => s + p.sixStars.filter(ss => ss.isUp).length, 0)
        const missCount = poolStats.reduce((s, p) => s + p.sixStars.filter(ss => ss.isMiss).length, 0)
        const avgPulls = totalSixCount > 0 ? (totalPulls / totalSixCount).toFixed(1) : '-'

        // 总体保底（取最大已垫）
        const overallPity = poolStats.length > 0 ? Math.max(...poolStats.map(p => p.currentPity)) : 0
        const overallPityWidth = Math.min((overallPity / maxPullBase) * 100, 100)
        const overallPityColor = getPityColor(overallPity)

        return await puppeteer.screenshot('endfield-gacha-pool', {
            tplFile: path.join(PLUGIN_ROOT, 'resources', 'gacha-pool.html'),
            scale: 2,
            filterType: guessFilterType(),
            filterLabel,
            playerName: playerInfo.name || '',
            playerUid: playerInfo.uid || '',
            playerAvatar: playerInfo.avatar || '',
            totalPulls,
            totalSixCount,
            avgPulls,
            upCount,
            missCount,
            overallPity,
            overallPityWidth,
            overallPityColor,
            poolStats
        })
    }
}