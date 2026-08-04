// cloudfunctions/medicationReminder/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 订阅消息模板ID（TODO: 替换为你的模板ID）
const TEMPLATE_ID = 'your-template-id'

// 判断时间戳是否为今天
function isToday(timestamp) {
  if (!timestamp) return false
  const date = new Date(timestamp)
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

exports.main = async (event, context) => {
  const now = new Date()

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
      const currentMinutes = now.getHours() * 60 + now.getMinutes()

      if (Math.abs(currentMinutes - medMinutes) <= 5) {
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: med._openid,
            templateId: TEMPLATE_ID,
            page: 'pages/medication/index',
            data: {
              thing1: { value: med.name },
              time2: { value: med.time },
              thing3: { value: med.dosage },
              thing4: { value: med.periodLabel || '请按时服药' }
            },
            miniprogramState: 'formal'
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
