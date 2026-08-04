// cloudfunctions/getWeather/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 心知天气API Key 从环境变量读取
const SENIVERSE_KEY = process.env.SENIVERSE_KEY
const BASE_URL = 'https://api.seniverse.com/v3'

exports.main = async (event, context) => {
  const { lat, lon } = event
  const location = `${lat}:${lon}`

  if (!SENIVERSE_KEY) {
    // 无Key时返回Mock数据，方便开发测试
    return getMockData(lat, lon)
  }

  try {
    // 并发请求：实况天气 + 3天预报（免费版仅支持这些）
    const [nowRes, dailyRes] = await Promise.all([
      fetchSeniverse('/weather/now.json', location),
      fetchSeniverse('/weather/daily.json', location + '&start=0&days=3')
    ])

    // 实况天气
    const now = nowRes.now
    // 3天预报
    const daily = dailyRes.daily || []

    // 根据温度生成穿衣建议
    const temp = parseInt(now.temperature)
    const advice = getAdviceByTemp(temp)
    const adviceTitle = getAdviceTitle(temp)
    
    // 紫外线指数（简化处理，根据天气状况估算）
    const uvText = estimateUVIndex(now.text)

    return {
      code: 0,
      msg: 'success',
      data: {
        now: {
          temp: now.temperature,
          feelsLike: now.feels_like || now.temperature,
          text: now.text,
          humidity: now.humidity,
          windScale: now.wind_scale,
          windDir: now.wind_direction
        },
        forecast: daily.map(item => ({
          date: item.date,
          textDay: item.text_day,
          textNight: item.text_night,
          tempMax: item.high,
          tempMin: item.low
        })),
        advice: advice,
        adviceTitle: adviceTitle,
        uvText: uvText,
        sportText: estimateSportIndex(now.text, temp),
        carWashText: estimateCarWashIndex(now.text)
      }
    }
  } catch (err) {
    console.error('天气获取失败:', err)
    return getMockData(lat, lon, err.message)
  }
}

// 心知天气API请求
async function fetchSeniverse(path, location) {
  const https = require('https')
  const url = `${BASE_URL}${path}?key=${SENIVERSE_KEY}&location=${location}&language=zh-Hans&unit=c`
  
  console.error('=== 调试信息 ===')
  console.error('请求路径:', path)
  console.error('Location参数:', location)
  console.error('完整URL:', url.substring(0, 100) + '...')
  console.error('=================')

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.error('HTTP状态码:', res.statusCode)
        
        if (res.statusCode !== 200) {
          console.error('错误响应:', data)
          reject(new Error('HTTP ' + res.statusCode))
          return
        }
        
        if (!data || data.trim() === '') {
          reject(new Error('API返回空响应'))
          return
        }
        
        try {
          const json = JSON.parse(data)
          console.error('完整响应:', JSON.stringify(json))
          
          // 心知天气的响应格式:
          // 成功: {"results": [...]} 
          // 失败: {"status_code": "401", "status": "错误信息"}
          
          // 检查是否有错误状态码（错误响应有 status_code 字段）
          if (json.status_code && json.status_code !== 'OK') {
            console.error('API错误码:', json.status_code)
            console.error('API错误信息:', json.status)
            let errMsg = json.status || ''
            if (!errMsg) {
              switch(json.status_code) {
                case '401': errMsg = 'API Key错误'; break;
                case '402': errMsg = '请求次数超限'; break;
                case '403': errMsg = 'API Key不存在'; break;
                case '404': errMsg = '城市/位置不存在'; break;
                default: errMsg = '未知错误';
              }
            }
            reject(new Error(errMsg))
          } else if (json.results && json.results.length > 0) {
            // 成功响应
            console.error('API调用成功')
            resolve(json.results[0])
          } else {
            reject(new Error('响应格式异常'))
          }
        } catch (e) {
          if (e.message.includes('API') || e.message.includes('错误')) {
            reject(e)
          } else {
            console.error('JSON解析失败, 原始数据:', data.substring(0, 200))
            reject(new Error('数据解析失败'))
          }
        }
      })
    })
    
    req.on('error', (e) => {
      console.error('HTTPS请求失败:', e.message)
      reject(new Error('网络请求失败: ' + e.message))
    })
    
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

// 根据温度获取穿衣建议
function getAdviceByTemp(temp) {
  if (temp >= 30) return '天气炎热，穿短袖、短裤，注意防晒。'
  if (temp >= 20) return '天气温暖，穿薄长袖或短袖即可。'
  if (temp >= 10) return '天气微凉，建议穿外套或夹克。'
  if (temp >= 0) return '天气寒冷，建议穿厚外套、毛衣，注意保暖。'
  return '天气严寒，建议穿羽绒服、棉服，注意防寒保暖。'
}

// 获取建议标题
function getAdviceTitle(temp) {
  if (temp >= 30) return '穿短袖'
  if (temp >= 20) return '穿长袖'
  if (temp >= 10) return '穿外套'
  return '穿厚外套'
}

// 估算紫外线指数（根据天气状况）
function estimateUVIndex(weatherText) {
  if (!weatherText) return '弱'
  if (weatherText.includes('晴') && !weatherText.includes('多云')) return '强'
  if (weatherText.includes('多云')) return '中等'
  if (weatherText.includes('阴') || weatherText.includes('雨')) return '弱'
  return '中等'
}

// 估算运动指数
function estimateSportIndex(weatherText, temp) {
  if (weatherText.includes('雨') || weatherText.includes('雪')) return '不宜'
  if (temp >= 35) return '不宜'
  if (temp >= 20 && temp <= 30) return '非常适宜'
  return '较适宜'
}

// 估算洗车指数
function estimateCarWashIndex(weatherText) {
  if (weatherText.includes('雨') || weatherText.includes('雪')) return '不宜'
  if (weatherText.includes('尘') || weatherText.includes('雾')) return '不太适宜'
  return '适宜'
}

// Mock数据（无Key时使用）
function getMockData(lat, lon, errorMsg) {
  const mockTemp = 22
  const mockDate = new Date()
  const dates = []
  
  for (let i = 0; i < 3; i++) {
    const d = new Date(mockDate)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }

  return {
    code: errorMsg ? -1 : 0,
    msg: errorMsg ? '使用Mock数据: ' + errorMsg : '使用Mock数据（未配置API Key）',
    data: {
      now: {
        temp: mockTemp,
        feelsLike: mockTemp - 1,
        text: '多云',
        humidity: '65',
        windScale: '3',
        windDir: '东南'
      },
      forecast: [
        { date: dates[0], textDay: '多云', textNight: '晴', tempMax: '25', tempMin: '18' },
        { date: dates[1], textDay: '晴', textNight: '晴', tempMax: '27', tempMin: '19' },
        { date: dates[2], textDay: '小雨', textNight: '多云', tempMax: '22', tempMin: '16' }
      ],
      advice: '天气舒适，穿长袖衬衫或薄外套即可。',
      adviceTitle: '穿长袖',
      uvText: '中等',
      sportText: '较适宜',
      carWashText: '较适宜'
    }
  }
}
