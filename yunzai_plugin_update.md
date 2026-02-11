# Yunzai Endfield 插件更新文档

> 基于上一版插件开发指南的后端变更，插件需要做以下适配。

---

## 变更摘要

| 变更项 | 原行为 | 新行为 |
|--------|--------|--------|
| 签到接口响应 | `data: null`，message 固定 "签到已触发" | `data` 为签到结果字符串（含奖励信息） |
| 刷新凭证接口 | `POST /skland/refresh`（无参数） | `POST /skland/refresh?bindingId={id}`（必须传） |
| 重复签到 | 前端自行判断 | 后端返回 `code: 200`，`data: "今日已签到"` |
| 凭证过期自动刷新 | 遇 403 直接刷新 | 需先排除"重复签到"（也返回 403/10001） |

---

## 1. `refreshCred` 必须传 `bindingId`

**原因**：插件场景下所有 QQ 用户的绑定都在同一个 API Key 的用户下。不传 `bindingId` 会刷新**所有 QQ 用户**的凭证。

```diff
// model/api.js
- refreshCred() { return this.request('/skland/refresh', 'POST') }
+ refreshCred(bindingId) { return this.request(`/skland/refresh?bindingId=${bindingId}`, 'POST') }
```

所有调用处都需要传入对应 QQ 用户的 `bindingId`。

---

## 2. `requestWithAutoRefresh` 增加 `bindingId` 参数 + 重复签到预检

**原因**：森空岛的"重复签到"响应也包含 `403` / `10001`，如果不先排除，就会误触发凭证刷新。

```diff
// model/api.js
- async requestWithAutoRefresh(path, method = 'GET', body = null) {
+ async requestWithAutoRefresh(path, method = 'GET', body = null, bindingId = null) {
    try {
      const data = await this.request(path, method, body)
      return { data, refreshed: false }
    } catch (err) {
+     // 【新增】重复签到不需要刷新凭证
+     if (err.message?.includes('重复') || err.message?.includes('已签')) {
+       throw err
+     }
      if (err.message?.includes('403') || err.message?.includes('Unauthorized') || err.message?.includes('10001')) {
+       if (!bindingId) throw err
        try {
-         await this.refreshCred()
+         await this.refreshCred(bindingId)
          const data = await this.request(path, method, body)
          return { data, refreshed: true }
        } catch (retryErr) {
          throw new Error(`凭证已失效且无法自动恢复，请重新绑定 (${retryErr.message})`)
        }
      }
      throw err
    }
  }
```

---

## 3. 签到结果解析方式变更

**原因**：后端签到接口现在同步返回实际签到结果（含奖励），不再是固定的 "签到已触发"。

响应格式变更：
```json
// 之前
{ "code": 200, "message": "签到已触发", "data": null }

// 现在 - 签到成功
{ "code": 200, "message": "签到成功: {\"awards\":...}", "data": "签到成功: {\"awards\":...}" }

// 现在 - 今日已签到
{ "code": 200, "message": "今日已签到", "data": "今日已签到" }
```

插件解析改动：
```diff
// apps/signin.js - signin 方法
  const { data: result, refreshed } = await api.requestWithAutoRefresh(
-   `/skland/bindings/${bindingId}/signin`, 'POST'
+   `/skland/bindings/${bindingId}/signin`, 'POST', null, bindingId
  )
- let msg = '✅ 签到成功！'
- if (result.data?.awards) msg += `\n🎁 ${JSON.stringify(result.data.awards)}`
+ let msg = `✅ ${result.data || '签到成功！'}`
  if (refreshed) msg += '\n⚠️ 凭证已自动刷新'
```

---

## 4. 手动刷新指令传 `bindingId`

```diff
// apps/signin.js - refresh 方法
  async refresh(e) {
+   const bindingId = data.getBindingId(e.user_id)
+   if (!bindingId) return e.reply('❌ 请先绑定')
    try {
-     await api.refreshCred()
+     await api.refreshCred(bindingId)
      e.reply('✅ 凭证刷新成功！')
    } catch (err) {
      e.reply(`❌ 刷新失败: ${err.message}\n如果持续失败，请重新绑定`)
    }
  }
```

---

## 5. 自动签到和角色查询传 `bindingId`

```diff
// apps/signin.js - autoSignAll 方法
  const { refreshed } = await api.requestWithAutoRefresh(
-   `/skland/bindings/${bindingId}/signin`, 'POST'
+   `/skland/bindings/${bindingId}/signin`, 'POST', null, bindingId
  )

// apps/card.js - card 方法
- const { data: result, refreshed } = await api.requestWithAutoRefresh('/skland/endfield/card')
+ const { data: result, refreshed } = await api.requestWithAutoRefresh('/skland/endfield/card', 'GET', null, bindingId)
```

---

## 总结

核心原则：**所有涉及凭证刷新的地方都必须传 `bindingId`**，因为插件共用一个 API Key，不传会影响其他 QQ 用户的绑定。
