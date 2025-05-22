import { StatusCodes } from 'http-status-codes'
import { columnService } from '~/services/columnService'


const createNew = async (req, res, next) => {
  try {
    // Điều hướng dũ liệu sang tầng Service
    const userId = req.jwtDecoded._id
    const createNewColumn = await columnService.createNew(userId, req.body)
    // Co ket qua thi tra ve phia Client
    res.status(StatusCodes.CREATED).json(createNewColumn)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const updatedColumn = await columnService.update(userId, columnId, req.body)
    res.status(StatusCodes.OK).json(updatedColumn)
  } catch (error) {
    next(error)
  }
}

const deleteColumn = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const result = await columnService.deleteColumn(userId, columnId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const moveColumnToDifferentBoard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const moveResult = await columnService.moveColumnToDifferentBoard(userId, columnId, req.body)
    res.status(StatusCodes.OK).json(moveResult)
  } catch (error) {
    next(error)
  }
}

const copyColumn = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const copyResult = await columnService.copyColumn(userId, columnId, req.body)
    res.status(StatusCodes.CREATED).json(copyResult)
  } catch (error) {
    next(error)
  }
}

const moveAllCardsToAnotherColumn = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const columnId = req.params.id
    const newColumnId = req.body.newColumnId
    const moveResult = await columnService.moveAllCardsToAnotherColumn(userId, columnId, newColumnId)
    res.status(StatusCodes.OK).json(moveResult)
  } catch (error) {
    next(error)
  }
}

export const columnController = {
  createNew, update, deleteColumn, moveColumnToDifferentBoard, copyColumn, moveAllCardsToAnotherColumn
}
