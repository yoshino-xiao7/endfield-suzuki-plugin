<div align="center">

# endfield-suzuki-plugin

基于 [Endfield Cloud](https://endfield.suzuki.ink) 的 Yunzai-Bot **终末地**助手插件 · 绑定 / 签到 / 角色查询 / 基建 / 抽卡统计 / 理智提醒

[安装](#安装插件) · [功能](#当前功能) · [配置](#配置)

</div>

---

- 一个适用于 [Yunzai 系列机器人框架](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) 的明日方舟：终末地游戏助手插件

- 支持 Token / 手机验证码绑定，支持每日自动签到、凭证自动刷新、角色信息查询、基建查询、抽卡记录统计、理智溢出提醒、每日任务提醒

- 兼容 [锅巴面板](https://github.com/guoba-yunzai/guoba-plugin) 可视化配置

> [!TIP]
> 如有问题或建议，欢迎提 [Issue](https://github.com/yoshino-xiao7/endfield-suzuki-plugin/issues) 反馈 ✨

## 使用须知

本插件通过 [Endfield Cloud](https://endfield.suzuki.ink) 提供的统一 API 实现各项功能，使用前需要：

1. 在 Endfield Cloud 后台注册并获取 **API Key**
2. 在插件配置中填写 API Key（锅巴面板或手动编辑配置文件）

> [!IMPORTANT]
> API Key 由管理员统一配置，所有用户共用。请妥善保管，避免泄露。

## 安装插件

### 1. 克隆仓库

在 Yunzai 根目录执行：

```bash
git clone https://github.com/yoshino-xiao7/endfield-suzuki-plugin ./plugins/endfield-suzuki-plugin/
```

### 2. 配置 API Key

> [!WARNING]
> **必须配置 API Key 才能正常使用！** 请前往 [Endfield Cloud](https://endfield.suzuki.ink) 注册并获取。

**方式一：锅巴面板**（推荐）

安装 [锅巴插件](https://github.com/guoba-yunzai/guoba-plugin) 后，在面板中找到 `Endfield 终末地助手`，填写 API Key 即可。

**方式二：手动编辑**

创建 `plugins/endfield-plugin/config/config.yaml`：

```yaml
apiKey: ef_xxxxxxxxxxxxxxxx  # 你的 API Key
autoSignEnabled: true         # 开启自动签到
staminaThreshold: 240         # 理智提醒阈值（可选）
```

---

## 当前功能

命令前缀为 `#终末地` 或 `#endfield`，例如 `#终末地签到` / `#endfield签到`。

### 账号绑定

| 命令 | 说明 |
|------|------|
| `#终末地绑定 <token>` | 通过 Token 一步绑定（仅私聊） |
| `#终末地手机绑定 <手机号>` | 手机验证码绑定（仅私聊） |
| `#终末地解绑` | 解除绑定 |

> [!TIP]
> 绑定操作请在**私聊**中进行，保护您的 Token 和手机号安全。在群聊中发送绑定指令时，Bot 会自动提醒并尝试撤回消息。

### 签到

| 命令 | 说明 |
|------|------|
| `#终末地签到` | 手动签到 |
| `#终末地刷新` | 手动刷新凭证 |

- ⏰ 支持**自动签到**，默认每天 08:05 为所有已绑定用户自动执行
- 🔄 签到时如凭证过期，会**自动刷新**并重试

### 信息查询

| 命令 | 说明 |
|------|------|
| `#终末地信息` | 查询玩家资料卡（等级、理智、每日任务、武器/干员数量等） |
| `#终末地角色 <角色名>` | 查询角色详情卡（立绘、等级、武器、技能、装备等） |
| `#终末地帝江号` | 查询帝江号基建（各房间等级、驻守干员、好感度） |
| `#终末地基建` | 查询领地基建（区域等级、定居点、收集进度） |

### 抽卡统计

| 命令 | 说明 |
|------|------|
| `#终末地同步抽卡` | 同步抽卡记录（首次使用或更新数据时执行，耗时约 10~30 秒） |
| `#终末地抽卡记录` | 查看全部抽卡统计图表 |
| `#终末地抽卡记录 <池名>` | 按池名过滤统计（如 `限定寻访`、`常驻寻访`） |
| `#终末地角色池记录` | 查看角色池统计 |
| `#终末地武器池记录` | 查看武器池统计 |
| `#终末地抽卡统计` | 查看全部抽卡统计图表 |

- 📊 统计内容包括：各池总抽数、6★ 数量、平均出金抽数、UP 不歪率、每个 6★ 的抽数条形图
- 🟢🟡🔴 条形图颜色表示欧非程度：50 抽内绿色、50~70 抽橙色、70 抽以上红色

### 自动提醒

| 功能 | 说明 |
|------|------|
| ⚡ 理智提醒 | 每 30 分钟检查，理智 ≥ 阈值（默认 240）时私聊提醒 |
| 📋 每日任务提醒 | 每天 21:00 检查，未完成每日任务时私聊提醒 |

### 其他

| 命令 | 说明 |
|------|------|
| `#终末地帮助` | 查看所有指令帮助 |
| `#终末地更新` | 更新插件（git pull）· 仅管理员 |
| `#终末地强制更新` | 强制更新插件（覆盖本地修改）· 仅管理员 |

---

## 配置

### 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `apiKey` | `''` | **必填** · Endfield Cloud API Key |
| `apiBaseUrl` | `https://api.suzuki.ink/api` | API 地址 |
| `autoSignEnabled` | `true` | 是否开启自动签到 |
| `autoSignTime` | `08:05` | 自动签到时间（HH:MM 格式，如 `08:05` 表示每天 8:05） |
| `staminaThreshold` | `240` | 理智提醒阈值（达到此值时私聊提醒） |

### 目录结构

```
plugins/endfield-plugin/
├── index.js                 # 入口，自动加载 apps/
├── apps/
│   ├── bind.js              # 绑定 / 解绑指令
│   ├── signin.js            # 签到指令 + 自动签到
│   ├── card.js              # 信息/角色查询
│   ├── spaceship.js         # 帝江号基建查询
│   ├── domain.js            # 领地基建查询
│   ├── gacha.js             # 抽卡同步/记录/统计
│   ├── reminder.js          # 理智/每日任务提醒
│   └── update.js            # 插件更新
├── model/
│   ├── api.js               # API 请求封装
│   ├── data.js              # QQ↔bindingId 存储
│   └── render.js            # 卡片渲染
├── resources/
│   ├── profile.html         # 玩家资料卡模板
│   ├── character.html       # 角色详情卡模板
│   ├── spaceship.html       # 帝江号卡模板
│   ├── domain.html          # 领地基建卡模板
│   └── gacha-stats.html     # 抽卡统计图表模板
├── config/
│   └── config.yaml          # 用户配置（锅巴可编辑）
├── defSet/
│   └── config.yaml          # 默认配置
├── data/
│   └── bindings.json        # QQ↔bindingId 映射（自动生成）
└── guoba.support.js         # 锅巴面板支持
```

---

## 特性

- 🔑 **双重绑定方式**：Token 一步绑定 / 手机验证码两步绑定
- ⏰ **自动签到**：支持自定义时间（HH:MM 格式），每天自动为所有用户签到
- 🔄 **凭证自动刷新**：请求失败时自动刷新凭证并重试，减少手动操作
- 🖼️ **丰富卡片**：资料卡、角色详情卡、帝江号卡、领地基建卡、抽卡统计图表（全部图片渲染）
- 🎰 **抽卡统计**：同步抽卡记录、按池过滤、6★ 出金条形图、UP 不歪率统计
- ⚡ **理智提醒**：每 30 分钟检查理智，接近溢出时私聊提醒（阈值可配置）
- 📋 **每日任务提醒**：每天 21:00 自动检查，未完成时私聊提醒
- 🔒 **隐私保护**：群聊中发送敏感信息时自动提醒私聊，并尝试撤回消息
- ⚙️ **锅巴面板**：可通过可视化界面管理所有配置项

---

## 鸣谢

- **API 支持**：[Endfield Cloud](https://endfield.suzuki.ink) 提供后端 API 服务
- **框架支持**：[Yunzai-Bot](https://github.com/yoimiya-kokomi/Miao-Yunzai) · Miao-Yunzai 机器人框架
- **终末地官方**：[明日方舟：终末地](https://endfield.hypergryph.com)

---

如果你喜欢这个项目，请点个 ⭐ Star，这是对开发者最大的鼓励！
