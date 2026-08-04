# 暖伴 - 适老工具微信小程序

## 项目简介
面向 60+ 老年人的极简工具小程序，包含天气查询和用药提醒两大功能。

## 快速开始

### 1. 开通云开发
1. 在微信开发者工具中打开本项目
2. 点击工具栏"云开发"按钮，开通云环境
3. 记录云环境ID，替换 `miniprogram/app.js` 中的 `your-env-id`

### 2. 创建云数据库集合
在云开发控制台 -> 数据库中创建集合：
- **medications** — 用药记录集合
  - 字段：_openid, name, dosage, time, periodLabel, status, takenAt, createdAt, subscribeCount
  - 权限：仅创建者可读写

### 3. 配置和风天气 API
1. 访问 https://dev.qweather.com/ 注册账号
2. 创建项目，获取 API Key
3. 在云开发控制台 -> 云函数 -> getWeather -> 配置 -> 环境变量中添加：
   - Key: `QWEATHER_KEY`
   - Value: 你的和风天气API Key

### 4. 部署云函数
在微信开发者工具中：
1. 右键 `cloudfunctions/getWeather` -> "上传并部署：云端安装依赖"
2. 右键 `cloudfunctions/saveMedication` -> "上传并部署：云端安装依赖"
3. 右键 `cloudfunctions/medicationReminder` -> "上传并部署：云端安装依赖"

### 5. 配置订阅消息（可选）
1. 在微信公众平台 -> 功能 -> 订阅消息中申请模板
2. 替换以下文件中的 `your-template-id`：
   - `miniprogram/pages/medication/index.js`
   - `cloudfunctions/medicationReminder/index.js`

### 6. 替换 AppID
替换 `project.config.json` 中的 `your-appid` 为你的小程序AppID

## 技术栈
- 原生微信小程序
- 微信云开发（云函数 + 云数据库）
- 和风天气 API
