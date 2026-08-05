// pages/contact/index.js
const { getContacts, addContact, updateContact, deleteContact } = require('../../utils/contact.js')

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
    this.setData({ loading: true })
    try {
      const result = await getContacts()
      if (result.code === 0 && result.data) {
        this.setData({ contacts: result.data })
      } else {
        this.setData({ contacts: [] })
        if (result.code !== 0) {
          wx.showToast({ title: result.msg || '获取联系人失败', icon: 'none' })
        }
      }
    } catch (err) {
      console.error('获取联系人失败:', err)
      this.setData({ contacts: [] })
      wx.showToast({ title: '获取联系人失败', icon: 'none' })
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

  editContact() {
    const { currentContact } = this.data
    this.setData({
      showActionSheet: false,
      showDialog: true,
      dialogMode: 'edit',
      editingId: currentContact._id,
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
        this.setData({ 'newContact.avatarTempPath': tempFilePath })
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
      'newContact.avatarFileId': ''
    })
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
