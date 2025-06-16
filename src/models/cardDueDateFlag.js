import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'

const CARD_DUE_DATE_FLAG_COLLECTION_NAME = 'cardDueDateFlags'

const validateBeforeCreate = async (data) => {
  return await CARD_DUE_DATE_FLAG_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const CARD_DUE_DATE_FLAG_COLLECTION_SCHEMA = Joi.object({
  cardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  type: Joi.string().required().valid('card', 'checklistItem')
})

const createCardDueDateFlag = async (cardId, type) => {
  const validData = await validateBeforeCreate({ cardId, type })
  // Sử dụng upsert: update nếu tồn tại, insert nếu chưa tồn tại
  const cardDueDateFlag = await GET_DB().collection(CARD_DUE_DATE_FLAG_COLLECTION_NAME).updateOne(
    { cardId },
    { $set: validData },
    { upsert: true }
  )
  return cardDueDateFlag
}

const deleteCardDueDateFlag = async (cardId) => {
  const cardDueDateFlag = await GET_DB().collection(CARD_DUE_DATE_FLAG_COLLECTION_NAME).deleteOne({ cardId })
  return cardDueDateFlag
}

export const cardDueDateFlagModel = {
  CARD_DUE_DATE_FLAG_COLLECTION_NAME,
  CARD_DUE_DATE_FLAG_COLLECTION_SCHEMA,
  createCardDueDateFlag,
  deleteCardDueDateFlag
}