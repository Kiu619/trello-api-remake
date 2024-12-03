import { StatusCodes } from 'http-status-codes'
import { notificationService } from '~/services/notificationService'

const createNew = async (req, res, next) => {
  try {
    const createNotification = await notificationService.createNew(req.body)
    // Co ket qua thi tra ve phia Client
    res.status(StatusCodes.CREATED).json(createNotification)
  } catch (error) {
    // Neu co loi thi chuyen sang middleware error
    next(error)
  }
}

const getNotifications = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id

    const notifications = await notificationService.getNotifications(userId)
    res.status(StatusCodes.OK).json(notifications)
  } catch (error) {
    next(error)
  }
}

const markAsReadAll = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const updatedNotification = await notificationService.markAsReadAll(userId)
    res.status(StatusCodes.OK).json(updatedNotification)
  } catch (error) {
    next(error)
  }
}

const requestToJoinBoardStatus = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const notifications = await notificationService.requestToJoinBoardStatus(userId, req.params.boardId)
    res.status(StatusCodes.OK).json(notifications)
  } catch (error) {
    next(error)
  }
}

const updateBoardInvitation = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const notificationId = req.params.id
    const status = req.body.status

    const updatedInvitation = await notificationService.updateBoardInvitation(userId, notificationId, status)
    res.status(StatusCodes.OK).json(updatedInvitation)
  } catch (error) {
    next(error)
  }
}

const updateBoardRequest = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const notificationId = req.params.id
    const status = req.body.status

    const updatedInvitation = await notificationService.updateBoardRequest(userId, notificationId, status)
    res.status(StatusCodes.OK).json(updatedInvitation)
  } catch (error) {
    next(error)
  }
}

export const notificationController = {
  createNew, getNotifications, markAsReadAll, requestToJoinBoardStatus, updateBoardInvitation, updateBoardRequest
}