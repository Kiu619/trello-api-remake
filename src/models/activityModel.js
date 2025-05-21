import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { USER_COLLECTION_NAME } from './userModel'

// Các loại hoạt động
export const ACTIVITY_TYPES = {
  ADD_CARD: 'addCard',
  MOVE_CARD: 'moveCard',
  COPY_CARD: 'copyCard',
  UPDATE_CARD_TITLE: 'updateCardTitle',
  UPDATE_CARD_DESCRIPTION: 'updateCardDescription',
  ADD_COMMENT: 'addComment',
  ADD_ATTACHMENT: 'addAttachment',
  REMOVE_ATTACHMENT: 'removeAttachment',
  ADD_CHECKLIST: 'addChecklist',
  UPDATE_CHECKLIST_ITEM: 'updateChecklistItem',
  ADD_MEMBER_TO_CARD: 'addMemberToCard',
  REMOVE_MEMBER_FROM_CARD: 'removeMemberFromCard',
  ADD_LABEL: 'addLabel',
  REMOVE_LABEL: 'removeLabel',
  ADD_DUE_DATE: 'addDueDate',
  UPDATE_DUE_DATE: 'updateDueDate',
  REMOVE_DUE_DATE: 'removeDueDate',
  ADD_COLUMN: 'addColumn',
  UPDATE_COLUMN_TITLE: 'updateColumnTitle',
  REMOVE_COLUMN: 'removeColumn',

  ADD_MEMBER_TO_BOARD: 'addMemberToBoard',
  CREATE_BOARD: 'createBoard',
  RENAME_BOARD: 'renameBoard',
  CHANGE_DESCRIPTION_BOARD: 'changeDescriptionBoard',
  CHANGE_TYPE_BOARD: 'changeTypeBoard',
  ADD_BOARD_ADMIN: 'addBoardAdmin',
  REMOVE_BOARD_ADMIN: 'removeBoardAdmin',
  REMOVE_MEMBERS: 'removeMembers',
  OPEN_CLOSE_BOARD: 'openCloseBoard',
  JOIN_BOARD: 'joinBoard',
  LEAVE_BOARD: 'leaveBoard'
}

export const ACTIVITY_COLLECTION_NAME = 'activities'
const ACTIVITY_COLLECTION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  cardId: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  columnId: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  userId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  type: Joi.string().valid(...Object.values(ACTIVITY_TYPES)).required(),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),

  // Thông tin chi tiết về hoạt động
  data: Joi.object({
    // Thông tin về board
    boardTitle: Joi.string(),
    newBoardTitle: Joi.string(),
    newBoardDescription: Joi.string(),
    newBoardType: Joi.string(),
    newBoardStatus: Joi.string(),
    usersToRemove: Joi.array(),

    // Thông tin chung
    userName: Joi.string(),

    // Thông tin về card
    cardTitle: Joi.string(),
    oldCardTitle: Joi.string(),
    newCardTitle: Joi.string(),

    // Thông tin về column
    sourceColumnId: Joi.string(),
    sourceColumnTitle: Joi.string(),
    destinationColumnId: Joi.string(),
    destinationColumnTitle: Joi.string(),
    columnTitle: Joi.string(),

    // Thông tin về comment
    commentText: Joi.string(),

    // Thông tin về attachment
    attachmentName: Joi.string(),

    // Thông tin về checklist
    checklistTitle: Joi.string(),
    checklistItemTitle: Joi.string(),

    // Thông tin về label
    labelName: Joi.string(),
    labelColor: Joi.string(),

    // Thông tin về due date
    dueDate: Joi.date(),
    oldDueDate: Joi.date(),
    newDueDate: Joi.date()
  }).default(null)
})

const validateBeforeCreate = async (data) => {
  return await ACTIVITY_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newActivityToAdd = {
      ...validData,
      boardId: new ObjectId(validData.boardId),
      userId: new ObjectId(validData.userId)
    }

    if (validData.cardId) {
      newActivityToAdd.cardId = new ObjectId(validData.cardId)
    }

    const result = await GET_DB().collection(ACTIVITY_COLLECTION_NAME).insertOne(newActivityToAdd)
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const getActivitiesByBoardId = async (boardId) => {
  try {
    // Lấy activity của board và lấy thông tin của user theo userId (chỉ cần lấy displayName và avatar)
    const result = await GET_DB().collection(ACTIVITY_COLLECTION_NAME).aggregate([
      { $match: { boardId: new ObjectId(boardId) } },
      { $lookup: { from: USER_COLLECTION_NAME, localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: {
        'user': {
          _id: 1,
          displayName: 1,
          avatar: 1
        },
        'type': 1,
        'data': 1,
        'cardId': 1,
        'columnId': 1,
        'boardId': 1,
        'createdAt': 1
      } },
      { $sort: { createdAt: -1 } }
    ]).toArray()
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const getActivitiesByCardId = async (cardId) => {
  try {
    const result = await GET_DB().collection(ACTIVITY_COLLECTION_NAME)
      .find({ cardId: new ObjectId(cardId) })
      .sort({ createdAt: -1 })
      .toArray()
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const activityModel = {
  createNew,
  getActivitiesByBoardId,
  getActivitiesByCardId
}