import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { BOARD_INVITATION_STATUS } from '~/utils/constants'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { INVITATION_COLLECTION_SCHEMA } from './invitationModel'
import { boardModel } from './boardModel'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const INVITE_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required(),
  status: Joi.string().required().valid(...Object.values(BOARD_INVITATION_STATUS))
})

const MENTION_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  cardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  cardTitle: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required()
})

const ASSIGNMENT_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  cardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  cardTitle: Joi.string().required(),
  checklistTitle: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required()
})

const ATTACHMENT_IN_CARD_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  cardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  cardTitle: Joi.string().required(),
  attachmentName: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required()
})

const ACTIVITY_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required(),
  action: Joi.string().required(),
  target: Joi.string().required()
})

const REQUEST_TO_JOIN_BOARD_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required(),
  status: Joi.string().required().valid(...Object.values(BOARD_INVITATION_STATUS))
})

const ACCEPTED_REQUEST_TO_JOIN_BOARD_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required()
})

const DUEDATE_IN_CARD_NOTIFICATION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardTitle: Joi.string().required(),
  cardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  cardTitle: Joi.string().required(),
  senderId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  senderName: Joi.string().required()
})

const NOTIFICATION_SCHEMAS = {
  inviteUserToBoard: INVITE_NOTIFICATION_SCHEMA,
  mention: MENTION_NOTIFICATION_SCHEMA,
  assignment: ASSIGNMENT_NOTIFICATION_SCHEMA,
  attachmentInCard: ATTACHMENT_IN_CARD_NOTIFICATION_SCHEMA,
  activity: ACTIVITY_NOTIFICATION_SCHEMA,
  requestToJoinBoard: REQUEST_TO_JOIN_BOARD_NOTIFICATION_SCHEMA,
  acceptedRequestToJoinBoard: ACCEPTED_REQUEST_TO_JOIN_BOARD_NOTIFICATION_SCHEMA,
  dueDateInCard: DUEDATE_IN_CARD_NOTIFICATION_SCHEMA
}

export const NOTIFICATION_COLLECTION_NAME = 'notifications'
const NOTIFICATION_COLLECTION_SCHEMA = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string().valid(...Object.keys(NOTIFICATION_SCHEMAS)).required(),
  isRead: Joi.boolean().default(false),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false),

  // Additional fields based on the type of the notification
  details: Joi.alternatives().conditional('type', {
    switch: Object.entries(NOTIFICATION_SCHEMAS).map(([type, schema]) => ({
      is: type,
      then: schema
    }))
  })
})

const validateBeforeCreate = async (data) => {
  return await NOTIFICATION_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newNotificationToAdd = {
      ...validData,
      userId: new ObjectId(validData.userId)
    }

    // // Nếu đã gửi invite rồi thì không tạo mới nữa ( trừ khi bị reject )
    if (validData?.type === 'inviteUserToBoard') {
      const isExistInviteNotification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOne({
        userId: new ObjectId(validData.userId),
        'details.boardId': validData.details.boardId,
        'details.status': BOARD_INVITATION_STATUS.PENDING
      })

      if (isExistInviteNotification) {
        return { isExistInviteNotification: true }
      }
    }

    // // Nếu đã gửi request rồi thì không tạo mới nữa ( trừ khi bị reject )
    if (validData?.type === 'requestToJoinBoard') {
      const isExistRequestNotification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOne({
        userId: new ObjectId(validData.userId),
        'details.boardId': validData.details.boardId,
        'details.status': BOARD_INVITATION_STATUS.PENDING
      })

      if (isExistRequestNotification) {
        return { isExistRequestNotification: true }
      }
    }

    const newNotification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).insertOne(newNotificationToAdd)
    return newNotification
  } catch (error) {
    throw new Error(error)
  }
}

const getNotifications = async (userId) => {
  try {
    const notifications = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).find({ userId: new ObjectId(userId), _destroy: false }).toArray()
    return notifications
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (notificationId) => {
  try {
    const notification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOne({ _id: new ObjectId(notificationId) })
    return notification
  } catch (error) {
    throw new Error(error)
  }
}

const markAsReadAll = async (userId) => {
  try {
    const updatedNotification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).updateMany(
      { userId: new ObjectId(userId), _destroy: false },
      { $set: { isRead: true } }
    )
    return updatedNotification
  } catch (error) {
    throw new Error(error)
  }
}

const requestToJoinBoardStatus = async (userId, boardId) => {
  try {
    const notifications = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).find({
      'details.requesterId': userId,
      'details.boardId': boardId,
      'details.status': BOARD_INVITATION_STATUS.PENDING
    }).toArray()
    return notifications[0]
  } catch (error) {
    throw new Error(error)
  }
}

const updateBoardInvitation = async (userId, notificationId, status) => {
  try {
    const getNotification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOne({ _id: new ObjectId(notificationId) })
    if (!getNotification) {
      return null
    }

    if (getNotification.userId.toString() !== userId) {
      return null
    }

    const updateData = {
      updatedAt: new Date(),
      'details.status': status
    }

    const boardId = getNotification.details.boardId
    const getBoard = await boardModel.findOneById(boardId)

    if (!getBoard) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    const boardOnwerAndMemberIds = [...getBoard.ownerIds, ...getBoard.memberIds].toString()
    if (status === BOARD_INVITATION_STATUS.ACCEPTED && boardOnwerAndMemberIds.includes(userId)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'You are already in board')
    }


    const result = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(notificationId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (result.details.status === BOARD_INVITATION_STATUS.ACCEPTED) {
      await boardModel.pushMemberIds(boardId, userId)
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateBoardRequest = async (userId, notificationId, status) => {
  try {
    const getNotification = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOne({ _id: new ObjectId(notificationId) })
    if (!getNotification) {
      return null
    }

    if (getNotification.userId.toString() !== userId) {
      return null
    }

    const updateData = {
      updatedAt: new Date(),
      'details.status': status
    }

    const boardId = getNotification.details.boardId
    const getBoard = await boardModel.findOneById(boardId)

    if (!getBoard) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    const boardOnwerAndMemberIds = [...getBoard.ownerIds, ...getBoard.memberIds].toString()
    if (status === BOARD_INVITATION_STATUS.ACCEPTED && boardOnwerAndMemberIds.includes(getNotification.details.senderId)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'This user is already in board')
    }

    const result = await GET_DB().collection(NOTIFICATION_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(notificationId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (result.details.status === BOARD_INVITATION_STATUS.ACCEPTED) {
      await boardModel.pushMemberIds(boardId, getNotification.details.senderId)
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const notificationModel = {
  createNew, getNotifications, findOneById, markAsReadAll, requestToJoinBoardStatus, updateBoardInvitation, updateBoardRequest
}