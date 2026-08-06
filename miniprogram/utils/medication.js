// utils/medication.js - 用药数据 CRUD 封装

/**
 * 获取用药列表
 */
function getMedications() {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveMedication',
      data: { action: 'list' },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 添加用药记录
 */
function addMedication(data) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveMedication',
      data: { action: 'add', medication: data },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 更新服药状态
 */
function updateMedStatus(id, status) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveMedication',
      data: { action: 'update', id, status },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 编辑用药记录
 */
function updateMedication(id, data) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveMedication',
      data: { action: 'edit', id, medication: data },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

/**
 * 删除用药记录
 */
function deleteMedication(id) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'saveMedication',
      data: { action: 'delete', id },
      success: (res) => resolve(res.result || { code: -1, msg: '调用失败' }),
      fail: (err) => resolve({ code: -1, msg: err.message })
    })
  })
}

module.exports = {
  getMedications,
  addMedication,
  updateMedStatus,
  updateMedication,
  deleteMedication
}
