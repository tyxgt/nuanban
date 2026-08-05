Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/weather/index', text: '天气' },
      { pagePath: '/pages/medication/index', text: '用药提醒' },
      { pagePath: '/pages/contact/index', text: '紧急联系' }
    ]
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset
      wx.switchTab({ url: path })
      this.setData({ selected: index })
    }
  }
})
