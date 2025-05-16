import { boardModel } from '~/models/boardModel'
import { columnService } from '~/services/columnService'
import { boardService } from './boardService'
import { chatBotService, emitBatchEvent } from './chatBotService'

export const boardChatBotService = {
  async handleOpenColumn(message, userId, boardId) {
    try {
      const board = await boardService.getDetails(userId, boardId)
    } catch (error) {
      console.error('Error handling open column command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu mở cột.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  }
}
