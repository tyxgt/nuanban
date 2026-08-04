// app.js
App({
  onLaunch() {
    // 云开发初始化
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d5go6mhbd489cd6bd', // TODO: 替换为你的云环境ID
        traceUser: true
      })
    }

    // 获取系统信息和胶囊按钮位置，计算自定义导航栏高度
    const sysInfo = wx.getSystemInfoSync()
    this.globalData.systemInfo = sysInfo
    this.globalData.statusBarHeight = sysInfo.statusBarHeight || 20
    // 获取右上角胶囊按钮位置，用于让导航栏内容与胶囊按钮垂直居中对齐
    try {
      const menuButton = wx.getMenuButtonBoundingClientRect()
      this.globalData.menuButton = menuButton
      // 导航栏内容区高度 = 胶囊按钮距状态栏的间距 * 2 + 胶囊按钮高度
      this.globalData.navBarHeight =
        (menuButton.top - this.globalData.statusBarHeight) * 2 + menuButton.height
    } catch (e) {
      this.globalData.navBarHeight = 44
    }
  },

  globalData: {
    systemInfo: null,
    statusBarHeight: 0,
    menuButton: null,
    navBarHeight: 44,
    location: null
  }
})
