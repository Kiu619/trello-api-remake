import { boardModel } from '~/models/boardModel'
import { slugify } from '~/utils/formatter'
import { boardService } from './boardService'
import { chatBotService, emitBatchEvent } from './chatBotService'

export const boardChatBotService = {
  async handleUpdateBoard(message, userId, boardId) {
    try {
      // Tìm kiếm thông tin cập nhật trong câu lệnh
      const newTitleMatch = message.match(/(?:tiêu đề|title|tên|name|tên bảng|đổi tên bảng|rename board)\s+(?:mới|new|thành|to|=|:)\s+['"]([^'"]+)['"]/i) ||
                           message.match(/(?:đổi|change|set)\s+(?:bảng|board)\s+(?:thành|to|=)\s+['"]([^'"]+)['"]/i) ||
                           message.match(/(?:đổi tên bảng|rename board)\s+(?:thành|to|=|:)\s+([^,\\.]+)/i)

      const newTypeMatch = message.match(/(?:kiểu|type|loại|chế độ)\s+(?:mới|new|thành|to|=|:)\s+(public|private|công khai|riêng tư)/i) ||
                          message.match(/(?:đổi|change|set)\s+(?:bảng|board)\s+(?:thành|to|=)\s+(?:kiểu|type|loại|chế độ)\s+(public|private|công khai|riêng tư)/i) ||
                          message.match(/(?:đổi|change|set)\s+(?:bảng|board)\s+(?:thành|to|=)\s+(public|private|công khai|riêng tư)/i)

      // Lấy thông tin hiện tại của board
      const board = await boardModel.findOneById(boardId)
      if (!board) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra quyền của người dùng đối với board
      if (!board.ownerIds.some(id => id.toString() === userId)) {
        const response = 'Bạn không có quyền cập nhật thông tin của board này. Chỉ chủ sở hữu mới có thể thực hiện thao tác này.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Chuẩn bị dữ liệu cập nhật
      const updateData = {
        updatedAt: Date.now()
      }

      // Xử lý cập nhật tiêu đề
      if (newTitleMatch) {
        const newTitle = newTitleMatch[1]
        updateData.title = newTitle
        updateData.slug = slugify(newTitle)
      }

      // Xử lý cập nhật loại board
      if (newTypeMatch) {
        const typeInput = newTypeMatch[1].toLowerCase()
        if (typeInput === 'public' || typeInput === 'công khai') {
          updateData.type = 'public'
        } else if (typeInput === 'private' || typeInput === 'riêng tư') {
          updateData.type = 'private'
        }
      }

      // Kiểm tra xem có thông tin cập nhật không
      if (Object.keys(updateData).length === 1) { // Chỉ có updatedAt
        const response = 'Vui lòng cung cấp thông tin cần cập nhật (tiêu đề hoặc loại board). Ví dụ: "Đổi tên bảng thành \'Tiêu đề mới\'" hoặc "Đổi bảng thành loại private".'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Gọi service để cập nhật board
      await boardService.update(userId, boardId, updateData)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      let responseDetails = []
      if (updateData.title) {
        responseDetails.push(`tiêu đề thành '${updateData.title}'`)
      }
      if (updateData.type) {
        const typeText = updateData.type === 'public' ? 'công khai' : 'riêng tư'
        responseDetails.push(`loại thành ${typeText}`)
      }

      const response = `Đã cập nhật board ${responseDetails.join(' và ')}.`
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling update board command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu cập nhật board.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleOpenBoard(message, userId, boardId) {
    try {
      // Lấy thông tin hiện tại của board
      const board = await boardModel.findOneById(boardId)
      if (!board) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra quyền của người dùng đối với board
      if (!board.ownerIds.some(id => id.toString() === userId)) {
        const response = 'Bạn không có quyền mở board này. Chỉ chủ sở hữu mới có thể thực hiện thao tác này.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra xem board đã được đóng chưa
      if (!board.isClosed) {
        const response = 'Board đã được mở.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Cập nhật trạng thái board thành đã mở
      await boardService.openCloseBoard(userId, boardId, false)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      const response = 'Board đã được mở thành công.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling open board command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu mở board.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleCloseBoard(message, userId, boardId) {
    try {
      // Lấy thông tin hiện tại của board
      const board = await boardModel.findOneById(boardId)
      if (!board) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra quyền của người dùng đối với board
      if (!board.ownerIds.some(id => id.toString() === userId)) {
        const response = 'Bạn không có quyền đóng board này. Chỉ chủ sở hữu mới có thể thực hiện thao tác này.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra xem board đã được đóng chưa
      if (board.isClosed) {
        const response = 'Board đã được đóng.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Cập nhật trạng thái board thành đã đóng
      await boardService.openCloseBoard(userId, boardId, true)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      const response = 'Board đã được đóng thành công.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling close board command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu đóng board.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  }
}

