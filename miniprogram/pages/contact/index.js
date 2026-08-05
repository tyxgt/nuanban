// pages/contact/index.js
const PHONE_NUMBER = '13943145637'

Page({
  data: {
    phoneNumber: PHONE_NUMBER
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  onCallTap() {
    wx.makePhoneCall({
      phoneNumber: PHONE_NUMBER,
      success() {
        // 系统拨号弹窗已弹出，无需额外处理
      },
      fail(err) {
        // 用户在系统弹窗取消或拨号失败
        wx.showToast({
          title: '已取消拨号',
          icon: 'none',
          duration: 2000
        })
      }
    })
  }
})
