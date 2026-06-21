function normalizeText(value) {
    return String(value || '')
        .replace(/\uFEFF/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function inlineText(inlineElements = []) {
    return normalizeText(inlineElements.map(item => {
        if (item?.text?.text) return item.text.text
        if (item?.link?.text) return item.link.text
        if (item?.card?.text) return item.card.text
        return ''
    }).join(''))
}

function blockText(block) {
    if (!block) return ''
    if (block.kind === 'text') return inlineText(block.text?.inlineElements || [])
    if (block.kind === 'quote') return inlineText(block.quote?.inlineElements || [])
    if (block.kind === 'image') return normalizeText(block.image?.description || '')
    return ''
}

function orderedValues(map = {}, ids = []) {
    if (ids.length > 0) return ids.map(id => map[id]).filter(Boolean)
    return Object.values(map || {})
}

function parseTable(blockMap = {}, tableBlock) {
    const table = tableBlock?.table
    if (!table) return []

    const rowIds = table.rowIds || Object.keys(table.rowMap || {})
    const columnIds = table.columnIds || Object.keys(table.columnMap || {})

    return rowIds.map(rowId => {
        return columnIds.map(columnId => {
            const cell = table.cellMap?.[`${rowId}_${columnId}`]
            const childIds = cell?.childIds || cell?.blockIds || []
            return normalizeText(childIds.map(id => blockText(blockMap[id])).filter(Boolean).join('\n'))
        })
    }).filter(row => row.some(Boolean))
}

function getDocument(detailData, contentId) {
    return detailData?.document?.documentMap?.[contentId] || null
}

function getDocumentBlocks(detailData, contentId) {
    const doc = getDocument(detailData, contentId)
    if (!doc) return []
    return orderedValues(doc.blockMap, doc.blockIds)
}

function getDocumentText(detailData, contentId, maxBlocks = 12) {
    return getDocumentBlocks(detailData, contentId)
        .filter(block => block.kind === 'text' || block.kind === 'quote')
        .map(blockText)
        .filter(Boolean)
        .slice(0, maxBlocks)
}

function getDocumentImages(detailData, contentId, limit = 4) {
    return getDocumentBlocks(detailData, contentId)
        .filter(block => block.kind === 'image' && block.image?.url)
        .map(block => ({
            url: block.image.url,
            description: normalizeText(block.image.description || ''),
            width: Number(block.image.width || 0),
            height: Number(block.image.height || 0),
            format: block.image.format || ''
        }))
        .slice(0, limit)
}

function getDocumentTables(detailData, contentId) {
    const doc = getDocument(detailData, contentId)
    if (!doc) return []
    return orderedValues(doc.blockMap, doc.blockIds)
        .filter(block => block.kind === 'table')
        .map(block => parseTable(doc.blockMap, block))
        .filter(table => table.length > 0)
}

function firstContentId(widget) {
    const tabData = widget?.tabDataMap || {}
    const firstTab = Object.values(tabData)[0]
    return firstTab?.content || ''
}

function findWidget(detailData, predicate) {
    const widgets = detailData?.document?.widgetCommonMap || {}
    return Object.values(widgets).find(predicate) || null
}

function findWidgetByTabTitle(detailData, title) {
    return findWidget(detailData, widget => {
        return (widget.tabList || []).some(tab => tab.title === title)
    })
}

function findWidgetByChapterTitle(detailData, title) {
    const widgetId = (detailData?.document?.chapterGroup || [])
        .flatMap(group => group.widgets || [])
        .find(widget => widget.title === title)?.id
    if (!widgetId) return null
    return detailData?.document?.widgetCommonMap?.[widgetId] || null
}

function widgetContentByTitle(widget, title) {
    if (!widget) return ''
    const tab = (widget.tabList || []).find(tab => tab.title === title)
    if (!tab) return ''
    return widget.tabDataMap?.[tab.tabId]?.content || ''
}

function buildTagGroups(item) {
    const tags = new Set((item.tagIds || []).map(String))
    const groups = []

    for (const group of item.detailData?.subType?.filterTagTree || []) {
        const values = (group.children || [])
            .filter(child => tags.has(String(child.id)) || tags.has(String(child.value)))
            .map(child => ({
                id: String(child.id),
                value: child.value || '',
                name: child.name || ''
            }))
            .filter(child => child.name)

        if (values.length > 0) {
            groups.push({
                id: String(group.id),
                name: group.name || '',
                values
            })
        }
    }

    return groups
}

function tagValue(groups, groupName) {
    return groups.find(group => group.name === groupName)?.values?.[0]?.name || ''
}

function extractBasicTable(detailData) {
    const widget = findWidget(detailData, widget => widget.type === 'table' && widget.tableList?.length)
    return (widget?.tableList || [])
        .map(row => ({
            label: normalizeText(row.label),
            value: normalizeText(row.value)
        }))
        .filter(row => row.label && row.value)
}

function extractCaption(item) {
    if (Array.isArray(item.caption)) {
        return item.caption
            .map(block => normalizeText(block?.text?.text || ''))
            .filter(Boolean)
    }
    if (item.caption && typeof item.caption === 'object') {
        return Object.values(item.caption).map(normalizeText).filter(Boolean)
    }
    return []
}

function tableToRecords(table) {
    const [header = [], ...rows] = table || []
    return rows.map(row => {
        const record = {}
        header.forEach((key, index) => {
            if (key) record[key] = row[index] || ''
        })
        return record
    })
}

function finalColumnSummary(table, limit = 4) {
    const [header = [], ...rows] = table || []
    const lastIndex = header.map(Boolean).lastIndexOf(true)
    if (lastIndex <= 0) return []

    return rows
        .map(row => ({
            label: row[0] || '',
            value: row[lastIndex] || ''
        }))
        .filter(row => row.label && row.value && row.label !== '技能等级' && row.label !== '材料消耗')
        .slice(0, limit)
}

function extractAttributes(detailData) {
    const widget = findWidgetByChapterTitle(detailData, '精英化')
        || findWidget(detailData, widget => firstContentId(widget) && getDocumentText(detailData, firstContentId(widget)).some(text => text.includes('干员属性')))
    const contentId = firstContentId(widget)
    const table = getDocumentTables(detailData, contentId)[0] || []
    const rows = tableToRecords(table)

    const finalColumn = table[0]?.filter(Boolean).at(-1) || ''
    const important = ['基础生命值', '基础攻击力', '防御力', '攻击速度', '智识', '意志', '技力上限']
    return rows
        .filter(row => important.includes(row[table[0]?.[0]]))
        .map(row => ({
            label: row[table[0]?.[0]],
            value: row[finalColumn] || Object.values(row).filter(Boolean).at(-1) || ''
        }))
        .filter(row => row.label && row.value)
        .slice(0, 8)
}

function extractWidgetSections(detailData, widget, limit = 4) {
    if (!widget) return []

    return (widget.tabList || [])
        .map(tab => {
            const contentId = widget.tabDataMap?.[tab.tabId]?.content
            const texts = getDocumentText(detailData, contentId, 8)
            const heading = texts[0] || tab.title
            const body = texts.find(text => text !== heading && text.length > 8) || texts[1] || ''
            return {
                title: heading || tab.title,
                description: body
            }
        })
        .filter(section => section.title || section.description)
        .slice(0, limit)
}

function extractCommonSections(detailData, widgetTitle, limit = 4) {
    return extractWidgetSections(
        detailData,
        findWidgetByChapterTitle(detailData, widgetTitle) || findWidgetByTabTitle(detailData, widgetTitle),
        limit
    )
}

function extractSkills(detailData) {
    const skillWidget = findWidgetByChapterTitle(detailData, '战斗技能')
    const names = ['普通攻击', '战技', '连携技', '终结技']

    return (skillWidget?.tabList || [])
        .map((tab, index) => {
            const contentId = skillWidget.tabDataMap?.[tab.tabId]?.content
            const table = getDocumentTables(detailData, contentId)[0] || []
            const stats = finalColumnSummary(table, 4)
            return {
                title: tab.title || names[index] || `技能${index + 1}`,
                stats,
                description: stats.map(row => `${row.label} ${row.value}`).join(' / ')
            }
        })
        .filter(skill => skill.stats.length > 0)
        .slice(0, 4)
}

function extractPotentials(detailData) {
    return extractCommonSections(detailData, '干员潜能', 5)
}

function extractTalents(detailData) {
    return extractCommonSections(detailData, '天赋阵列', 6)
        .filter(section => section.description)
}

function extractProfileInfo(detailData) {
    const widget = findWidgetByChapterTitle(detailData, '干员情报')
    const contentId = firstContentId(widget)
    const texts = getDocumentText(detailData, contentId, 30)
    const pairs = []

    for (let index = 0; index < texts.length - 1; index += 2) {
        const label = texts[index]
        const value = texts[index + 1]
        if (label && value) pairs.push({ label, value })
    }
    return pairs.slice(0, 8)
}

function extractVoiceActors(detailData) {
    const widget = findWidgetByChapterTitle(detailData, '干员语音')
    return (widget?.tabList || [])
        .map(tab => normalizeText(tab.title))
        .filter(Boolean)
        .slice(0, 4)
}

function extractMaterialImages(detailData) {
    const gallery = []
    for (const widgetTitle of ['干员演示', '干员EP', '塔卫二记事社']) {
        const widget = findWidgetByChapterTitle(detailData, widgetTitle)
        for (const tab of widget?.tabList || []) {
            const contentId = widget.tabDataMap?.[tab.tabId]?.content
            const image = getDocumentImages(detailData, contentId, 1)[0]
            if (image?.url) gallery.push({ title: tab.title || widgetTitle, ...image })
        }
    }
    return gallery
}

function extractArchiveSummary(detailData) {
    return extractArchive(detailData).map(section => ({
        title: section.title,
        content: section.content.split('\n').find(text => text.length > 24) || section.content
    })).slice(0, 3)
}

function extractSkillDescriptions(detailData) {
    const docs = Object.keys(detailData?.document?.documentMap || {})
    const candidates = [
        { title: '普通攻击', keys: ['普通攻击：'] },
        { title: '战技', keys: ['战技', '断云', '追形', '开天'] },
        { title: '连携技', keys: ['连携技'] },
        { title: '终结技', keys: ['终结技'] }
    ]

    return candidates.map(candidate => {
        const text = docs
            .map(id => getDocumentText(detailData, id, 12).join('\n'))
            .find(text => candidate.keys.some(key => text.includes(key)) && text.length > 20)
        return {
            title: candidate.title,
            description: text ? text.slice(0, 140) : ''
        }
    }).filter(item => item.description)
}

function mergeSkillDescriptions(skills, descriptions) {
    const descMap = new Map(descriptions.map(item => [item.title, item.description]))
    return skills.map(skill => ({
        ...skill,
        description: descMap.get(skill.title) || skill.description
    }))
}

function extractSkillCards(detailData) {
    return mergeSkillDescriptions(extractSkills(detailData), extractSkillDescriptions(detailData))
}

function extractGallery(detailData) {
    const gallery = []
    const extra = detailData?.document?.extraInfo?.illustration
    if (extra) gallery.push({ title: '立绘', url: extra, description: '' })

    for (const title of ['干员展示图', '干员履历', '干员战斗演示', '干员叙事', '塔卫二干员影像', '后勤备忘']) {
        const widget = findWidgetByTabTitle(detailData, title)
        const contentId = widgetContentByTitle(widget, title)
        const image = getDocumentImages(detailData, contentId, 1)[0]
        if (image?.url) gallery.push({ title, ...image })
    }

    gallery.push(...extractMaterialImages(detailData))

    const seen = new Set()
    return gallery.filter(image => {
        if (!image.url || seen.has(image.url)) return false
        seen.add(image.url)
        return true
    }).slice(0, 8)
}

function extractArchive(detailData) {
    const widget = findWidgetByTabTitle(detailData, '基础档案')
    const sections = []
    for (const tab of widget?.tabList || []) {
        const contentId = widget.tabDataMap?.[tab.tabId]?.content
        const texts = getDocumentText(detailData, contentId, 10).filter(Boolean)
        if (texts.length > 0) {
            sections.push({
                title: tab.title,
                content: texts.join('\n').slice(0, 260)
            })
        }
    }
    return sections.slice(0, 4)
}

export function parseWikiOperator(item) {
    if ((item.detailData?.subType?.name || '') !== '干员' && item.categoryId !== '1' && item.subTypeId !== '1') {
        return null
    }

    const detailData = item.detailData || {}
    const tagGroups = buildTagGroups(item)
    const basicTable = extractBasicTable(detailData)
    const caption = extractCaption(item)

    return {
        type: 'operator',
        id: item.id || item.officialItemId || '',
        name: item.name || detailData.name || '',
        cover: item.cover || detailData.brief?.cover || '',
        illustration: detailData.document?.extraInfo?.illustration || item.cover || '',
        rarity: tagValue(tagGroups, '星级'),
        profession: tagValue(tagGroups, '干员职业'),
        property: tagValue(tagGroups, '属性'),
        weapon: tagValue(tagGroups, '武器'),
        mainAbility: tagValue(tagGroups, '主能力'),
        subAbility: tagValue(tagGroups, '副能力'),
        tags: tagGroups,
        basicTable,
        profileInfo: extractProfileInfo(detailData),
        quote: caption[0] || '',
        description: caption.slice(1).join('\n').slice(0, 360),
        attributes: extractAttributes(detailData),
        potentials: extractPotentials(detailData),
        talents: extractTalents(detailData),
        skills: extractSkillCards(detailData),
        gallery: extractGallery(detailData),
        archive: extractArchive(detailData),
        archiveSummary: extractArchiveSummary(detailData),
        voiceActors: extractVoiceActors(detailData),
        updatedAt: item.updatedAt || '',
        publishedAt: item.publishedAt || ''
    }
}

export default {
    parseWikiOperator
}
