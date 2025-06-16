/* eslint-disable no-console */
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { notificationModel } from '~/models/notificationModel'
import { userModel } from '~/models/userModel'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { cardModel } from '~/models/cardModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { env } from '~/config/environment'
import { GET_DB } from '~/config/mongodb'
import { cardDueDateFlagModel } from '~/models/cardDueDateFlag'
import moment from 'moment-timezone'
import { boardModel } from '~/models/boardModel'
import { ObjectId } from 'mongodb'

let io

export const setupNotificationSocket = (socketIo) => {
  io = socketIo
}

export const emitBatchEvent = (userId) => {
  if (io) {
    io.emit('FE_FETCH_NOTI', userId)
  } else {
    console.error('Socket.IO instance not initialized')
  }
}

const createNew = async (reqBody) => {
  try {
    // Xử lý logic dữ liệu
    const newNotification = {
      ...reqBody
    }

    const createNotification = await notificationModel.createNew(newNotification)
    if (createNotification.isExistInviteNotification) {
      throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'You have already sent an invitation to this user for this board')
    }

    if (createNotification.isExistRequestNotification) {
      throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'You have already sent a request to this board')
    }
    // // Lấy bản ghi board sau khi họi (tùy mục đích, có thể không cần)
    const getNewNotificationd = await notificationModel.findOneById(createNotification.insertedId)
    if (getNewNotificationd) {
      if (getNewNotificationd.type === 'inviteUserToBoard') {
        const invitee = await userModel.findOneById(getNewNotificationd.userId)

        if (!invitee) {
          throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
        }

        //Gửi email thông báo
        const customSubject = 'You have a new board invitation'
        const htmlContent = `
        <h1>You have a new board invitation</h1>
        <h3>Inviter: ${getNewNotificationd?.details?.senderName}</h3>
        <h3>Board: ${getNewNotificationd?.details?.boardTitle}</h3>
        <h3>Login to your account to accept or reject this invitation</h3>
        <h3>>${WEBSITE_DOMAIN}</h3>
      `
        await BrevoProvider.sendEmail(invitee.email, customSubject, htmlContent)
      }

      if (getNewNotificationd.type === 'requestToJoinBoard') {
        const boardOwner = await userModel.findOneById(getNewNotificationd?.userId)

        if (!boardOwner) {
          throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
        }

        //Gửi email thông báo
        const customSubject = 'You have a new board request'
        const htmlContent = `
        <h1>You have a new board request</h1>
        <h3>Requester: ${getNewNotificationd?.details?.senderName}</h3>
        <h3>Board: ${getNewNotificationd?.details?.boardTitle}</h3>
        <h3>Login to your account to accept or reject this request</h3>
        <h3>>${WEBSITE_DOMAIN}</h3>
      `
        await BrevoProvider.sendEmail(boardOwner.email, customSubject, htmlContent)
      }
    }
    return createNotification
  } catch (error) {
    throw new Error(error)
  }
}

const getNotifications = async (userId) => {
  try {
    const notifications = await notificationModel.getNotifications(userId)
    if (!notifications) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Notifications not found')
    }
    return notifications
  } catch (error) {
    throw new Error(error)
  }
}

const markAsReadAll = async (userId) => {
  try {
    const updatedNotification = await notificationModel.markAsReadAll(userId)
    if (!updatedNotification) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Notification not found')
    }
    return updatedNotification
  } catch (error) {
    throw new Error(error)
  }
}

const requestToJoinBoardStatus = async (userId, boardId) => {
  try {
    const notifications = await notificationModel.requestToJoinBoardStatus(userId, boardId)
    if (!notifications) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Notifications not founssd')
    }
    return notifications
  } catch (error) {
    throw new Error(error)
  }
}

const updateBoardInvitation = async (userId, notificationId, status) => {
  try {
    const updatedInvitation = await notificationModel.updateBoardInvitation(userId, notificationId, status)
    if (!updatedInvitation) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Notification not found')
    }
    return updatedInvitation
  } catch (error) {
    throw new Error(error)
  }
}

const updateBoardRequest = async (userId, notificationId, status) => {
  try {
    const updatedInvitation = await notificationModel.updateBoardRequest(userId, notificationId, status)
    if (!updatedInvitation) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Notification not found')
    }

    if (updatedInvitation.details.status === 'ACCEPTED') {

      const sender = await userModel.findOneById(updatedInvitation.details.senderId)
      // Gửi email thông báo
      const customSubject = 'Your board request has been accepted'
      const htmlContent = `
      <h1>Your board request has been accepted</h1>
      <h3>Board: ${updatedInvitation?.details?.boardTitle}</h3>
      <h3>Login to your account to start working on this board</h3>
      <h3>>${WEBSITE_DOMAIN}</h3>
    `
      await BrevoProvider.sendEmail(sender.email, customSubject, htmlContent)
    }
    return updatedInvitation
  } catch (error) {
    throw new Error(error)
  }
}

const sendDueDateNotification = async (cardId, type = 'card', checklistId = null, itemId = null) => {
  try {
    const card = await cardModel.findOneById(cardId)
    if (!card) {
      return
    }

    if (card.isCompleted) {
      return
    }

    // Chỉ xử lý phần card trước
    if (type === 'card') {
      if (!card.dueDate || !card.dueDate.dueDate) {
        return
      }

      const dueDate = card.dueDate.dueDate
      const dueDateTime = card.dueDate.dueDateTime
      // Nếu không có assignedUsers thì lấy tất cả members trong card
      const assignedUsers = card.memberIds && card.memberIds.length > 0 ? card.memberIds : card.memberIds

      if (!dueDate || assignedUsers.length === 0) {
        return
      }

      // Tạo đối tượng Date từ dueDate và dueDateTime với timezone Việt Nam
      let dueDateVN
      if (dueDateTime) {
        // Nếu có dueDateTime, kết hợp ngày và giờ
        const dateOnly = moment(dueDate).format('YYYY-MM-DD')
        dueDateVN = moment.tz(`${dateOnly} ${dueDateTime}`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh')
      } else {
        // Nếu không có dueDateTime, chỉ lấy ngày và set thời gian là 23:59
        dueDateVN = moment.tz(dueDate, 'Asia/Ho_Chi_Minh').endOf('day')
      }

      // Thời gian hiện tại theo timezone Việt Nam
      const nowVN = moment.tz('Asia/Ho_Chi_Minh')
      // Tính toán thời gian còn lại (tính bằng giờ)
      const hoursToDeadline = dueDateVN.diff(nowVN, 'hours', true)
      const notifications = card.dueDate.notifications || {}

      let shouldSendNotification = false
      let notificationStatus = ''
      let updateData = {}

      // Kiểm tra và gửi thông báo dựa trên thời gian
      if (hoursToDeadline <= 12 && hoursToDeadline > 0 && !notifications.reminder12h) {
        await sendNotificationEmails(assignedUsers, `Card "${card.title}" is approaching its deadline`, card, dueDate, dueDateTime, 'upcoming_12h')
        await sendNotificationInApp(assignedUsers, card, 'upcoming_12h')
        updateData['dueDate.notifications.reminder12h'] = true
        updateData['dueDate.notifications.lastNotified'] = new Date()
        shouldSendNotification = true
        notificationStatus = '12h reminder'
      } else if (hoursToDeadline <= 0 && !notifications.overdue) {
        await sendNotificationEmails(assignedUsers, `Card "${card.title}" is overdue`, card, dueDate, dueDateTime, 'overdue')
        await sendNotificationInApp(assignedUsers, card, 'overdue')
        updateData['dueDate.notifications.overdue'] = true
        updateData['dueDate.notifications.lastNotified'] = new Date()
        shouldSendNotification = true
        notificationStatus = 'overdue'
        await cardDueDateFlagModel.deleteCardDueDateFlag(cardId)
      } else {
        console.log('⏳ No notification needed or already sent')
      }

      // Cập nhật database nếu đã gửi notification
      if (shouldSendNotification) {
        await cardModel.update('system', cardId, updateData)
      }
    }

    // Chỉ xử lý phần checklist item sau
    if (type === 'checklistItem') {
      
      if (!checklistId || !itemId) {
        console.log('❌ Missing checklistId or itemId')
        return
      }

      // Tìm checklist và item
      const checklist = card.checklists.find(cl => cl._id.toString() === checklistId.toString())
      if (!checklist) {
        console.log('❌ Checklist not found:', checklistId)
        return
      }

      const item = checklist.items.find(it => it._id.toString() === itemId.toString())
      if (!item) {
        console.log('❌ Checklist item not found:', itemId)
        return
      }

      // Kiểm tra item đã completed chưa
      if (item.isChecked) {
        console.log('⏭️ Checklist item already completed')
        return
      }

      if (!item.dueDate) {
        console.log('❌ Checklist item has no due date')
        return
      }

      // Nếu không có assignedTo thì lấy tất cả members trong card
      const assignedUsers = item.assignedTo && item.assignedTo.length > 0 ? item.assignedTo : card.memberIds
      
      if (assignedUsers.length === 0) {
        console.log('❌ No assigned users for checklist item and no card members')
        return
      }

      // Tính toán thời gian còn lại cho checklist item
      let dueDateVN
      if (item.dueDateTime) {
        const dateOnly = moment(item.dueDate).format('YYYY-MM-DD')
        dueDateVN = moment.tz(`${dateOnly} ${item.dueDateTime}`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh')
      } else {
        dueDateVN = moment.tz(item.dueDate, 'Asia/Ho_Chi_Minh').endOf('day')
      }

      const nowVN = moment.tz('Asia/Ho_Chi_Minh')
      const hoursToDeadline = dueDateVN.diff(nowVN, 'hours', true)

      console.log(`⏰ Checklist item - Hours to deadline: ${hoursToDeadline.toFixed(2)} hours`)

      const notifications = item.notifications || {}
      let shouldSendNotification = false
      let notificationStatus = ''

      // Logic tương tự như card
      if (hoursToDeadline <= 12 && hoursToDeadline > 0 && !notifications.reminder12h) {
        console.log('📧 Sending 12h reminder for checklist item...')
        await sendChecklistItemNotificationEmails(assignedUsers, `Checklist item "${item.title}" sắp đến hạn`, card, checklist, item, 'upcoming_12h')
        await sendChecklistItemNotificationInApp(assignedUsers, card, checklist, item, 'upcoming_12h')

        // Cập nhật notifications cho item
        item.notifications = { ...notifications, reminder12h: true, lastNotified: new Date() }
        shouldSendNotification = true
        notificationStatus = '12h reminder'
      } else if (hoursToDeadline <= 0 && !notifications.overdue) {
        console.log('🚨 Sending overdue notification for checklist item...')
        await sendChecklistItemNotificationEmails(assignedUsers, `Checklist item "${item.title}" đã quá hạn`, card, checklist, item, 'overdue')
        await sendChecklistItemNotificationInApp(assignedUsers, card, checklist, item, 'overdue')

        // Cập nhật notifications cho item và xóa flag
        item.notifications = { ...notifications, overdue: true, lastNotified: new Date() }
        await cardDueDateFlagModel.deleteCardDueDateFlag(checklistId, itemId)
        shouldSendNotification = true
        notificationStatus = 'overdue'

      } else {
        console.log('⏳ No notification needed for checklist item or already sent')
      }

      // Cập nhật card với checklist item đã sửa đổi
      if (shouldSendNotification) {
        // Update the specific item in the checklist
        await GET_DB().collection('cards').updateOne(
          { 
            _id: new ObjectId(cardId),
            'checklists._id': new ObjectId(checklistId),
            'checklists.items._id': new ObjectId(itemId)
          },
          { 
            $set: { 
              'checklists.$[checklist].items.$[item].notifications': item.notifications
            }
          },
          {
            arrayFilters: [
              { 'checklist._id': new ObjectId(checklistId) },
              { 'item._id': new ObjectId(itemId) }
            ]
          }
        )
        console.log(`✅ Updated checklist item notification status: ${notificationStatus}`)
      }
    }

  } catch (error) {
    console.error('❌ Error sending due date notification:', error)
  }
}

const sendChecklistItemNotificationEmails = async (userIds, title, card, checklist, item, status) => {
  try {
    for (const userId of userIds) {
      const user = await userModel.findOneById(userId)
      if (!user) continue

      // Format thời gian theo timezone Việt Nam
      let dueDateFormatted, dueTimeFormatted
      if (item.dueDateTime) {
        const dateOnly = moment(item.dueDate).format('YYYY-MM-DD')
        const dueDateVN = moment.tz(`${dateOnly} ${item.dueDateTime}`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh')
        dueDateFormatted = dueDateVN.format('DD/MM/YYYY')
        dueTimeFormatted = dueDateVN.format('HH:mm')
      } else {
        const dueDateVN = moment.tz(item.dueDate, 'Asia/Ho_Chi_Minh')
        dueDateFormatted = dueDateVN.format('DD/MM/YYYY')
        dueTimeFormatted = ''
      }

      let subject = ''
      let htmlContent = ''

      if (status === 'upcoming_12h') {
        subject = `⏰ Reminder: ${title} (12 hours left)`
        htmlContent = `
          <h2>🔔 Upcoming deadline notification (12 hours) - Checklist Item</h2>
          <p><strong>${title}</strong></p>
          <p><strong>Deadline:</strong> ${dueDateFormatted} ${dueTimeFormatted}</p>
          <p><strong>Card:</strong> ${card.title}</p>
          <p><strong>Checklist:</strong> ${checklist.title}</p>
          <p><strong>Item:</strong> ${item.title}</p>
          <p>You have 12 hours left to complete this task!</p>
          <p><a href="${WEBSITE_DOMAIN}/board/${card.boardId}/card/${card._id}">View card details</a></p>
        `
      } else if (status === 'overdue') {
        subject = `🚨 Alert: ${title} - OVERDUE`
        htmlContent = `
          <h2>🚨 Overdue alert! - Checklist Item</h2>
          <p><strong>${title}</strong></p>
          <p><strong>Deadline:</strong> ${dueDateFormatted} ${dueTimeFormatted}</p>
          <p><strong>Card:</strong> ${card.title}</p>
          <p><strong>Checklist:</strong> ${checklist.title}</p>
          <p><strong>Item:</strong> ${item.title}</p>
          <p style="color: red;">⚠️ This task is overdue. Please handle it immediately!</p>
          <p><a href="${WEBSITE_DOMAIN}/board/${card.boardId}/card/${card._id}">View card details</a></p>
        `
      }

      await BrevoProvider.sendEmail(user.email, subject, htmlContent)
      console.log(`📧 Checklist item email sent to: ${user.email}`)
    }
  } catch (error) {
    console.error('Error sending checklist item notification emails:', error)
  }
}

const sendChecklistItemNotificationInApp = async (userIds, card, checklist, item, status) => {
  try {
    const board = await boardModel.findOneById(card.boardId)
    for (const userId of userIds) {
      const user = await userModel.findOneById(userId)
      if (!user) continue

      if (status === 'upcoming_12h') {
        await notificationService.createNew({
          userId: userId.toString(),
          type: 'reminderDueDateInChecklistItem',
          details: {
            boardId: card.boardId.toString(),
            boardTitle: board.title,
            cardId: card._id.toString(),
            cardTitle: card.title,
            checklistTitle: checklist.title,
            checklistItemTitle: item.title
          }
        })
        emitBatchEvent(userId)
      } else if (status === 'overdue') {
        await notificationService.createNew({
          userId: userId.toString(),
          type: 'alertOverDueDateInChecklistItem',
          details: {
            boardId: card.boardId.toString(),
            boardTitle: board.title,
            cardId: card._id.toString(),
            cardTitle: card.title,
            checklistTitle: checklist.title,
            checklistItemTitle: item.title
          }
        })
        emitBatchEvent(userId)
      }
    }
  } catch (error) {
    console.error('❌ Error sending checklist item notification in app:', error)
  }
}


const sendNotificationInApp = async (userIds, card, status) => {
  try {
    const board = await boardModel.findOneById(card.boardId)
    for (const userId of userIds) {
      const user = await userModel.findOneById(userId)
      if (!user) continue

      if (status === 'upcoming_12h') {
        await notificationService.createNew({
          userId: userId.toString(),
          type: 'reminderDueDateInCard',
          details: {
            boardId: card.boardId.toString(),
            boardTitle: board.title,
            cardId: card._id.toString(),
            cardTitle: card.title
          }
        })
        emitBatchEvent(userId)
      } else if (status === 'overdue') {
        await notificationService.createNew({
          userId: userId.toString(),
          type: 'alertOverDueDateInCard',
          details: {
            boardId: card.boardId.toString(),
            boardTitle: board.title,
            cardId: card._id.toString(),
            cardTitle: card.title
          }
        })
        emitBatchEvent(userId)
      }
    }
  } catch (error) {
    console.error('❌ Error sending notification in app:', error)
  }
}

const sendNotificationEmails = async (userIds, title, card, dueDate, dueDateTime, status) => {
  try {
    for (const userId of userIds) {
      const user = await userModel.findOneById(userId)
      if (!user) continue

      // Format thời gian theo timezone Việt Nam
      let dueDateFormatted, dueTimeFormatted
      if (dueDateTime) {
        const dateOnly = moment(dueDate).format('YYYY-MM-DD')
        const dueDateVN = moment.tz(`${dateOnly} ${dueDateTime}`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh')
        dueDateFormatted = dueDateVN.format('DD/MM/YYYY')
        dueTimeFormatted = dueDateVN.format('HH:mm')
      } else {
        const dueDateVN = moment.tz(dueDate, 'Asia/Ho_Chi_Minh')
        dueDateFormatted = dueDateVN.format('DD/MM/YYYY')
        dueTimeFormatted = ''
      }

      let subject = ''
      let htmlContent = ''

      if (status === 'upcoming_12h') {
        subject = `⏰ Reminder: ${title}`
        htmlContent = `
          <h2>🔔 Upcoming deadline notification (12 hours)</h2>
          <p><strong>${title}</strong></p>
          <p><strong>Due date:</strong> ${dueDateFormatted} ${dueTimeFormatted}</p>
          <p><strong>Card:</strong> ${card.title}</p>
          <p>You have 12 hours to complete this task!</p>
          <p><a href="${WEBSITE_DOMAIN}/board/${card.boardId}/card/${card._id}">View card details</a></p>
        `
      } else if (status === 'overdue') {
        subject = `🚨 Alert: ${title} - OVERDUE`
        htmlContent = `
          <h2>🚨 Overdue notification!</h2>
          <p><strong>${title}</strong></p>
          <p><strong>Due date:</strong> ${dueDateFormatted} ${dueTimeFormatted}</p>
          <p><strong>Card:</strong> ${card.title}</p>
          <p style="color: red;">⚠️ This task is overdue. Please handle it immediately!</p>
          <p><a href="${WEBSITE_DOMAIN}/board/${card.boardId}/card/${card._id}">View card details</a></p>
        `
      }

      await BrevoProvider.sendEmail(user.email, subject, htmlContent)
      console.log(`📧 Email sent to: ${user.email}`)
    }
  } catch (error) {
    console.error('Error sending notification emails:', error)
  }
}

// Function để check tất cả due dates trong hệ thống
const checkAllDueDates = async () => {
  try {
    // Lấy tất cả card due date flags
    const cardFlags = await GET_DB().collection('cardDueDateFlags').find({}).toArray()

    console.log('🔍 Card flags:', cardFlags)
    for (const flag of cardFlags) {
      if (flag.type === 'card') {
        // Check card due date từ flag
        await sendDueDateNotification(flag.cardId, 'card')
      } else if (flag.type === 'checklistItem') {
        // Check checklist item due date từ flag
        await sendDueDateNotification(flag.cardId, 'checklistItem', flag.checklistId, flag.itemId)
      }
    }
  } catch (error) {
    console.error('Error checking all due dates:', error)
  }
}

export const notificationService = {
  createNew, getNotifications, markAsReadAll, requestToJoinBoardStatus, updateBoardInvitation, updateBoardRequest,
  sendDueDateNotification, checkAllDueDates
}
