import { StatusCodes } from 'http-status-codes'
import { activityService } from '~/services/activityService'

const getActivitiesByBoardId = async (req, res, next) => {
  try {
    const boardId = req.params.boardId
    const activities = await activityService.getActivitiesByBoardId(boardId)
    res.status(StatusCodes.OK).json(activities)
  } catch (error) {
    next(error)
  }
}

const getActivitiesByUserId = async (req, res, next) => {
  try {
    const userId = req.query.userId
    const boardId = req.query.boardId
    const activities = await activityService.getActivitiesByUserId(userId, boardId)
    res.status(StatusCodes.OK).json(activities)
  } catch (error) {
    next(error)
  }
}

const getActivitiesByCardId = async (req, res, next) => {
  try {
    const cardId = req.params.cardId
    const activities = await activityService.getActivitiesByCardId(cardId)
    res.status(StatusCodes.OK).json(activities)
  } catch (error) {
    next(error)
  }
}

export const activityController = {
  getActivitiesByBoardId,
  getActivitiesByUserId,
  getActivitiesByCardId
}
