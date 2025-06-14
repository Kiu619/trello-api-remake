import { labelService } from '~/services/labelService'
import { StatusCodes } from 'http-status-codes'

const createNew = async (req, res, next) => {
  try {
    const newLabel = await labelService.createNew(req.body)
    res.status(StatusCodes.CREATED).json(newLabel)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const updatedLabel = await labelService.update(req.params.id, req.body)
    res.status(StatusCodes.OK).json(updatedLabel)
  } catch (error) {
    next(error)
  }
} 

const deleteLabel = async (req, res, next) => {
  try {
    const deletedLabel = await labelService.deleteLabel(req.params.id)
    res.status(StatusCodes.OK).json(deletedLabel)
  } catch (error) {
    next(error)
  }
}

const getLabelsByBoardId = async (req, res, next) => {
  try {
    const labels = await labelService.getLabelsByBoardId(req.params.id)
    res.status(StatusCodes.OK).json(labels)
  } catch (error) {
    next(error)
  }
}

const getLabelsByCardId = async (req, res, next) => {
  try {
    const labels = await labelService.getLabelsByCardId(req.params.id)
    res.status(StatusCodes.OK).json(labels)
  } catch (error) {
    next(error)
  }
}

export const labelController = {
  createNew,
  update,
  deleteLabel,
  getLabelsByBoardId,
  getLabelsByCardId
}