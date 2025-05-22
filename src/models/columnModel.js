
import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { BOARD_COLLECTION_NAME } from './boardModel'
import { CARD_COLLECTION_NAME, cardModel } from './cardModel'
import { slugify } from '~/utils/formatter'
import { activityService } from '~/services/activityService'

// Define Collection (name & schema)
export const COLUMN_COLLECTION_NAME = 'columns'
const COLUMN_COLLECTION_SCHEMA = Joi.object({
  // Vì trong MongoDB id là dạng ObjectId nên cần phải validate theo dạng này
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required().min(3).max(50).trim().strict(),
  slug: Joi.string().required().min(3).trim().strict(),

  // Lưu ý các item trong mảng cardOrderIds là ObjectId nên cần thêm pattern cho chuẩn
  cardOrderIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),

  isClosed: Joi.boolean().default(false),

  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const INVALID_UPDATE_FIELDS = ['_id', 'createdAt', 'boardId']

const validateBeforeCreate = async (data) => {
  return await COLUMN_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newColumnToAdd = {
      ...validData,
      boardId: new ObjectId(validData.boardId)
    }
    const newColumn = await GET_DB().collection(COLUMN_COLLECTION_NAME).insertOne(newColumnToAdd)
    return newColumn
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (id) => {
  try {
    const column = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(id) })
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const findOneByTitle = async (boardId, title) => {
  try {
    const column = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ boardId: new ObjectId(boardId), title: title })
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const getCardPositionInColumn = async (columnId, cardId) => {
  try {
    const column = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(columnId) })
    return column.cardOrderIds.indexOf(new ObjectId(cardId))
  } catch (error) {
    throw new Error(error)
  }
}


const pushCardOrderIds = async (card) => {
  try {
    const result = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(card.columnId) },
      { $push: { cardOrderIds: card._id } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const pullCardOrderIds = async (card) => {
  try {
    const result = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(card.columnId) },
      { $pull: { cardOrderIds: card._id } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (columnId, updateData) => {
  try {
    // Loại bỏ các trường không được phép update
    Object.keys(updateData).forEach(key => {
      if (INVALID_UPDATE_FIELDS.includes(key)) {
        delete updateData[key]
      }
    })

    if (updateData.cardOrderIds) {
      updateData.cardOrderIds = updateData.cardOrderIds.map(_id => (new ObjectId(_id)))
    }

    const result = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(columnId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateColumnIdInCards = async (columnId, newColumnId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).updateMany(
      { columnId: new ObjectId(columnId) },
      { $set: { columnId: new ObjectId(newColumnId) } }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteColumnById = async (columnId) => {
  try {
    const result = await GET_DB().collection(COLUMN_COLLECTION_NAME).deleteOne({ _id: new ObjectId(columnId) })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteColumnsByBoardId = async (boardId) => {
  try {
    const result = await GET_DB().collection(COLUMN_COLLECTION_NAME).deleteMany({ boardId: new ObjectId(boardId) })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const moveColumnToDifferentBoard = async (userId, columnId, currentBoardId, newBoardId, newPosition) => {
  try {
    const column = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(columnId) })
    if (!column) {
      throw new Error('Column not found')
    }

    const currentBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(currentBoardId) })
    if (!currentBoard) {
      throw new Error('Current board not found')
    }

    const newBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(newBoardId) })
    if (!newBoard) {
      throw new Error('New board not found')
    }

    // Remove columnId from columnOrderIds of currentBoard
    await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(currentBoardId) },
      { $pull: { columnOrderIds: new ObjectId(columnId) } }
    )

    // Add columnId to columnOrderIds of newBoard
    await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(newBoardId) },
      { $push: { columnOrderIds: { $each: [new ObjectId(columnId)], $position: newPosition } } }
    )

    // Fetch all cards in the column
    const cards = await GET_DB().collection(CARD_COLLECTION_NAME).find({ columnId: new ObjectId(columnId) }).toArray()

    // Move each card to the new board using the moveCardToDifferentBoard function
    await Promise.all(cards.map(card =>
      cardModel.moveCardToDifferentBoard(userId, card._id.toString(), currentBoardId, columnId, newBoardId, columnId, 0)
    ))

    // Update the column's boardId
    const updatedColumn = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(columnId) },
      { $set: { boardId: new ObjectId(newBoardId) } },
      { returnDocument: 'after' }
    )

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'moveColumnToDifferentBoard',
      columnId: columnId.toString(),
      boardId: currentBoardId.toString(),
      data: {
        sourceColumnTitle: column.title,
        destinationBoardId: newBoardId.toString(),
        destinationBoardTitle: newBoard.title
      }
    })

    await activityService.createActivity({
      userId,
      type: 'columnMovedFromDifferentBoard',
      columnId: columnId.toString(),
      boardId: newBoardId.toString(),
      data: {
        sourceColumnTitle: column.title,
        sourceBoardId: currentBoardId.toString(),
        sourceBoardTitle: currentBoard.title
      }
    })

    return updatedColumn.value
  } catch (error) {
    throw new Error(error)
  }
}

const copyColumn = async (userId, columnId, currentBoardId, newBoardId, newPosition, title, forBoardCopy) => {
  try {

    const column = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(columnId) })
    if (!column) {
      throw new Error('Column not found')
    }

    const currentBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(currentBoardId) })
    if (!currentBoard) {
      throw new Error('Current board not found')
    }

    const newBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(newBoardId) })
    if (!newBoard) {
      throw new Error('New board not found')
    }

    const newColumn = {
      ...column,
      _id: new ObjectId(),
      boardId: new ObjectId(newBoardId),
      title: title,
      slug: slugify(title),
      cardOrderIds: []
    }

    // Insert the new column to the new board
    await GET_DB().collection(COLUMN_COLLECTION_NAME).insertOne(newColumn)

    // Add the new column to the new board's columnOrderIds
    await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(newBoardId) },
      { $push: { columnOrderIds: { $each: [newColumn._id], $position: newPosition } } }
    )

    // Fetch all cards in the column
    const cards = await GET_DB().collection(CARD_COLLECTION_NAME).find({ columnId: new ObjectId(columnId) }).toArray()

    let keepingItems = []
    if (forBoardCopy) {
      keepingItems = ['dueDate', 'checklists', 'attachments', 'location']
    } else {
      keepingItems = ['memberIds',
        'dueDate',
        'checklists',
        'attachments',
        'location',
        'comments']
    }

    await Promise.all(cards.map(card =>
      cardModel.copyCard(card._id.toString(), currentBoardId, columnId, newBoardId, newColumn._id.toString(), 0, card.title, keepingItems)
    ))

    // Tạo activity
    if (currentBoardId === newBoardId) {
      await activityService.createActivity({
        userId,
        type: 'copyColumnToSameBoard',
        columnId: columnId.toString(),
        boardId: currentBoardId.toString(),
        data: {
          sourceColumnTitle: column.title,
          destinationColumnTitle: newColumn.title
        }
      })
    } else {
      await activityService.createActivity({
        userId,
        type: 'copyColumnToAnotherBoard',
        columnId: columnId.toString(),
        boardId: currentBoardId.toString(),
        data: {
          destinationBoardId: newBoardId.toString(),
          destinationBoardTitle: newBoard.title,
          sourceColumnTitle: column.title,
          destinationColumnTitle: newColumn.title
        }
      })

      await activityService.createActivity({
        userId,
        type: 'copyColumnFromAnotherBoard',
        columnId: columnId.toString(),
        boardId: newBoardId.toString(),
        data: {
          sourceBoardId: currentBoardId.toString(),
          sourceBoardTitle: currentBoard.title,
          sourceColumnTitle: column.title,
          destinationColumnTitle: newColumn.title
        }
      })
    }

    return newColumn
  } catch (error) {
    throw new Error(error)
  }
}

const openCloseAllColumn = async (boardId, isClosed) => {
  try {
    const result = await GET_DB().collection(COLUMN_COLLECTION_NAME).updateMany(
      { boardId: new ObjectId(boardId) },
      { $set: { isClosed: isClosed } }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const columnModel = {
  COLUMN_COLLECTION_NAME,
  COLUMN_COLLECTION_SCHEMA,
  createNew,
  findOneById,
  findOneByTitle,
  pushCardOrderIds,
  pullCardOrderIds,
  getCardPositionInColumn,
  update,
  updateColumnIdInCards,
  deleteColumnById,
  deleteColumnsByBoardId,
  moveColumnToDifferentBoard,
  copyColumn,
  openCloseAllColumn
}
