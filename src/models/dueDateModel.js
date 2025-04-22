import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { GET_DB } from '~/config/mongodb'
import { CARD_COLLECTION_NAME } from '~/models/cardModel'

export const DUEDATE_SCHEMA = Joi.object({
  title: Joi.string().required(),
  dueDate: Joi.date().timestamp('javascript').default(null), // New field for due date
  dueDateTime: Joi.date().timestamp('javascript').default(null), // New field for due date time
  startDate: Joi.date().timestamp('javascript').default(null), // New field for start date
  startDateTime: Joi.date().timestamp('javascript').default(null), // New field for start date time
  isComplete: Joi.boolean().default(false) // New field for completion status
})

const setDueDate = async (cardId, dueDateData) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: { dueDate: dueDateData } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const removeDueDate = async (cardId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $unset: { dueDate: '' } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const dueDateModel = {
  setDueDate,
  removeDueDate
}