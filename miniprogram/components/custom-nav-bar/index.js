Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    background: {
      type: String,
      value: '#FFFFFF'
    },
    color: {
      type: String,
      value: '#1A1A1A'
    }
  },
  data: {
    statusBarHeight: 20,
    navBarHeight: 44
  },
  lifetimes: {
    attached() {
      const app = getApp()
      this.setData({
        statusBarHeight: app.globalData.statusBarHeight || 20,
        navBarHeight: app.globalData.navBarHeight || 44
      })
    }
  }
})
