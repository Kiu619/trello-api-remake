import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { GET_DB } from '~/config/mongodb'
import { CARD_COLLECTION_NAME } from '~/models/cardModel'

export const DUEDATE_SCHEMA = Joi.object({
  title: Joi.string().optional(),
  // startDate: Joi.date().allow(null),
  startTime: Joi.string().allow(null),
  // dueDate: Joi.date().required(),
  dueDateTime: Joi.string().default(null),
  isComplete: Joi.boolean().default(false), // New field for completion status,
  dayBeforeToRemind: Joi.number().default(0), // New field for day before to remind
  isRemind: Joi.boolean().default(false), // New field for remind status
  isOverdueNotified: Joi.boolean().default(false) // New field for overdue notification status
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