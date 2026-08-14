// cloudfunctions/getWeather/index.js
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const zlib = require('zlib')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 和风天气改用 JWT 鉴权（不再使用 API Key），需要在控制台"项目管理"里创建凭据（Ed25519 密钥对）
// 参考：https://dev.qweather.com/docs/configuration/project-and-key/#add-credential-for-api-key
// 云函数环境变量需配置：
//   QWEATHER_PROJECT_ID  项目ID（JWT payload 的 sub）
//   QWEATHER_KEY_ID      凭据ID（JWT header 的 kid，创建凭据/上传公钥后生成）
//   QWEATHER_PRIVATE_KEY 本地生成的 Ed25519 私钥（PKCS8 PEM），怎么粘贴的都行，见 normalizePem
const QWEATHER_PROJECT_ID = process.env.QWEATHER_PROJECT_ID
const QWEATHER_KEY_ID = process.env.QWEATHER_KEY_ID
const QWEATHER_PRIVATE_KEY = normalizePem(process.env.QWEATHER_PRIVATE_KEY)

// 还原PEM私钥：兼容"环境变量输入框是单行文本，多行粘贴后换行丢失/挤成一行"“换行存成字面量\n”
// “Windows风格\r\n”等常见粘贴事故，尽量把BEGIN/END之间的内容重新拼装成标准多行PEM
function normalizePem(raw) {
  if (!raw) return raw
  let s = raw.trim().replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // 已经是规范的多行PEM，直接用
  if (/-----BEGIN [\w ]+-----\n[\s\S]+\n-----END [\w ]+-----/.test(s)) {
    return s
  }
  // 否则从BEGIN/END之间提取内容，去掉所有空白后重新拼装
  const match = s.match(/-----BEGIN ([\w ]+)-----\s*([\s\S]*?)\s*-----END ([\w ]+)-----/)
  if (match) {
    const label = match[1].trim()
    const body = match[2].replace(/\s+/g, '')
    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`
  }
  return s
}
// 和风天气账号会在控制台"我的项目"里分配专属 API Host（形如 https://xxxxxx.qweatherapi.com）
// 未配置时默认使用旧版免费开发者共用域名，若请求 403/404 请去控制台确认专属 Host 并配置该环境变量
const API_HOST = normalizeHost(process.env.QWEATHER_API_HOST) || 'https://devapi.qweather.com'

// 归一化 API_HOST：兼容"环境变量粘贴带空格/换行"“漏填 https:// 协议头”“结尾多余斜杠”等常见配置事故，
// 避免拼出来的 URL 不合法（Node 的 https.get 内部用 new URL() 解析字符串，格式不对会直接同步抛出 Invalid URL）
function normalizeHost(raw) {
  if (!raw) return raw
  let s = raw.trim().replace(/[\r\n]/g, '')
  if (!s) return s
  if (!/^https?:\/\//i.test(s)) {
    s = 'https://' + s
  }
  return s.replace(/\/+$/, '') // 去掉结尾多余的斜杠，避免和 path 拼接时出现双斜杠
}

// 进程内缓存 JWT，避免每次调用都重新做 Ed25519 签名（同一云函数执行环境热启动时复用）
let cachedToken = null
let cachedTokenExp = 0

// 生成和风天气要求的 JWT：header.payload 用 base64url(JSON) 拼接，Ed25519(EdDSA) 签名
function getJWT() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedTokenExp - now > 60) {
    return cachedToken
  }

  const header = { alg: 'EdDSA', kid: QWEATHER_KEY_ID }
  const exp = now + 900 // 和风天气建议有效期不超过900秒（15分钟）
  const payload = { sub: QWEATHER_PROJECT_ID, iat: now, exp }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const privateKey = crypto.createPrivateKey(QWEATHER_PRIVATE_KEY)
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey) // Ed25519 无需指定摘要算法
  const encodedSignature = base64url(signature)

  cachedToken = `${signingInput}.${encodedSignature}`
  cachedTokenExp = exp
  return cachedToken
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 按二进制读取响应体并按 Content-Encoding 解压（服务端可能返回 gzip/br/deflate 压缩内容，
// 直接把字节流当字符串拼接会得到乱码，必须先解压再转成 UTF-8 文本）
function readBody(res) {
  return new Promise((resolve, reject) => {
    const chunks = []
    res.on('data', chunk => chunks.push(chunk))
    res.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const encoding = (res.headers['content-encoding'] || '').toLowerCase()
      try {
        let decoded
        if (encoding === 'gzip') {
          decoded = zlib.gunzipSync(buffer)
        } else if (encoding === 'br') {
          decoded = zlib.brotliDecompressSync(buffer)
        } else if (encoding === 'deflate') {
          decoded = zlib.inflateSync(buffer)
        } else {
          decoded = buffer
        }
        resolve(decoded.toString('utf8'))
      } catch (e) {
        reject(new Error('响应解压失败: ' + e.message))
      }
    })
    res.on('error', reject)
  })
}

exports.main = async (event, context) => {
  const { lat, lon } = event

  if (!QWEATHER_PROJECT_ID || !QWEATHER_KEY_ID || !QWEATHER_PRIVATE_KEY) {
    // 缺少JWT凭据时返回Mock数据，方便开发测试
    return getMockData(lat, lon)
  }

  // 和风天气 location 参数格式为 "经度,纬度"（顺序、分隔符均与心知天气不同，注意别搞反）
  const location = `${lon},${lat}`

  try {
    // 并发请求：实况天气 + 每日预报（和风免费版支持7天预报，比心知免费版的3天更宽裕）；城市名单独查，失败也不影响主流程
    const [nowRes, dailyRes, cityName] = await Promise.all([
      fetchQWeather('/v7/weather/now', location),
      fetchQWeather('/v7/weather/7d', location),
      lookupCityName(location).catch(err => {
        console.error('城市名查询失败(不影响主流程):', err.message)
        return ''
      })
    ])

    // 实况天气
    const now = nowRes.now
    // 只取前4天（今天+未来3天），与前端"未来三天天气"UI的展示量保持一致
    const daily = (dailyRes.daily || []).slice(0, 4)

    // 根据温度生成穿衣建议
    const temp = parseInt(now.temp)
    const advice = getAdviceByTemp(temp)
    const adviceTitle = getAdviceTitle(temp)

    // 紫外线指数：和风天气每日预报自带 uvIndex，比靠天气文字估算更准确
    const uvText = getUVTextByIndex(daily[0] && daily[0].uvIndex, now.text)

    return {
      code: 0,
      msg: 'success',
      data: {
        city: cityName || '',
        now: {
          temp: now.temp,
          feelsLike: now.feelsLike || now.temp,
          text: now.text,
          humidity: now.humidity,
          windScale: now.windScale,
          windDir: now.windDir
        },
        forecast: daily.map(item => ({
          date: item.fxDate,
          textDay: item.textDay,
          textNight: item.textNight,
          tempMax: item.tempMax,
          tempMin: item.tempMin
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

// 和风天气API请求（实况 /v7/weather/now、预报 /v7/weather/7d 通用），JWT 鉴权走 Authorization header
async function fetchQWeather(path, location) {
  const https = require('https')
  const url = `${API_HOST}${path}?location=${location}&lang=zh`
  const token = getJWT()

  console.error('=== 调试信息 ===')
  console.error('请求路径:', path)
  console.error('Location参数:', location)
  console.error('完整URL:', url.substring(0, 100) + '...')
  console.error('=================')

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, async (res) => {
      console.error('HTTP状态码:', res.statusCode, 'Content-Encoding:', res.headers['content-encoding'] || '(无)')

      let data
      try {
        data = await readBody(res)
      } catch (e) {
        reject(e)
        return
      }

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

        // 和风天气的响应格式:
        // 成功: {"code": "200", "now": {...}} 或 {"code": "200", "daily": [...]}
        // 失败: {"code": "401" / "402" / "403" / "404" / "429", ...}
        if (json.code !== '200') {
          console.error('API错误码:', json.code)
          reject(new Error(getQWeatherErrMsg(json.code)))
        } else {
          console.error('API调用成功')
          resolve(json)
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

// 和风天气错误码 -> 中文提示
function getQWeatherErrMsg(code) {
  switch (code) {
    case '401': return 'JWT鉴权失败，请检查凭据ID/项目ID/私钥是否匹配'
    case '402': return '请求次数超限或余额不足'
    case '403': return '无访问权限，请检查凭据绑定的域名/套餐'
    case '404': return '城市/位置不存在'
    case '429': return '请求过于频繁，请稍后再试'
    case '500': return '和风天气服务异常'
    default: return '未知错误(' + code + ')'
  }
}

// 逆地理编码查询城市名（和风天气 GeoAPI，与天气API共用同一专属Host和JWT鉴权）
async function lookupCityName(location) {
  const https = require('https')
  const url = `${API_HOST}/geo/v2/city/lookup?location=${location}&lang=zh`
  const token = getJWT()

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, async (res) => {
      let data
      try {
        data = await readBody(res)
      } catch (e) {
        console.error('城市名查询-读取响应失败:', e.message)
        reject(e)
        return
      }

      if (res.statusCode !== 200) {
        console.error('城市名查询-HTTP状态码异常:', res.statusCode, '响应:', data)
        reject(new Error('HTTP ' + res.statusCode))
        return
      }

      try {
        const json = JSON.parse(data)
        if (json.code === '200' && json.location && json.location.length > 0) {
          resolve(json.location[0].name)
        } else {
          console.error('城市名查询-业务错误码:', json.code, '完整响应:', JSON.stringify(json))
          reject(new Error(getQWeatherErrMsg(json.code) || '城市查询失败'))
        }
      } catch (e) {
        console.error('城市名查询-JSON解析失败, 原始数据:', data.substring(0, 200))
        reject(e)
      }
    })
    req.on('error', (e) => {
      console.error('城市名查询-请求失败:', e.message)
      reject(e)
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

// 紫外线指数：优先用和风天气预报自带的 uvIndex（0-11+ 数值），拿不到时退回按天气文字估算
function getUVTextByIndex(uvIndex, weatherText) {
  const idx = parseInt(uvIndex)
  if (!isNaN(idx)) {
    if (idx >= 8) return '很强'
    if (idx >= 6) return '强'
    if (idx >= 3) return '中等'
    return '弱'
  }
  return estimateUVIndex(weatherText)
}

// 估算紫外线指数（兜底：根据天气状况）
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

// Mock数据（无JWT凭据时使用）
function getMockData(lat, lon, errorMsg) {
  const mockTemp = 22
  const mockDate = new Date()
  const dates = []

  for (let i = 0; i < 4; i++) {
    const d = new Date(mockDate)
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }

  return {
    code: errorMsg ? -1 : 0,
    msg: errorMsg ? '使用Mock数据: ' + errorMsg : '使用Mock数据（未配置JWT凭据）',
    data: {
      city: '北京',
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
        { date: dates[2], textDay: '小雨', textNight: '多云', tempMax: '22', tempMin: '16' },
        { date: dates[3], textDay: '晴', textNight: '多云', tempMax: '24', tempMin: '17' }
      ],
      advice: '天气舒适，穿长袖衬衫或薄外套即可。',
      adviceTitle: '穿长袖',
      uvText: '中等',
      sportText: '较适宜',
      carWashText: '较适宜'
    }
  }
}
