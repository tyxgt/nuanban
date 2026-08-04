// utils/location.js - 定位获取与降级处理

/**
 * 获取用户定位，失败时降级为北京坐标
 * @returns {Promise<{latitude: number, longitude: number, isDefault: boolean}>}
 */
function getLocation() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === false) {
          // 曾拒绝授权，引导设置
          wx.showModal({
            title: '需要定位权限',
            content: '获取天气需要定位权限，请在设置中开启',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.userLocation']) {
                      doGetLocation(resolve)
                    } else {
                      resolve(getDefaultLocation())
                    }
                  },
                  fail: () => resolve(getDefaultLocation())
                })
              } else {
                resolve(getDefaultLocation())
              }
            }
          })
        } else {
          doGetLocation(resolve)
        }
      },
      fail: () => resolve(getDefaultLocation())
    })
  })
}

function doGetLocation(resolve) {
  wx.getLocation({
    type: 'wgs84',
    success: (res) => {
      resolve({
        latitude: res.latitude,
        longitude: res.longitude,
        isDefault: false
      })
    },
    fail: () => resolve(getDefaultLocation())
  })
}

function getDefaultLocation() {
  return { latitude: 39.9042, longitude: 116.4074, isDefault: true }
}

module.exports = { getLocation }
