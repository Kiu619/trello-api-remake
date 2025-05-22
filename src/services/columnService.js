/* eslint-disable no-useless-catch */
import { columnModel } from '~/models/columnModel'
import { boardModel } from '~/models/boardModel'
import { cardModel } from '~/models/cardModel'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { slugify } from '~/utils/formatter'
import { activityService } from './activityService'

const createNew = async (userId, reqBody) => {
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

      // Tạo activity
      await activityService.createActivity({
        userId,
        type: 'createColumn',
        columnId: getNewColumn._id.toString(),
        boardId: getNewColumn.boardId.toString(),
        data: {
          columnTitle: getNewColumn.title
        }
      })
    }

    return getNewColumn
  } catch (error) {
    throw new Error(error)
  }
}

const getDetailsByTitle = async (boardId, title) => {
  try {
    const column = await columnModel.findOneByTitle(boardId, title)
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const getCardPositionInColumn = async (columnId, cardId) => {
  try {
    const cardPosition = await columnModel.getCardPositionInColumn(columnId, cardId)
    return cardPosition
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (userId, columnId, reqBody) => {
  try {
    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }

    const updatedColumn = await columnModel.update(columnId, updateData)

    // Tạo activity
    if (reqBody.title && reqBody.oldTitle) {
      await activityService.createActivity({
        userId,
        type: 'renameColumn',
        columnId: columnId.toString(),
        boardId: updatedColumn.boardId.toString(),
        data: {
          columnTitle: updatedColumn.title,
          oldColumnTitle: reqBody.oldTitle
        }
      })
    }

    if (reqBody.isClosed) {
      await activityService.createActivity({
        userId,
        type: 'openCloseColumn',
        columnId: columnId.toString(),
        boardId: updatedColumn.boardId.toString(),
        data: {
          columnTitle: updatedColumn.title,
          newColumnStatus: reqBody.isClosed === true ? 'closed' : 'open'
        }
      })
    }

    return updatedColumn
    // return newColumn
  } catch (error) {
    throw new Error(error)
  }
}

const deleteColumn = async (userId, columnId) => {
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

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'removeColumn',
      columnId: columnId.toString(),
      boardId: targetColumn.boardId.toString(),
      data: {
        columnTitle: targetColumn.title
      }
    })

    return { deleteResult: 'Column and its cards deleted succesfully' }
  } catch (error) {
    throw new Error(error)
  }
}

const moveColumnToDifferentBoard = async (userId, columnId, reqBody) => {
  try {
    const { currentBoardId, newBoardId, newPosition } = reqBody
    const column = await columnModel.moveColumnToDifferentBoard(userId, columnId, currentBoardId, newBoardId, newPosition)
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const copyColumn = async (userId, columnId, reqBody) => {
  try {
    const { currentBoardId, newBoardId, newPosition, title } = reqBody
    const column = await columnModel.copyColumn(userId, columnId, currentBoardId, newBoardId, newPosition, title)
    return column
  } catch (error) {
    throw new Error(error)
  }
}

const moveAllCardsToAnotherColumn = async (userId, columnId, newColumnId) => {
  try {
    const currentColumn = await columnModel.findOneById(columnId)
    if (!currentColumn) {
      throw new Error('Current column not found')
    }

    const newColumn = await columnModel.findOneById(newColumnId)
    if (!newColumn) {
      throw new Error('New column not found')
    }

    await columnModel.update(columnId, { cardOrderIds: [] })

    if (currentColumn.cardOrderIds && currentColumn.cardOrderIds.length > 0) {
      const updatedCardOrderIds = [...(newColumn.cardOrderIds || []), ...currentColumn.cardOrderIds]
      await columnModel.update(newColumnId, { cardOrderIds: updatedCardOrderIds })
    }

    // Update columnId for each card in the old column
    await columnModel.updateColumnIdInCards(columnId, newColumnId)

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'moveAllCards',
      columnId: columnId.toString(),
      boardId: currentColumn.boardId.toString(),
      data: {
        sourceColumnTitle: currentColumn.title,
        destinationColumnTitle: newColumn.title
      }
    })

    return newColumn
  } catch (error) {
    throw new Error(error)
  }
}

const closeColumn = async (userId, columnId, isClosed = true) => {
  try {
    const updateData = {
      isClosed: isClosed,
      updatedAt: Date.now()
    }

    const updatedColumn = await columnModel.update(columnId, updateData)

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'openCloseColumn',
      columnId: columnId.toString(),
      boardId: updatedColumn.boardId.toString(),
      data: {
        columnTitle: updatedColumn.title,
        newColumnStatus: isClosed === true ? 'closed' : 'open'
      }
    })
    return updatedColumn
  } catch (error) {
    throw new Error(error)
  }
}

const closeAllColumns = async (userId, boardId, isClosed = true) => {
  try {
    const result = await columnModel.openCloseAllColumn(boardId, isClosed)

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'openCloseAllColumns',
      boardId: boardId.toString(),
      data: {
        newColumnStatus: isClosed === true ? 'closed' : 'open'
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const columnService = {
  createNew,
  getDetailsByTitle,
  getCardPositionInColumn,
  update,
  deleteColumn,
  moveColumnToDifferentBoard,
  copyColumn,
  moveAllCardsToAnotherColumn,
  closeColumn,
  closeAllColumns
}
