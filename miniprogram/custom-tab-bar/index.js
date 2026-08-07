Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/weather/index', text: '天气' },
      { pagePath: '/pages/medication/index', text: '吃药' },
      { pagePath: '/pages/contact/index', text: '打电话' }
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
