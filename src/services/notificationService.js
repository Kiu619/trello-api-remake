import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { notificationModel } from '~/models/notificationModel'
import { userModel } from '~/models/userModel'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { BrevoProvider } from '~/providers/BrevoProvider'

const createNew = async ( reqBody ) => {
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
        await BrevoProvider .sendEmail(invitee.email, customSubject, htmlContent)
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

export const notificationService = {
  createNew, getNotifications, markAsReadAll, requestToJoinBoardStatus, updateBoardInvitation, updateBoardRequest
}
