import { labelModel } from '~/models/labelModel'

const createNew = async (reqBody) => {
  try {
    const newLabel = {
      ...reqBody
    }
    const createLabel = await labelModel.createNew(newLabel)
    const getNewLabel = await labelModel.findOneById(createLabel)
    return getNewLabel
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

    await labelModel.update(labelId, updateData)
    const getUpdatedLabel = await labelModel.findOneById(labelId)

    return getUpdatedLabel
  } catch (error) {
    throw new Error(error)
  }
}

const deleteLabel = async (labelId) => {
  try {
    const deletedLabel = await labelModel.deleteLabel(labelId)
    return deletedLabel
  } catch (error) {
    throw new Error(error)
  }
}

const getLabelsByBoardId = async (boardId) => {
  try {
    const labels = await labelModel.getLabelsByBoardId(boardId)
    return labels
  } catch (error) {
    throw new Error(error)
  }
}

const getLabelsByCardId = async (cardId) => {
  try {
    const labels = await labelModel.getLabelsByCardId(cardId)
    return labels
  } catch (error) {
    throw new Error(error)
  }
}

export const labelService = {
  createNew,
  update,
  deleteLabel,
  getLabelsByBoardId,
  getLabelsByCardId
}