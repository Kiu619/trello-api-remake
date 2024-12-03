import { StatusCodes } from 'http-status-codes'
import { boardService } from '~/services/boardService'


const createNew = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const createNewBoard = await boardService.createNew(userId, req.body)
    res.status(StatusCodes.CREATED).json(createNewBoard)
  } catch (error) {
    // Neu co loi thi chuyen sang middleware error
    next(error)
  }
}

const getDetails = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const board = await boardService.getDetails(userId, boardId)
    res.status(StatusCodes.OK).json(board)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const updatedBoard = await boardService.update(boardId, req.body)
    res.status(StatusCodes.OK).json(updatedBoard)
  } catch (error) {
    next(error)
  }
}

const deleteBoard = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const result = await boardService.deleteBoard(boardId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const moveCardToDifferentColumn = async (req, res, next) => {
  try {
    const result = await boardService.moveCardToDifferentColumn(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

// const getBoards = async (req, res, next) => {
//   try {
//     const userId = req.jwtDecoded._id

//     const { page, itemPerPage, q } = req.query
//     const queryFilter = q
//     const boards = await boardService.getBoards(userId, page, itemPerPage, queryFilter)
//     res.status(StatusCodes.OK).json(boards)
//   }
//   catch (error) {
//     next(error)
//   }
// }

const getBoards = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id

    // Destructure thêm sort từ query parameters
    const { page, itemPerPage, q, sort } = req.query
    const queryFilter = q
    const boards = await boardService.getBoards(
      userId,
      page,
      itemPerPage,
      queryFilter,
      sort
    )
    res.status(StatusCodes.OK).json(boards)
  }
  catch (error) {
    next(error)
  }
}

const inviteUser = async (req, res, next) => {
  try {
    const inviterId = req.jwtDecoded._id
    const result = await boardService.inviteUser(req.body, inviterId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const addBoardAdmin = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userId = req.body.userId
    const result = await boardService.addBoardAdmin(boardId, userId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const removeBoardAdmin = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userId = req.body.userId
    const result = await boardService.removeBoardAdmin(boardId, userId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const leaveBoard = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userId = req.jwtDecoded._id
    const result = await boardService.leaveBoard(boardId, userId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const openClosedBoard = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const isClosed = req.body.isClosed
    const result = await boardService.openCloseBoard(boardId, isClosed)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const copyBoard = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const boardId = req.params.id
    const boardTitle = req.body.title
    const result = await boardService.copyBoard(userId, boardId, boardTitle)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) {
    next(error)
  }
}

const removeMembers = async (req, res, next) => {
  try {
    const boardId = req.params.id
    const userIds = req.body
    const result = await boardService.removeMembers(boardId, userIds)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const boardController = {
  createNew, getDetails, update, deleteBoard, moveCardToDifferentColumn, getBoards, inviteUser, addBoardAdmin, openClosedBoard, leaveBoard, copyBoard, removeBoardAdmin, removeMembers
}
