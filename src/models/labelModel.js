
import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const LABEL_COLLECTION_NAME = 'labels'

const LABEL_COLLECTION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required().min(3).max(50).trim().strict(),
  color: Joi.string().required().min(3).max(50).trim().strict(),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const validateBeforeCreate = async (data) => {
  return await LABEL_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}


const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newLabelToAdd = {
      ...validData,
      boardId: new ObjectId(validData.boardId)
    }

    const result = await GET_DB().collection(LABEL_COLLECTION_NAME).insertOne(newLabelToAdd)
    return result.insertedId
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (labelId) => {
  try {
    const label = await GET_DB().collection(LABEL_COLLECTION_NAME).findOne({ _id: new ObjectId(labelId), _destroy: false })
    return label
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (labelId, reqBody) => {
  try {
    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }

    const updatedLabel = await GET_DB().collection(LABEL_COLLECTION_NAME).updateOne({ _id: new ObjectId(labelId) }, { $set: updateData })

    return updatedLabel
  } catch (error) {
    throw new Error(error)
  }
}

const deleteLabel = async (labelId) => {
  try {
    const deletedLabel = await GET_DB().collection(LABEL_COLLECTION_NAME).deleteOne({ _id: new ObjectId(labelId) })
    return deletedLabel
  } catch (error) {
    throw new Error(error)
  }
}

const getLabelsByBoardId = async (boardId) => {
  try {
    const labels = await GET_DB().collection(LABEL_COLLECTION_NAME).find({ boardId: new ObjectId(boardId), _destroy: false }).toArray()
    return labels
  } catch (error) {
    throw new Error(error)
  }
}

export const labelModel = {
  LABEL_COLLECTION_NAME,
  createNew,
  findOneById,
  update,
  deleteLabel,
  getLabelsByBoardId
}