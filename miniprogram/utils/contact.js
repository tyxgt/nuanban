// utils/contact.js - 联系人数据 CRUD 封装

/**
 * 获取联系人列表
 */
function getContacts() {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveContact',
      data: { action: 'list' },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 添加联系人
 */
function addContact(data) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveContact',
      data: { action: 'add', contact: data },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 编辑联系人
 */
function updateContact(id, data) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveContact',
      data: { action: 'edit', id, contact: data },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 删除联系人
 */
function deleteContact(id) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveContact',
      data: { action: 'delete', id },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 切换置顶状态
 */
function togglePin(id) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveContact',
      data: { action: 'togglePin', id },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

module.exports = {
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  togglePin
}
