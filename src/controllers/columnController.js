import { StatusCodes } from 'http-status-codes'
import { columnService } from '~/services/columnService'


const createNew = async (req, res, next) => {
  try {
    // Điều hướng dũ liệu sang tầng Service
    const createNewColumn = await columnService.createNew(req.body)
    // Co ket qua thi tra ve phia Client
    res.status(StatusCodes.CREATED).json(createNewColumn)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const columnId = req.params.id
    const updatedColumn = await columnService.update(columnId, req.body)
    res.status(StatusCodes.OK).json(updatedColumn)
  } catch (error) {
    next(error)
  }
}

const deleteColumn = async (req, res, next) => {
  try {
    const columnId = req.params.id
    const result = await columnService.deleteColumn(columnId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const moveColumnToDifferentBoard = async (req, res, next) => {
  try {
    const columnId = req.params.id
    const moveResult = await columnService.moveColumnToDifferentBoard(columnId, req.body)
    res.status(StatusCodes.OK).json(moveResult)
  } catch (error) {
    next(error)
  }
}

const copyColumn = async (req, res, next) => {
  try {
    const columnId = req.params.id
    const copyResult = await columnService.copyColumn(columnId, req.body)
    res.status(StatusCodes.CREATED).json(copyResult)
  } catch (error) {
    next(error)
  }
}

const moveAllCardsToAnotherColumn = async (req, res, next) => {
  try {
    const columnId = req.params.id
    const newColumnId = req.body.newColumnId
    const moveResult = await columnService.moveAllCardsToAnotherColumn(columnId, newColumnId)
    res.status(StatusCodes.OK).json(moveResult)
  } catch (error) {
    next(error)
  }
}

export const columnController = {
  createNew, update, deleteColumn, moveColumnToDifferentBoard, copyColumn, moveAllCardsToAnotherColumn
}
