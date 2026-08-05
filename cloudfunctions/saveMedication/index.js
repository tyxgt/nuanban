// cloudfunctions/saveMedication/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'list':
        return await listMedications(openid)
      case 'add':
        return await addMedication(event.medication, openid)
      case 'update':
        return await updateMedStatus(event.id, event.status, openid)
      case 'edit':
        return await editMedication(event.id, event.medication, openid)
      case 'delete':
        return await deleteMedication(event.id, openid)
      case 'addSubscribe':
        return await addSubscribeCount(openid)
      default:
        return { code: -1, msg: '未知操作: ' + action, data: null }
    }
  } catch (err) {
    console.error('saveMedication错误:', err)
    return { code: -1, msg: err.message, data: null }
  }
}

// 查询用药列表
async function listMedications(openid) {
  const result = await db.collection('medications')
    .where({ _openid: openid })
    .orderBy('time', 'asc')
    .get()

  return { code: 0, msg: 'success', data: result.data }
}

// 添加用药记录
async function addMedication(medication, openid) {
  const now = new Date()
  const result = await db.collection('medications').add({
    data: {
      _openid: openid,
      name: medication.name,
      dosage: medication.dosage,
      time: medication.time,
      periodLabel: medication.periodLabel,
      status: medication.status || 'pending',
      takenAt: null,
      createdAt: now,
      subscribeCount: medication.subscribeCount || 0
    }
  })

  return { code: 0, msg: 'success', data: { _id: result._id } }
}

// 更新服药状态
async function updateMedStatus(id, status, openid) {
  const now = new Date()
  await db.collection('medications').doc(id).update({
    data: {
      status,
      takenAt: status === 'taken' ? now : null
    }
  })

  return { code: 0, msg: 'success', data: null }
}

// 编辑用药记录
async function editMedication(id, medication, openid) {
  if (!id) {
    return { code: -1, msg: '药物ID不存在', data: null }
  }

  const existing = await db.collection('medications').doc(id).get()
  if (!existing.data) {
    return { code: -1, msg: '药物记录不存在', data: null }
  }
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权修改该记录', data: null }
  }

  await db.collection('medications').doc(id).update({
    data: {
      name: medication.name,
      dosage: medication.dosage,
      time: medication.time,
      periodLabel: medication.periodLabel
    }
  })

  return { code: 0, msg: 'success', data: null }
}

// 删除用药记录
async function deleteMedication(id, openid) {
  if (!id) {
    return { code: -1, msg: '药物ID不存在', data: null }
  }
  const existing = await db.collection('medications').doc(id).get()
  if (!existing.data) {
    return { code: -1, msg: '药物记录不存在', data: null }
  }
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权删除该记录', data: null }
  }
  await db.collection('medications').doc(id).remove()
  return { code: 0, msg: 'success', data: null }
}

// 增加订阅配额
// 注意:微信一次性订阅"1次授权=1条消息",配额由前端在添加药物时
// 直接写入对应记录(subscribeCount),此处不再批量给所有 pending 记录 +1,
// 避免给未授权的记录产生虚假配额导致发送时被微信拒绝。
async function addSubscribeCount(openid) {
  return { code: 0, msg: 'success', data: null }
}
