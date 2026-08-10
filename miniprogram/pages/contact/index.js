// pages/contact/index.js
const { getContacts, addContact, updateContact, deleteContact, togglePin } = require('../../utils/contact.js')

// 中国大陆手机号校验
const PHONE_REG = /^1[3-9]\d{9}$/

Page({
  data: {
    contacts: [],
    loading: false,
    showDialog: false,
    dialogMode: 'add', // 'add' | 'edit'
    editingId: '',
    submitting: false,
    showActionSheet: false,
    currentContact: {},
    contactImgStatus: {},     // 列表头像加载状态映射 { [_id]: 'loaded' | 'error' }，未出现的 key 视为加载中
    avatarPreviewLoaded: false, // 弹窗头像预览是否已加载完成
    avatarPreviewError: false,  // 弹窗头像预览是否加载失败
    newContact: {
      name: '',
      phone: '',
      avatarFileId: '',     // 已上传的云存储 fileID（编辑模式初始值）
      avatarTempPath: ''    // 新选择的本地临时路径（预览用）
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadContacts()
  },

  async onPullDownRefresh() {
    await this.loadContacts()
    wx.stopPullDownRefresh()
  },

  async loadContacts() {
    // 页面当前完全没有数据（冷启动/实例被回收重建）时，先用本地缓存秒开，避免转圈；
    // 已有数据（切 tab 回来）则保持现状，不受影响
    const hasData = this.data.contacts.length > 0
    let usedCache = false

    if (!hasData) {
      const cache = wx.getStorageSync('contacts_cache')
      if (cache && Array.isArray(cache.data)) {
        this.setData({ contacts: cache.data, contactImgStatus: {}, loading: false })
        usedCache = true
      } else {
        this.setData({ loading: true })
      }
    }

    try {
      const result = await getContacts()
      if (result.code === 0 && result.data) {
        this.setData({ contacts: result.data, contactImgStatus: {} })
        wx.setStorageSync('contacts_cache', { data: result.data })
      } else if (!hasData && !usedCache) {
        this.setData({ contacts: [] })
        if (result.code !== 0) {
          wx.showToast({ title: result.msg || '获取联系人失败', icon: 'none' })
        }
      }
    } catch (err) {
      console.error('获取联系人失败:', err)
      // 已经展示着数据（内存或缓存）时静默失败，避免频繁打扰；完全没数据才提示
      if (!hasData && !usedCache) {
        this.setData({ contacts: [] })
        wx.showToast({ title: '获取联系人失败', icon: 'none' })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  // 点击列表项 → 直接拨号（使用系统原生弹窗）
  onContactTap(e) {
    const { id } = e.currentTarget.dataset
    const contact = this.data.contacts.find(c => c._id === id)
    if (!contact) return

    wx.makePhoneCall({
      phoneNumber: contact.phone,
      fail: () => {
        wx.showToast({ title: '已取消拨号', icon: 'none' })
      }
    })
  },

  // 长按列表项 → 操作菜单
  onContactLongPress(e) {
    const { id } = e.currentTarget.dataset
    const contact = this.data.contacts.find(c => c._id === id)
    if (!contact) return

    this.setData({
      showActionSheet: true,
      currentContact: contact
    })
  },

  hideActionSheet() {
    this.setData({ showActionSheet: false })
  },

  async togglePinContact() {
    const { currentContact } = this.data
    if (!currentContact || !currentContact._id) return

    try {
      const result = await togglePin(currentContact._id)
      if (result.code === 0) {
        wx.showToast({ title: result.data.isPinned ? '已置顶' : '已取消置顶', icon: 'success' })
        this.setData({ showActionSheet: false })
        this.loadContacts()
      } else {
        wx.showToast({ title: result.msg || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('切换置顶失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  editContact() {
    const { currentContact } = this.data
    this.setData({
      showActionSheet: false,
      showDialog: true,
      dialogMode: 'edit',
      editingId: currentContact._id,
      avatarPreviewLoaded: false,
      avatarPreviewError: false,
      newContact: {
        name: currentContact.name,
        phone: currentContact.phone,
        avatarFileId: currentContact.avatarFileId || '',
        avatarTempPath: ''
      }
    })
  },

  deleteContact() {
    const { currentContact } = this.data

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${currentContact.name}」吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await deleteContact(currentContact._id)
            if (result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.setData({ showActionSheet: false })
              this.loadContacts()
            } else {
              wx.showToast({ title: result.msg || '删除失败', icon: 'none' })
            }
          } catch (err) {
            console.error('删除失败:', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  showAddDialog() {
    this.setData({
      showDialog: true,
      dialogMode: 'add',
      editingId: '',
      avatarPreviewLoaded: false,
      avatarPreviewError: false,
      newContact: {
        name: '',
        phone: '',
        avatarFileId: '',
        avatarTempPath: ''
      }
    })
  },

  hideAddDialog() {
    this.setData({ showDialog: false })
  },

  onDialogTap() {},

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`newContact.${field}`]: e.detail.value })
  },

  // 选择头像图片
  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          'newContact.avatarTempPath': tempFilePath,
          avatarPreviewLoaded: false,
          avatarPreviewError: false
        })
      },
      fail: () => {
        // 用户取消，不提示
      }
    })
  },

  // 移除已选头像
  onRemoveAvatar() {
    this.setData({
      'newContact.avatarTempPath': '',
      'newContact.avatarFileId': '',
      avatarPreviewLoaded: false,
      avatarPreviewError: false
    })
  },

  // 列表头像加载完成/失败
  onAvatarImgLoad(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ [`contactImgStatus.${id}`]: 'loaded' })
  },
  onAvatarImgError(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ [`contactImgStatus.${id}`]: 'error' })
  },

  // 弹窗头像预览加载完成/失败
  onAvatarPreviewLoad() {
    this.setData({ avatarPreviewLoaded: true, avatarPreviewError: false })
  },
  onAvatarPreviewError() {
    this.setData({ avatarPreviewError: true, avatarPreviewLoaded: false })
  },

  async confirmAdd() {
    if (this.data.submitting) return

    const { name, phone, avatarFileId, avatarTempPath } = this.data.newContact
    const { dialogMode, editingId } = this.data

    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!phone || !PHONE_REG.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...', mask: true })

    try {
      let finalAvatarFileId = avatarFileId || ''

      // 若新选了头像，先上传云存储
      if (avatarTempPath) {
        const cloudPath = `contacts/${Date.now()}_${Math.floor(Math.random() * 1000)}.png`
        const uploadRes = await new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath,
            filePath: avatarTempPath,
            success: resolve,
            fail: reject
          })
        })
        finalAvatarFileId = uploadRes.fileID
      }

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        avatarFileId: finalAvatarFileId
      }

      if (dialogMode === 'edit') {
        const result = await updateContact(editingId, payload)
        if (result.code === 0) {
          wx.showToast({ title: '修改成功', icon: 'success' })
          this.setData({ showDialog: false })
          this.loadContacts()
        } else {
          wx.showToast({ title: result.msg || '修改失败', icon: 'none' })
        }
      } else {
        const result = await addContact(payload)
        if (result.code === 0) {
          wx.showToast({ title: '添加成功', icon: 'success' })
          this.setData({ showDialog: false })
          this.loadContacts()
        } else {
          wx.showToast({ title: result.msg || '添加失败', icon: 'none' })
        }
      }
    } catch (err) {
      console.error(dialogMode === 'edit' ? '修改联系人失败:' : '添加联系人失败:', err)
      wx.showToast({ title: dialogMode === 'edit' ? '修改失败' : '添加失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
      wx.hideLoading()
    }
  }
})
