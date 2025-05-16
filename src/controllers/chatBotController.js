import { StatusCodes } from 'http-status-codes'
import { chatBotService } from '~/services/chatBotService'

const chat = async (req, res, next) => {
  try {
    const { message, boardId } = req.body
    const userId = req.jwtDecoded._id

    const response = await chatBotService.chat(message, userId, boardId)
    res.status(StatusCodes.OK).json(response)
  } catch (error) {
    next(error)
  }
}

const getChatHistory = async (req, res, next) => {
  try {
    const { boardId } = req.params
    const userId = req.jwtDecoded._id

    const chatHistory = await chatBotService.getChatHistory(userId, boardId)
    res.status(StatusCodes.OK).json(chatHistory)
  } catch (error) {
    next(error)
  }
}

export const chatBotController = {
  chat,
  getChatHistory
}
