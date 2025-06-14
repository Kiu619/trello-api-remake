import { activityModel } from '~/models/activityModel'
import { ACTIVITY_TYPES } from '~/models/activityModel'

const createActivity = async (data) => {
  try {
    const result = await activityModel.createNew(data)
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const getActivitiesByBoardId = async (boardId) => {
  try {
    const activities = await activityModel.getActivitiesByBoardId(boardId)
    return activities
  } catch (error) {
    throw new Error(error)
  }
}

const getActivitiesByUserId = async (userId, boardId) => {
  try {
    const activities = await activityModel.getActivitiesByUserId(userId, boardId)
    return activities
  } catch (error) {
    throw new Error(error)
  }
}

const getActivitiesByCardId = async (cardId) => {
  try {
    const activities = await activityModel.getActivitiesByCardId(cardId)
    return activities
  } catch (error) {
    throw new Error(error)
  }
}
export const activityService = {
  createActivity,
  getActivitiesByBoardId,
  getActivitiesByUserId,
  getActivitiesByCardId
  // Thêm các hàm tiện ích khác khi cần
}