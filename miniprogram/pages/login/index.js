// pages/login/index.js
Page({
  data: {
    nickname: '',
    hasNickname: false
  },

  onLoad() {
    // 回填已保存的昵称，支持修改
    const nickname = wx.getStorageSync('user_nickname') || ''
    this.setData({
      nickname,
      hasNickname: !!nickname
    })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  onConfirm() {
    const nickname = (this.data.nickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    wx.setStorageSync('user_nickname', nickname)
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  },

  onClear() {
    this.setData({ nickname: '' })
  }
})
