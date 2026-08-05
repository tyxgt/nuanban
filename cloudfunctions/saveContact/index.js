// cloudfunctions/saveContact/index.js
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
        return await listContacts(openid)
      case 'add':
        return await addContact(event.contact, openid)
      case 'edit':
        return await editContact(event.id, event.contact, openid)
      case 'delete':
        return await deleteContact(event.id, openid)
      default:
        return { code: -1, msg: '未知操作: ' + action, data: null }
    }
  } catch (err) {
    console.error('saveContact错误:', err)
    return { code: -1, msg: err.message, data: null }
  }
}

// 查询联系人列表
async function listContacts(openid) {
  const result = await db.collection('contacts')
    .where({ _openid: openid })
    .orderBy('createdAt', 'asc')
    .get()

  return { code: 0, msg: 'success', data: result.data }
}

// 添加联系人
async function addContact(contact, openid) {
  const now = new Date()
  const result = await db.collection('contacts').add({
    data: {
      _openid: openid,
      name: contact.name,
      phone: contact.phone,
      avatarFileId: contact.avatarFileId || '',
      createdAt: now
    }
  })

  return { code: 0, msg: 'success', data: { _id: result._id } }
}

// 编辑联系人
async function editContact(id, contact, openid) {
  if (!id) {
    return { code: -1, msg: '联系人ID不存在', data: null }
  }

  const existing = await db.collection('contacts').doc(id).get()
  if (!existing.data) {
    return { code: -1, msg: '联系人记录不存在', data: null }
  }
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权修改该记录', data: null }
  }

  // 若更换了头像，清理旧头像文件（失败仅记日志，不阻断流程）
  const oldAvatarFileId = existing.data.avatarFileId
  const newAvatarFileId = contact.avatarFileId || ''
  if (oldAvatarFileId && oldAvatarFileId !== newAvatarFileId) {
    try {
      await cloud.deleteFile({ fileList: [oldAvatarFileId] })
    } catch (err) {
      console.warn('清理旧头像失败:', err)
    }
  }

  await db.collection('contacts').doc(id).update({
    data: {
      name: contact.name,
      phone: contact.phone,
      avatarFileId: newAvatarFileId
    }
  })

  return { code: 0, msg: 'success', data: null }
}

// 删除联系人
async function deleteContact(id, openid) {
  if (!id) {
    return { code: -1, msg: '联系人ID不存在', data: null }
  }
  const existing = await db.collection('contacts').doc(id).get()
  if (!existing.data) {
    return { code: -1, msg: '联系人记录不存在', data: null }
  }
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权删除该记录', data: null }
  }

  // 清理云存储头像（失败仅记日志）
  if (existing.data.avatarFileId) {
    try {
      await cloud.deleteFile({ fileList: [existing.data.avatarFileId] })
    } catch (err) {
      console.warn('清理头像文件失败:', err)
    }
  }

  await db.collection('contacts').doc(id).remove()
  return { code: 0, msg: 'success', data: null }
}
