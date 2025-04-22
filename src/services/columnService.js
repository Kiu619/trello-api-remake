/* eslint-disable no-useless-catch */
import { columnModel } from '~/models/columnModel'
import { boardModel } from '~/models/boardModel'
import { cardModel } from '~/models/cardModel'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { slugify } from '~/utils/formatter'

const createNew = async (reqBody) => {
  try {
    const newColumn = {
      ...reqBody,
      slug: slugify(reqBody.title)
    }
    const createColumn = await columnModel.createNew(newColumn)
    const getNewColumn = await columnModel.findOneById(createColumn.insertedId)

    if (getNewColumn) {
      // Xử lý cấu trúc data trước khi trả dữ liệu về 
      getNewColumn.cards = []

      // Cập nhật mảng columnOrderIds của board
      await boardModel.pushColumnOrderIds(getNewColumn)
    }


    return getNewColumn
  } catch (error) {
    throw new Error(error)
  }
}



const update = async (columnId, reqBody) => {
  try {
    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }

    const updatedColumn = await columnModel.update(columnId, updateData)
    return updatedColumn
    // return newColumn
  } catch (error) {
    throw new Error(error)
  }
}

const deleteColumn = async (columnId) => {
  try {
    const targetColumn = await columnModel.findOneById(columnId)
    if (!targetColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Column not found')
    }
    // xóa column
    await columnModel.deleteColumnById(columnId)
    // xóa card
    await cardModel.deleteAllCardByColumnId(columnId)
    // xóa columnId trong board
    await boardModel.pullColumnOrderIds(targetColumn)

    return { deleteResult: 'Column and its cards deleted succesfully' }
  } catch (error) {
    throw new Error(error)
  }
}

const moveColumnToDifferentBoard = async (columnId, reqBody) => {
  try {
    const { currentBoardId, newBoardId, newPosition } = reqBody
    const column = await columnModel.moveColumnToDifferentBoard(columnId, currentBoardId, newBoardId, newPosition)
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const copyColumn = async (columnId, reqBody) => {
  try {
    const { currentBoardId, newBoardId, newPosition, title } = reqBody
    const column = await columnModel.copyColumn(columnId, currentBoardId, newBoardId, newPosition, title)
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const moveAllCardsToAnotherColumn = async (columnId, newColumnId) => {
  try {
    const moveResult = await columnModel.moveAllCardsToAnotherColumn(columnId, newColumnId)
    return moveResult

  } catch (error) {
    throw new Error(error)
  }
}

export const columnService = {
  createNew, update, deleteColumn, moveColumnToDifferentBoard, copyColumn, moveAllCardsToAnotherColumn
}
