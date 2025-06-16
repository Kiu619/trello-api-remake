import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'

const CARD_DUE_DATE_FLAG_COLLECTION_NAME = 'cardDueDateFlags'

const validateBeforeCreate = async (data) => {
  return await CARD_DUE_DATE_FLAG_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const CARD_DUE_DATE_FLAG_COLLECTION_SCHEMA = Joi.object({
  cardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  type: Joi.string().required().valid('card', 'checklistItem'),
  checklistId: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE).optional(),
  itemId: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE).optional()
})

const createCardDueDateFlag = async (cardId, type, checklistId, itemId) => {
  const validData = await validateBeforeCreate({ cardId, type, checklistId, itemId })
  // Sử dụng upsert: update nếu tồn tại, insert nếu chưa tồn tại
  const cardDueDateFlag = await GET_DB().collection(CARD_DUE_DATE_FLAG_COLLECTION_NAME).updateOne(
    { cardId, type, checklistId, itemId },
    { $set: validData },
    { upsert: true }
  )
  return cardDueDateFlag
}

const deleteCardDueDateFlag = async (cardId, checklistId = null, itemId = null) => {
  let query = { cardId }

  if (checklistId && itemId) {
    // Xóa flag cho checklist item cụ thể
    query = { cardId, type: 'checklistItem', checklistId, itemId }
  } else {
    // Xóa tất cả flag của card (bao gồm cả checklist items)
    query = { cardId }
  }

  const cardDueDateFlag = await GET_DB().collection(CARD_DUE_DATE_FLAG_COLLECTION_NAME).deleteMany(query)
  return cardDueDateFlag
}

export const cardDueDateFlagModel = {
  CARD_DUE_DATE_FLAG_COLLECTION_NAME,
  CARD_DUE_DATE_FLAG_COLLECTION_SCHEMA,
  createCardDueDateFlag,
  deleteCardDueDateFlag
}