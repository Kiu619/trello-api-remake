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

export const activityController = {
  getActivitiesByBoardId
}
