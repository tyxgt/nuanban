// pages/weather/index.js
const { getLocation } = require('../../utils/location.js')

// 天气emoji映射
const WEATHER_EMOJI = {
  '晴': '☀️',
  '多云': '⛅',
  '阴': '☁️',
  '小雨': '🌦️',
  '中雨': '🌧️',
  '大雨': '🌧️',
  '暴雨': '⛈️',
  '雷阵雨': '⛈️',
  '雪': '❄️',
  '雾': '🌫️',
  '霾': '🌫️'
}

function getWeatherEmoji(text) {
  if (!text) return '🌤️'
  for (const key in WEATHER_EMOJI) {
    if (text.includes(key)) return WEATHER_EMOJI[key]
  }
  return '🌤️'
}

function getDayName(dateStr, index) {
  if (index === 0) return '今天'
  if (index === 1) return '明天'
  if (index === 2) return '后天'
  const date = new Date(dateStr)
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekDays[date.getDay()]
}

function getDateShort(dateStr) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function formatTodayInfo() {
  const now = new Date()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return {
    dateStr: `${now.getMonth() + 1}月${now.getDate()}日`,
    weekDay: weekDays[now.getDay()]
  }
}

function buildTipText(advice, sportText, carWashText) {
  const parts = []
  if (advice) parts.push(advice.trim())

  const indices = []
  if (sportText) indices.push(`运动${sportText}`)
  if (carWashText) indices.push(`洗车${carWashText}`)
  if (indices.length > 0) parts.push(indices.join('，') + '。')

  if (parts.length === 0) {
    return '天气舒适，适合外出活动，注意补充水分。'
  }
  return parts.join('')
}

Page({
  data: {
    weather: {},
    forecast: [],
    loading: true,
    isMock: false,
    dateStr: '',
    weekDay: '',
    weatherEmoji: '🌤️',
    tipText: '',
    nickname: ''
  },

  onLoad() {
    const today = formatTodayInfo()
    this.setData({ dateStr: today.dateStr, weekDay: today.weekDay })
    this.loadWeather()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    const nickname = wx.getStorageSync('user_nickname') || ''
    this.setData({ nickname })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },

  async loadWeather() {
    const cache = wx.getStorageSync('weather_cache')
    if (cache && Date.now() - cache.timestamp < 10 * 60 * 1000) {
      this.setData({
        weather: cache.weather,
        forecast: cache.forecast,
        loading: false,
        isMock: cache.isMock || false,
        weatherEmoji: cache.weatherEmoji || '🌤️',
        tipText: cache.tipText || ''
      })
      return
    }

    try {
      const location = await getLocation()
      const app = getApp()
      app.globalData.location = location

      wx.cloud.callFunction({
        name: 'getWeather',
        data: {
          lat: location.latitude,
          lon: location.longitude
        },
        success: (res) => {
          if (res.result && res.result.code === 0) {
            const data = res.result.data
            const isMock = res.result.msg && res.result.msg.includes('Mock')

            const weather = {
              location: data.city || (location.isDefault ? '北京市' : '当前位置'),
              temp: data.now.temp,
              text: data.now.text,
              feelsLike: data.now.feelsLike,
              tempMax: data.forecast[0] ? data.forecast[0].tempMax : '',
              tempMin: data.forecast[0] ? data.forecast[0].tempMin : '',
              humidity: data.now.humidity,
              windScale: data.now.windScale,
              uvText: data.uvText || '弱',
              advice: data.advice,
              adviceTitle: data.adviceTitle || '今日穿衣',
              sportText: data.sportText || '',
              carWashText: data.carWashText || ''
            }

            // 未来三天天气：过滤掉今天（下标0），保留原始下标传给 getDayName 以保证明天/后天判断正确
            const forecast = data.forecast.slice(1).map((item, index) => ({
              date: item.date,
              dayName: getDayName(item.date, index + 1),
              dateShort: getDateShort(item.date),
              emoji: getWeatherEmoji(item.textDay),
              textDay: item.textDay,
              textNight: item.textNight,
              tempMax: item.tempMax,
              tempMin: item.tempMin
            }))

            const weatherEmoji = getWeatherEmoji(weather.text)
            const tipText = buildTipText(weather.advice, weather.sportText, weather.carWashText)

            this.setData({
              weather,
              forecast,
              loading: false,
              isMock,
              weatherEmoji,
              tipText
            })

            wx.setStorageSync('weather_cache', {
              weather,
              forecast,
              timestamp: Date.now(),
              isMock,
              weatherEmoji,
              tipText
            })
          } else {
            this.setData({ loading: false, tipText: '天气舒适，适合外出活动，注意补充水分。' })
            wx.showToast({
              title: res.result?.msg || '获取天气失败',
              icon: 'none',
              duration: 2000
            })
          }
        },
        fail: (err) => {
          console.error('云函数调用失败:', err)
          this.setData({ loading: false, tipText: '天气舒适，适合外出活动，注意补充水分。' })
          wx.showToast({ title: '网络请求失败', icon: 'none' })
        }
      })
    } catch (err) {
      console.error('定位失败:', err)
      this.setData({ loading: false, tipText: '天气舒适，适合外出活动，注意补充水分。' })
      wx.showToast({ title: '定位失败', icon: 'none' })
    }
  },

  onPullDownRefresh() {
    this.setData({ loading: true })
    wx.removeStorageSync('weather_cache')
    this.loadWeather()
    wx.stopPullDownRefresh()
  }
})
