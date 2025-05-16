import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
export const CHAT_BOT_HISTORY_COLLECTION_NAME = 'chatBotHistory'

const CHAT_BOT_HISTORY_COLLECTION_SCHEMA = Joi.object({
  userId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  message: Joi.string().required(),
  response: Joi.string().required(),
  createdAt: Joi.date().timestamp('javascript').default(Date.now)
})

// Tạo những methods để thao tác với collection chatBotHistory
const createNew = async (data) => {
  try {
    const validData = await CHAT_BOT_HISTORY_COLLECTION_SCHEMA.validateAsync(data)
    const result = await GET_DB().collection(CHAT_BOT_HISTORY_COLLECTION_NAME).insertOne(validData)
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const getHistoryByUserAndBoard = async (userId, boardId) => {
  try {
    const result = await GET_DB()
      .collection(CHAT_BOT_HISTORY_COLLECTION_NAME)
      .find({
        userId: userId,
        boardId: boardId
      })
      .sort({ createdAt: 1 })
      .toArray()
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const getLastMessageForBoard = async (boardId) => {
  try {
    const result = await GET_DB()
      .collection(CHAT_BOT_HISTORY_COLLECTION_NAME)
      .find({
        boardId: boardId
      })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray()
    
    return result.length > 0 ? result[0] : null
  } catch (error) {
    throw new Error(error)
  }
}

export const chatBotHistoryModel = {
  CHAT_BOT_HISTORY_COLLECTION_NAME,
  CHAT_BOT_HISTORY_COLLECTION_SCHEMA,
  createNew,
  getHistoryByUserAndBoard,
  getLastMessageForBoard
}
