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
      default:
        return { code: -1, msg: '未知操作: ' + action, data: null }
    }
  } catch (err) {
    console.error('saveMedication错误:', err)
    return { code: -1, msg: err.message, data: null }
  }
}

// 文本内容安全检测，命中违规返回 true；接口调用异常（非违规判定）放行返回 false
async function isTextRisky(content, openid) {
  if (!content) return false
  try {
    await cloud.openapi.security.msgSecCheck({ content, version: 2, scene: 1, openid })
    return false
  } catch (err) {
    if (err.errCode === 87014 || err.errcode === 87014) return true
    console.warn('文本安全检测调用异常，放行:', err)
    return false
  }
}

// 图片内容安全检测，命中违规返回 true；接口调用异常（非违规判定）放行返回 false
async function isImageRisky(fileID) {
  if (!fileID) return false
  try {
    const { fileContent } = await cloud.downloadFile({ fileID })
    await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/png', value: fileContent }
    })
    return false
  } catch (err) {
    if (err.errCode === 87014 || err.errcode === 87014) return true
    console.warn('图片安全检测调用异常，放行:', err)
    return false
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
  // 三项安全检测并行发起，减少总耗时，避免云函数超时
  const [nameRisky, dosageRisky, imageRisky] = await Promise.all([
    isTextRisky(medication.name, openid),
    isTextRisky(medication.dosage, openid),
    isImageRisky(medication.imageFileId)
  ])
  if (nameRisky) {
    return { code: -2, msg: '药品名称包含违规内容，请修改后重试', data: null }
  }
  if (dosageRisky) {
    return { code: -2, msg: '剂量说明包含违规内容，请修改后重试', data: null }
  }
  if (imageRisky) {
    return { code: -2, msg: '药品图片不合规，请更换后重试', data: null }
  }

  const now = new Date()
  const result = await db.collection('medications').add({
    data: {
      _openid: openid,
      name: medication.name,
      dosage: medication.dosage,
      dosageUnit: medication.dosageUnit || '',
      time: medication.time,
      periodLabel: medication.periodLabel,
      status: medication.status || 'pending',
      imageFileId: medication.imageFileId || '',
      takenAt: null,
      createdAt: now
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

  const [nameRisky, dosageRisky, imageRisky] = await Promise.all([
    isTextRisky(medication.name, openid),
    isTextRisky(medication.dosage, openid),
    isImageRisky(medication.imageFileId)
  ])
  if (nameRisky) {
    return { code: -2, msg: '药品名称包含违规内容，请修改后重试', data: null }
  }
  if (dosageRisky) {
    return { code: -2, msg: '剂量说明包含违规内容，请修改后重试', data: null }
  }
  if (imageRisky) {
    return { code: -2, msg: '药品图片不合规，请更换后重试', data: null }
  }

  // 若更换了图片，清理旧图片文件（失败仅记日志，不阻断流程）
  const oldImageFileId = existing.data.imageFileId
  const newImageFileId = medication.imageFileId || ''
  if (oldImageFileId && oldImageFileId !== newImageFileId) {
    try {
      await cloud.deleteFile({ fileList: [oldImageFileId] })
    } catch (err) {
      console.warn('清理旧药品图片失败:', err)
    }
  }

  await db.collection('medications').doc(id).update({
    data: {
      name: medication.name,
      dosage: medication.dosage,
      dosageUnit: medication.dosageUnit || '',
      time: medication.time,
      periodLabel: medication.periodLabel,
      imageFileId: newImageFileId
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

  // 清理云存储图片（失败仅记日志）
  if (existing.data.imageFileId) {
    try {
      await cloud.deleteFile({ fileList: [existing.data.imageFileId] })
    } catch (err) {
      console.warn('清理药品图片失败:', err)
    }
  }

  await db.collection('medications').doc(id).remove()
  return { code: 0, msg: 'success', data: null }
}
