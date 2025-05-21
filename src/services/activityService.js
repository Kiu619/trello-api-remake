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

const getActivitiesByCardId = async (cardId) => {
  try {
    const activities = await activityModel.getActivitiesByCardId(cardId)
    return activities
  } catch (error) {
    throw new Error(error)
  }
}

// Các hàm tiện ích để tạo các loại hoạt động khác nhau
const addCardActivity = async (userId, userName, boardId, cardId, cardTitle, columnTitle) => {
  try {
    await createActivity({
      boardId,
      cardId,
      userId,
      type: ACTIVITY_TYPES.ADD_CARD,
      data: {
        userName,
        cardTitle,
        columnTitle
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

const moveCardActivity = async (userId, userName, boardId, cardId, cardTitle, sourceColumnTitle, destinationColumnTitle) => {
  try {
    await createActivity({
      boardId,
      cardId,
      userId,
      type: ACTIVITY_TYPES.MOVE_CARD,
      data: {
        userName,
        cardTitle,
        sourceColumnTitle,
        destinationColumnTitle
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

const copyCardActivity = async (userId, userName, boardId, cardId, cardTitle, columnTitle) => {
  try {
    await createActivity({
      boardId,
      cardId,
      userId,
      type: ACTIVITY_TYPES.COPY_CARD,
      data: {
        userName,
        cardTitle,
        columnTitle
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

const updateCardTitleActivity = async (userId, userName, boardId, cardId, oldCardTitle, newCardTitle) => {
  try {
    await createActivity({
      boardId,
      cardId,
      userId,
      type: ACTIVITY_TYPES.UPDATE_CARD_TITLE,
      data: {
        userName,
        oldCardTitle,
        newCardTitle
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

const addCommentActivity = async (userId, userName, boardId, cardId, cardTitle, commentText) => {
  try {
    await createActivity({
      boardId,
      cardId,
      userId,
      type: ACTIVITY_TYPES.ADD_COMMENT,
      data: {
        userName,
        cardTitle,
        commentText
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

const joinBoardActivity = async (userId, userName, boardId) => {
  try {
    await createActivity({
      boardId,
      userId,
      type: ACTIVITY_TYPES.JOIN_BOARD,
      data: {
        userName
      }
    })
  } catch (error) {
    throw new Error(error)
  }
}

export const activityService = {
  createActivity,
  getActivitiesByBoardId,
  getActivitiesByCardId,
  addCardActivity,
  moveCardActivity,
  copyCardActivity,
  updateCardTitleActivity,
  addCommentActivity,
  joinBoardActivity
  // Thêm các hàm tiện ích khác khi cần
}