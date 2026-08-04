// pages/medication/index.js
const { getMedications, addMedication, updateMedStatus, updateMedication, deleteMedication, requestSubscribe } = require('../../utils/medication.js')

// 订阅消息模板ID（TODO: 替换为你的模板ID）
const TEMPLATE_ID = 'your-template-id'

// 时段配置
const PERIOD_OPTIONS = ['早餐前', '早餐后', '午餐前', '午餐后', '晚餐前', '晚餐后', '睡前']

// 根据时间段获取图标
function getPeriodIcon(periodLabel) {
  if (!periodLabel) return '💊'
  if (periodLabel.includes('早') || periodLabel.includes('早餐')) return '☀️'
  if (periodLabel.includes('午') || periodLabel.includes('午餐')) return '🌤️'
  if (periodLabel.includes('晚') || periodLabel.includes('晚餐')) return '🌙'
  if (periodLabel.includes('睡前') || periodLabel.includes('睡')) return '🌙'
  return '💊'
}

// 根据时间计算时段标签
function getPeriodByTime(time) {
  const hour = parseInt(time.split(':')[0])
  if (hour < 6) return '凌晨'
  if (hour < 9) return '早餐后'
  if (hour < 12) return '上午'
  if (hour < 14) return '午餐后'
  if (hour < 18) return '下午'
  if (hour < 21) return '晚餐后'
  return '睡前'
}

// 格式化日期
function formatDate() {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${month}月${day}日 ${weekDays[now.getDay()]}`
}

function formatDateShort() {
  const now = new Date()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekDays[now.getDay()]}`
}

// 计算倒计时文案
function calcCountdown(targetTime) {
  const now = new Date()
  const [h, m] = targetTime.split(':').map(Number)
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  
  let diff = target - now
  if (diff < 0) {
    // 如果时间已过，检查是否已服用
    return '已过服药时间'
  }
  
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  
  if (hours > 0) {
    return `还有${hours}小时${minutes}分钟`
  } else {
    return `还有${minutes}分钟`
  }
}

// 判断时间戳是否为今天
function isToday(timestamp) {
  if (!timestamp) return false
  const date = new Date(timestamp)
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

// 获取状态类型和标签
function getStatusInfo(med) {
  const now = new Date()
  const [h, m] = med.time.split(':').map(Number)
  const targetMinutes = h * 60 + m
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // 已服用：status为taken且takenAt是今天
  if (med.status === 'taken' && isToday(med.takenAt)) {
    return { statusType: 'taken', statusLabel: '已服用' }
  }

  if (currentMinutes >= targetMinutes) {
    // 已过服药时间但未服用
    return { statusType: 'pending', statusLabel: '待服用' }
  } else {
    // 未到服药时间
    return { statusType: 'upcoming', statusLabel: '未到时间' }
  }
}

// Mock数据（无云端数据时使用）
function getMockData() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  
  return [
    {
      _id: 'mock1',
      name: '降压片',
      dosage: '1片',
      time: '08:00',
      periodLabel: '早餐后',
      status: 'taken',
      takenAt: Date.now()
    },
    {
      _id: 'mock2',
      name: '维生素B族',
      dosage: '1片',
      time: '12:30',
      periodLabel: '午餐后',
      status: 'pending'
    },
    {
      _id: 'mock3',
      name: '钙片',
      dosage: '1片',
      time: '18:30',
      periodLabel: '晚餐后',
      status: 'pending'
    },
    {
      _id: 'mock4',
      name: '助眠片',
      dosage: '1片',
      time: '21:00',
      periodLabel: '睡前',
      status: 'pending'
    }
  ]
}

Page({
  data: {
    dateStr: formatDate(),
    dateShort: formatDateShort(),
    medications: [],
    nextMed: null,
    countdown: '',
    isUrgent: false,
    showDialog: false,
    showActionSheet: false,
    currentMed: {},
    dialogMode: 'add',
    editingId: '',
    loading: false,
    periodOptions: PERIOD_OPTIONS,
    periodIndex: 0,
    newMed: {
      name: '',
      dosage: '',
      time: '08:00',
      periodLabel: '早餐后'
    },
    isMock: false
  },

  onLoad() {
    this.loadMedications()
    this.startCountdownTimer()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.loadMedications()
    this.startCountdownTimer()
  },

  onHide() {
    this.stopCountdownTimer()
  },

  onUnload() {
    this.stopCountdownTimer()
  },

  startCountdownTimer() {
    this.stopCountdownTimer()
    this.countdownTimer = setInterval(() => {
      this.updateCountdown()
    }, 30000)
    this.updateCountdown()
  },

  stopCountdownTimer() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
  },

  updateCountdown() {
    const { nextMed } = this.data
    if (!nextMed) return
    
    const countdown = calcCountdown(nextMed.time)
    const isUrgent = countdown.includes('分钟') && !countdown.includes('小时')
    
    this.setData({ countdown, isUrgent })
  },

  async loadMedications() {
    this.setData({ loading: true })
    try {
      const result = await getMedications()
      if (result.code === 0 && result.data && result.data.length > 0) {
        const meds = result.data
        this.processMedications(meds, false)
      } else {
        // 使用Mock数据
        const mockMeds = getMockData()
        this.processMedications(mockMeds, true)
      }
    } catch (err) {
      console.error('获取用药列表失败:', err)
      const mockMeds = getMockData()
      this.processMedications(mockMeds, true)
    } finally {
      this.setData({ loading: false })
    }
  },

  async onPullDownRefresh() {
    await this.loadMedications()
    wx.stopPullDownRefresh()
  },

  processMedications(meds, isMock) {
    // 处理每条药品记录
    const processedMeds = meds.map(med => {
      const statusInfo = getStatusInfo(med)
      const periodIcon = getPeriodIcon(med.periodLabel)
      return {
        ...med,
        periodIcon,
        statusType: statusInfo.statusType,
        statusLabel: statusInfo.statusLabel
      }
    })

    // 排序规则：未服用在前，已服用在后；同组内按时间升序
    processedMeds.sort((a, b) => {
      const aTaken = (a.status === 'taken' && isToday(a.takenAt)) ? 1 : 0
      const bTaken = (b.status === 'taken' && isToday(b.takenAt)) ? 1 : 0
      if (aTaken !== bTaken) {
        return aTaken - bTaken  // 未服用(0)在前，已服用(1)在后
      }
      return a.time.localeCompare(b.time)  // 同组内按时间升序
    })

    // 找出下一次服药（未服用且时间最近的）
    const nextMed = this.findNextMedication(processedMeds)
    let countdown = ''
    let isUrgent = false
    
    if (nextMed) {
      countdown = calcCountdown(nextMed.time)
      isUrgent = countdown.includes('分钟') && !countdown.includes('小时')
    }

    this.setData({
      medications: processedMeds,
      nextMed,
      countdown,
      isUrgent,
      isMock: isMock
    })
  },

  findNextMedication(meds) {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // 判断是否未服用（status非taken，或takenAt不是今天）
    const isNotTakenToday = (item) => !(item.status === 'taken' && isToday(item.takenAt))

    // 找待服用且时间最近的
    const pendingMeds = meds.filter(item => {
      const [h, min] = item.time.split(':').map(Number)
      const medMinutes = h * 60 + min
      return isNotTakenToday(item) && medMinutes >= currentMinutes
    })

    if (pendingMeds.length > 0) {
      return pendingMeds[0]
    }

    // 如果没有未来的时间，找最近的过去时间
    const pastMeds = meds.filter(m => isNotTakenToday(m))
    if (pastMeds.length > 0) {
      return pastMeds[0]
    }

    // 如果都已服用，返回第一条
    return meds[0] || null
  },

  onMedTap(e) {
    const { id } = e.currentTarget.dataset
    const med = this.data.medications.find(m => m._id === id)
    if (!med) return
    
    this.setData({
      showActionSheet: true,
      currentMed: med
    })
  },

  hideActionSheet() {
    this.setData({ showActionSheet: false })
  },

  async toggleTakenStatus(medId) {
    const { isMock } = this.data
    const targetId = medId || (this.data.currentMed && this.data.currentMed._id)
    if (!targetId) return

    const med = this.data.medications.find(m => m._id === targetId)
    if (!med) return

    // 已服用：status===taken 且 takenAt 是今天
    const isTakenToday = med.status === 'taken' && isToday(med.takenAt)
    const newStatus = isTakenToday ? 'pending' : 'taken'

    if (isMock) {
      // Mock模式：本地更新status和takenAt
      const meds = this.data.medications.map(m =>
        m._id === targetId
          ? { ...m, status: newStatus, takenAt: newStatus === 'taken' ? Date.now() : null }
          : m
      )
      this.processMedications(meds, true)
      wx.showToast({ title: newStatus === 'taken' ? '已标记' : '已取消', icon: 'success' })
      return
    }

    try {
      const result = await updateMedStatus(targetId, newStatus)
      if (result.code === 0) {
        if (newStatus === 'taken') {
          requestSubscribe(TEMPLATE_ID)
        }
        wx.showToast({ title: newStatus === 'taken' ? '已标记' : '已取消', icon: 'success' })
        this.loadMedications()
      }
    } catch (err) {
      console.error('更新状态失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  toggleTakenFromCheckbox(e) {
    const { id } = e.currentTarget.dataset
    this.toggleTakenStatus(id)
  },

  async markAsTaken() {
    await this.toggleTakenStatus(this.data.currentMed && this.data.currentMed._id)
    this.setData({ showActionSheet: false })
  },

  async deleteMed() {
    const { currentMed, isMock } = this.data

    if (isMock) {
      wx.showToast({ title: '示例数据不可删除', icon: 'none' })
      this.setData({ showActionSheet: false })
      return
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${currentMed.name}」吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await deleteMedication(currentMed._id)
            if (result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.setData({ showActionSheet: false })
              this.loadMedications()
            }
          } catch (err) {
            console.error('删除失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  editMed() {
    const { currentMed } = this.data
    const periodIndex = PERIOD_OPTIONS.findIndex(p => p === currentMed.periodLabel)
    this.setData({
      showActionSheet: false,
      showDialog: true,
      dialogMode: 'edit',
      editingId: currentMed._id,
      periodIndex: periodIndex >= 0 ? periodIndex : 0,
      newMed: {
        name: currentMed.name,
        dosage: currentMed.dosage,
        time: currentMed.time,
        periodLabel: currentMed.periodLabel
      }
    })
  },

  onNextMedTap() {
    const { nextMed } = this.data
    if (!nextMed) return
    
    // 滚动到列表第一项并打开操作
    const med = this.data.medications.find(m => m._id === nextMed._id)
    if (med) {
      this.setData({
        showActionSheet: true,
        currentMed: med
      })
    }
  },

  showAddDialog() {
    const now = new Date()
    const hour = now.getHours()
    const periodIndex = PERIOD_OPTIONS.findIndex(p => {
      if (hour < 9) return p.includes('早')
      if (hour < 14) return p.includes('午')
      if (hour < 21) return p.includes('晚')
      return p.includes('睡前')
    })
    
    this.setData({
      showDialog: true,
      dialogMode: 'add',
      editingId: '',
      periodIndex: periodIndex >= 0 ? periodIndex : 0,
      newMed: {
        name: '',
        dosage: '',
        time: `${String(hour).padStart(2, '0')}:00`,
        periodLabel: PERIOD_OPTIONS[periodIndex >= 0 ? periodIndex : 0]
      }
    })
  },

  hideAddDialog() {
    this.setData({ showDialog: false })
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`newMed.${field}`]: e.detail.value })
  },

  onTimeChange(e) {
    const time = e.detail.value
    const periodLabel = getPeriodByTime(time)
    this.setData({
      'newMed.time': time,
      'newMed.periodLabel': periodLabel
    })
    
    // 更新时段选择器
    const periodIndex = PERIOD_OPTIONS.findIndex(p => p === periodLabel)
    if (periodIndex >= 0) {
      this.setData({ periodIndex })
    }
  },

  onPeriodChange(e) {
    const index = e.detail.value
    this.setData({
      periodIndex: index,
      'newMed.periodLabel': PERIOD_OPTIONS[index]
    })
  },

  async confirmAdd() {
    const { name, dosage, time, periodLabel } = this.data.newMed
    const { dialogMode, editingId } = this.data

    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入药品名称', icon: 'none' })
      return
    }
    if (!time) {
      wx.showToast({ title: '请选择服药时间', icon: 'none' })
      return
    }

    if (this.data.isMock) {
      wx.showToast({ title: '请先配置数据', icon: 'none' })
      return
    }

    // 检查重复（仅添加模式）
    if (dialogMode === 'add') {
      const exists = this.data.medications.find(m =>
        m.name === name.trim() && m.time === time
      )
      if (exists) {
        wx.showToast({ title: '该药品已存在相同时间记录', icon: 'none' })
        return
      }
    }

    try {
      if (dialogMode === 'edit') {
        const result = await updateMedication(editingId, {
          name: name.trim(),
          dosage: dosage.trim() || '按医嘱服用',
          time,
          periodLabel: periodLabel.trim() || '按时服药'
        })
        if (result.code === 0) {
          wx.showToast({ title: '修改成功', icon: 'success' })
          this.setData({ showDialog: false })
          this.loadMedications()
        } else {
          wx.showToast({ title: result.msg || '修改失败，请重试', icon: 'none' })
        }
      } else {
        await requestSubscribe(TEMPLATE_ID)

        const result = await addMedication({
          name: name.trim(),
          dosage: dosage.trim() || '按医嘱服用',
          time,
          periodLabel: periodLabel.trim() || '按时服药',
          status: 'pending',
          subscribeCount: 1
        })

        if (result.code === 0) {
          wx.showToast({ title: '添加成功', icon: 'success' })
          this.setData({ showDialog: false })
          this.loadMedications()
        }
      }
    } catch (err) {
      console.error(dialogMode === 'edit' ? '修改药物失败:' : '添加药物失败:', err)
      wx.showToast({ title: dialogMode === 'edit' ? '修改失败' : '添加失败', icon: 'none' })
    }
  }
})
