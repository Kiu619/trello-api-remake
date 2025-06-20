import { StatusCodes } from 'http-status-codes'
import { cardService } from '~/services/cardService'


const createNew = async (req, res, next) => {
  try {
    // Điều hướng dũ liệu sang tầng Service
    const userId = req.jwtDecoded._id
    const createNewCard = await cardService.createNew(userId, req.body)

    // Co ket qua thi tra ve phia Client
    res.status(StatusCodes.CREATED).json(createNewCard)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    let cardCoverFile = null
    let attachmentFile = null
    if (req.files && req.files.cardCover) {
      cardCoverFile = req.files.cardCover[0]
    }
    if (req.files && req.files.attachmentFile) {
      attachmentFile = req.files.attachmentFile[0]
    }
    const userInfo = req.jwtDecoded
    const updateCard = await cardService.update(userId, cardId, req.body, cardCoverFile, attachmentFile, userInfo)

    res.status(StatusCodes.OK).json(updateCard)
  } catch (error) {
    next(error)
  }
}

const getDetails = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const card = await cardService.getDetails(userId, cardId)
    res.status(StatusCodes.OK).json(card)
  } catch (error) {
    next(error)
  }
}

const moveCardToDifferentBoard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const moveResult = await cardService.moveCardToDifferentBoard(userId, cardId, req.body)
    res.status(StatusCodes.OK).json(moveResult)
  } catch (error) {
    next(error)
  }
}

const copyCard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const copyResult = await cardService.copyCard(userId, cardId, req.body)
    res.status(StatusCodes.CREATED).json(copyResult)
  } catch (error) {
    next(error)
  }
}

const deleteCard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const deleteResult = await cardService.deleteCard(userId, cardId)
    res.status(StatusCodes.OK).json(deleteResult)
  } catch (error) {
    next(error)
  }
}

const updateLabel = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const cardId = req.params.id
    const labelIds = req.body.labelIds
    const updateResult = await cardService.updateLabel(userId, cardId, labelIds)
    res.status(StatusCodes.OK).json(updateResult)
  } catch (error) {
    next(error)
  }
}


export const cardController = {
  createNew, update, getDetails, moveCardToDifferentBoard, copyCard, deleteCard, updateLabel
}
