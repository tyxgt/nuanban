// cloudfunctions/medicationReminder/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 订阅消息模板ID
const TEMPLATE_ID = '70Qu5rZyfa13-GFoqUXvP5rzraVPp6C8u1P-coGFIa4'

// 北京时间偏移(云函数运行在 UTC+0)
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

// 获取当前北京时间对应的 Date(配合 getUTC* 方法使用)
function nowBeijing() {
  return new Date(Date.now() + BEIJING_OFFSET_MS)
}

// 判断时间戳是否为北京时间今天
function isToday(timestamp) {
  if (!timestamp) return false
  const d = new Date(timestamp + BEIJING_OFFSET_MS)
  const now = nowBeijing()
  return d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth() === now.getUTCMonth()
    && d.getUTCDate() === now.getUTCDate()
}

// 格式化为订阅消息time字段要求的完整日期时间格式(北京时间)
function formatSendTime(timeStr) {
  const sendDate = nowBeijing()
  const [h, m] = timeStr.split(':').map(Number)
  sendDate.setUTCHours(h, m, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${sendDate.getUTCFullYear()}-${pad(sendDate.getUTCMonth() + 1)}-${pad(sendDate.getUTCDate())} ${pad(sendDate.getUTCHours())}:${pad(sendDate.getUTCMinutes())}`
}

exports.main = async (event, context) => {
  const now = nowBeijing()

  try {
    // 查询所有有订阅配额的用药记录
    const result = await db.collection('medications')
      .where({
        subscribeCount: db.command.gt(0)
      })
      .get()

    let sentCount = 0
    for (const med of result.data) {
      // 跳过今日已服用的
      if (med.status === 'taken' && isToday(med.takenAt)) continue

      // 检查时间是否在5分钟窗口内
      const [medHour, medMinute] = med.time.split(':').map(Number)
      const medMinutes = medHour * 60 + medMinute
      const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()

      if (Math.abs(currentMinutes - medMinutes) <= 5) {
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: med._openid,
            templateId: TEMPLATE_ID,
            page: 'pages/medication/index',
            data: {
              thing2: { value: `${med.name} ${med.dosage}`.slice(0, 20) },
              time25: { value: formatSendTime(med.time) },
              thing11: { value: (med.periodLabel || '请按时服药').slice(0, 20) }
            },
            miniprogramState: process.env.MINIAPP_STATE || 'developer'
          })

          // 扣减订阅次数
          await db.collection('medications').doc(med._id).update({
            data: { subscribeCount: db.command.inc(-1) }
          })

          sentCount++
          console.log(`提醒发送成功: ${med.name} -> ${med._openid}`)
        } catch (err) {
          console.error(`提醒发送失败: ${med.name}`, err)
        }
      }
    }

    return { code: 0, msg: 'success', data: { sent: sentCount } }
  } catch (err) {
    console.error('云函数执行失败:', err)
    return { code: -1, msg: err.message, data: null }
  }
}
