import { boardModel } from '~/models/boardModel'
import { cardService } from '~/services/cardService'
import { columnService } from '~/services/columnService'
import { chatBotService, emitBatchEvent } from './chatBotService'

export const cardChatBotService = {
  async handleMoveCard(message, userId, boardId) {
    try {
      // Tìm kiếm tên card và tên cột trong câu lệnh bằng regex
      const cardNameMatch = message.match(/(?:card|thẻ)\s+['"]([^'"]+)['"]/i)
      const fromColumnMatch = message.match(/(?:từ|from|trong|ở|tại|cột)\s+['"]([^'"]+)['"]/i)
      const toColumnMatch = message.match(/(?:sang|to|đến|vào)\s+(?:cột\s+)?['"]([^'"]+)['"]/i)
      const positionMatch = message.match(/(?:vị trí|position|pos)\s+(?:là|=|:)?\s*(?:["']?(\d+)["']?|(đầu|top|trên cùng|cuối|bottom|dưới cùng))/i)

      if (!cardNameMatch) {
        const response = 'Vui lòng chỉ rõ tên thẻ cần di chuyển. Ví dụ: di chuyển thẻ \'Tên thẻ\' từ cột \'Nguồn\' sang cột \'Đích\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!fromColumnMatch || !toColumnMatch) {
        const response = 'Vui lòng chỉ rõ cột nguồn và cột đích. Ví dụ: di chuyển thẻ \'Tên thẻ\' từ cột \'Nguồn\' sang cột \'Đích\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const cardTitle = cardNameMatch[1]
      const fromColumnTitle = fromColumnMatch[1]
      const toColumnTitle = toColumnMatch[1]

      // Lấy board details để có thông tin toàn diện về board, columns và cards
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm column nguồn và đích từ board details
      const sourceColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === fromColumnTitle.toLowerCase()
      )

      const targetColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === toColumnTitle.toLowerCase()
      )

      if (!sourceColumn) {
        const response = `Không tìm thấy cột nguồn '${fromColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!targetColumn) {
        const response = `Không tìm thấy cột đích '${toColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm card bằng title từ board details
      const card = boardDetails.cards.find(c =>
        c.title.toLowerCase() === cardTitle.toLowerCase() &&
        c.columnId.toString() === sourceColumn._id.toString()
      )

      if (!card) {
        const response = `Không tìm thấy thẻ '${cardTitle}' trong cột '${fromColumnTitle}'. Vui lòng kiểm tra lại tên thẻ.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Xác định vị trí mới trong cột đích
      let newPosition = targetColumn.cardOrderIds.length // Mặc định thêm vào cuối

      if (positionMatch) {
        if (positionMatch[1]) {
          // Nếu là số cụ thể
          const pos = parseInt(positionMatch[1])
          newPosition = Math.min(pos, targetColumn.cardOrderIds.length)
        } else if (positionMatch[2]) {
          // Nếu là vị trí đặc biệt (đầu/cuối)
          const posType = positionMatch[2].toLowerCase()
          if (posType === 'đầu' || posType === 'top' || posType === 'trên cùng') {
            newPosition = 0
          }
          // Nếu là cuối thì giữ giá trị mặc định
        }
      }

      // Thực hiện di chuyển card
      // Xóa cardId từ source column
      const updatedSourceCardOrderIds = sourceColumn.cardOrderIds.filter(
        cardId => cardId.toString() !== card._id.toString()
      )
      await columnService.update(userId, sourceColumn._id, { cardOrderIds: updatedSourceCardOrderIds })

      // Thêm cardId vào target column tại vị trí mới
      const updatedTargetCardOrderIds = [...targetColumn.cardOrderIds]
      updatedTargetCardOrderIds.splice(newPosition, 0, card._id)
      await columnService.update(userId, targetColumn._id, { cardOrderIds: updatedTargetCardOrderIds })

      // Cập nhật columnId của card
      await cardService.update(userId, card._id, { columnId: targetColumn._id })

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo phản hồi
      let positionInfo = ''
      if (newPosition === 0) {
        positionInfo = ' vào vị trí đầu tiên'
      } else if (newPosition === targetColumn.cardOrderIds.length) {
        positionInfo = ' vào vị trí cuối cùng'
      } else {
        positionInfo = ` vào vị trí thứ ${newPosition}`
      }

      const response = `Đã di chuyển thẻ '${cardTitle}' từ cột '${fromColumnTitle}' sang cột '${toColumnTitle}'${positionInfo}.`
      await chatBotService.saveChat(userId, boardId, message, response)
      return response

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling move card command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu di chuyển thẻ.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleCopyCard(message, userId, boardId) {
    try {
      // Tìm kiếm tên card và tên cột trong câu lệnh bằng regex
      const cardNameMatch = message.match(/(?:card|thẻ)\s+['"]([^'"]+)['"]/i)
      const fromColumnMatch = message.match(/(?:từ|from|cột)\s+['"]([^'"]+)['"]/i)
      const toColumnMatch = message.match(/(?:sang|to|đến|vào)\s+(?:cột\s+)?['"]([^'"]+)['"]/i)

      if (!cardNameMatch) {
        const response = 'Vui lòng chỉ rõ tên thẻ cần copy. Ví dụ: copy thẻ \'Tên thẻ\' từ cột \'Nguồn\' sang cột \'Đích\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!fromColumnMatch || !toColumnMatch) {
        const response = 'Vui lòng chỉ rõ cột nguồn và cột đích. Ví dụ: copy thẻ \'Tên thẻ\' từ cột \'Nguồn\' sang cột \'Đích\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const cardTitle = cardNameMatch[1]
      const fromColumnTitle = fromColumnMatch[1]
      const toColumnTitle = toColumnMatch[1]

      // Lấy board details để có thông tin toàn diện về board, columns và cards
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm column nguồn và đích từ board details
      const sourceColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === fromColumnTitle.toLowerCase()
      )

      const targetColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === toColumnTitle.toLowerCase()
      )

      if (!sourceColumn) {
        const response = `Không tìm thấy cột nguồn '${fromColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!targetColumn) {
        const response = `Không tìm thấy cột đích '${toColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm card bằng title từ board details
      const card = boardDetails.cards.find(c =>
        c.title.toLowerCase() === cardTitle.toLowerCase() &&
        c.columnId.toString() === sourceColumn._id.toString()
      )

      if (!card) {
        const response = `Không tìm thấy thẻ '${cardTitle}' trong cột '${fromColumnTitle}'. Vui lòng kiểm tra lại tên thẻ.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Xác định các trường cần giữ lại
      // Danh sách tất cả các trường có thể giữ lại
      const allPossibleItems = [
        'memberIds',
        'dueDate',
        'checklists',
        'attachments',
        'location',
        'comments'
      ]

      // Mặc định giữ lại tất cả các trường
      let keepingItems = [...allPossibleItems]

      // Nếu trong câu lệnh có yêu cầu giữ lại trường cụ thể
      const keepMatch = message.match(/giữ\s+(?:lại|nguyên)(?:\s+(?:các|những))?\s+(?:trường|thông tin|phần)?\s+(.*?)(?:\s+và|\s*$)/i)

      if (keepMatch) {
        const specificFields = keepMatch[1].toLowerCase()
        keepingItems = []

        // Kiểm tra từng trường có thể giữ lại
        if (specificFields.includes('thành viên') || specificFields.includes('member')) {
          keepingItems.push('memberIds')
        }

        if (specificFields.includes('ngày hết hạn') || specificFields.includes('deadline') || specificFields.includes('due date') || specificFields.includes('duedate')) {
          keepingItems.push('dueDate')
        }

        if (specificFields.includes('checklist') || specificFields.includes('danh sách')) {
          keepingItems.push('checklists')
        }

        if (specificFields.includes('tệp đính kèm') || specificFields.includes('attachment') || specificFields.includes('file')) {
          keepingItems.push('attachments')
        }

        if (specificFields.includes('vị trí') || specificFields.includes('location')) {
          keepingItems.push('location')
        }

        if (specificFields.includes('bình luận') || specificFields.includes('comment')) {
          keepingItems.push('comments')
        }

        // Nếu không xác định được trường cụ thể, mặc định giữ lại tất cả
        if (keepingItems.length === 0) {
          keepingItems = [...allPossibleItems]
        }
      }

      // Sao chép card
      const newTitle = `Copy of ${card.title}`

      // Tạo data cho việc sao chép card
      const copyCardData = {
        currentBoardId: boardId,
        currentColumnId: sourceColumn._id.toString(),
        newBoardId: boardId,
        newColumnId: targetColumn._id.toString(),
        newPosition: targetColumn.cardOrderIds.length,
        title: newTitle,
        keepingItems: keepingItems
      }

      // Gọi service để copy card
      await cardService.copyCard(userId, card._id.toString(), copyCardData)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      let response = `Đã sao chép thẻ '${cardTitle}' từ cột '${fromColumnTitle}' sang cột '${toColumnTitle}' với tên mới '${newTitle}'`

      // Nếu có giữ lại trường cụ thể, thêm thông tin vào phản hồi
      if (keepMatch) {
        if (keepingItems.length === allPossibleItems.length) {
          response += ' và giữ lại tất cả thông tin.'
        } else {
          response += ' và chỉ giữ lại ' + keepingItems.map(item => {
            switch (item) {
            case 'memberIds': return 'thành viên'
            case 'dueDate': return 'ngày hết hạn'
            case 'checklists': return 'checklist'
            case 'attachments': return 'tệp đính kèm'
            case 'location': return 'vị trí'
            case 'comments': return 'bình luận'
            default: return item
            }
          }).join(', ') + '.'
        }
      } else {
        response += ' và giữ lại tất cả thông tin.'
      }

      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling copy card command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu sao chép thẻ.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleCreateCard(message, userId, boardId) {
    try {
      // Tìm kiếm tên card và tên cột trong câu lệnh bằng regex
      const cardTitleMatch = message.match(/(?:card|thẻ)\s+['"]([^'"]+)['"]/i)
      const columnNameMatch = message.match(/(?:trong|vào|tại|in|at|on|cột)\s+['"]([^'"]+)['"]/i)
      const descriptionMatch = message.match(/(?:mô tả|miêu tả|description|desc)(?:\s+là|\s+với|\s+với nội dung|:)?\s+['"]([^'"]+)['"]/i)
      const dueDateMatch = message.match(/(?:ngày hết hạn|hạn chót|deadline|due date|duedate)(?:\s+là|\s+vào|\s+:)?\s+['"]([^'"]+)['"]/i)
      const positionMatch = message.match(/(?:vị trí|position|pos)(?:\s+là|\s+=|\s+:)?\s*(?:["']?(\d+)["']?|(đầu|top|trên cùng|cuối|bottom|dưới cùng))/i)
      const priorityMatch = message.match(/(?:ưu tiên|priority)(?:\s+là|\s+=|\s+:)?\s+['"]?(cao|thấp|trung bình|high|medium|low)['"]?/i)

      if (!cardTitleMatch) {
        const response = 'Vui lòng chỉ rõ tên thẻ cần tạo. Ví dụ: tạo thẻ \'Tên thẻ\' vào cột \'Tên cột\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!columnNameMatch) {
        const response = 'Vui lòng chỉ rõ tên cột để thêm thẻ. Ví dụ: tạo thẻ \'Tên thẻ\' vào cột \'Tên cột\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const cardTitle = cardTitleMatch[1]
      const columnTitle = columnNameMatch[1]
      const description = descriptionMatch ? descriptionMatch[1] : ''

      // Lấy board details để có thông tin toàn diện về board, columns và cards
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm column để thêm card mới
      const targetColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === columnTitle.toLowerCase()
      )

      if (!targetColumn) {
        const response = `Không tìm thấy cột '${columnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra xem card với tên này đã tồn tại trong cột chưa
      const existingCard = boardDetails.cards.find(c =>
        c.title.toLowerCase() === cardTitle.toLowerCase() &&
        c.columnId.toString() === targetColumn._id.toString()
      )

      if (existingCard) {
        const response = `Thẻ có tên '${cardTitle}' đã tồn tại trong cột '${columnTitle}'. Vui lòng chọn tên khác.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Xác định ngày hết hạn nếu có
      let dueDate = null
      if (dueDateMatch) {
        const dueDateValue = dueDateMatch[1]
        // Thử phân tích cú pháp ngày tháng trong nhiều định dạng
        const parsedDate = new Date(dueDateValue)

        // Kiểm tra ngày hợp lệ (không phải Invalid Date)
        if (!isNaN(parsedDate.getTime())) {
          dueDate = parsedDate
        } else {
          // Hỗ trợ định dạng ngày phổ biến ở Việt Nam như dd/MM/yyyy
          const datePatterns = [
            /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/, // dd/MM/yyyy hoặc dd-MM-yyyy
            /(\d{1,2})[/-](\d{1,2})/ // dd/MM (năm hiện tại)
          ]

          let isValidDate = false

          for (const pattern of datePatterns) {
            const match = dueDateValue.match(pattern)
            if (match) {
              if (match.length === 4) { // dd/MM/yyyy
                const day = parseInt(match[1])
                const month = parseInt(match[2]) - 1
                const year = parseInt(match[3])
                const date = new Date(year, month, day)
                if (!isNaN(date.getTime())) {
                  dueDate = date
                  isValidDate = true
                  break
                }
              } else if (match.length === 3) { // dd/MM
                const day = parseInt(match[1])
                const month = parseInt(match[2]) - 1
                const year = new Date().getFullYear()
                const date = new Date(year, month, day)
                if (!isNaN(date.getTime())) {
                  dueDate = date
                  isValidDate = true
                  break
                }
              }
            }
          }

          // Hỗ trợ các từ khóa ngày tháng tương đối
          if (!isValidDate) {
            const lowerDueDateValue = dueDateValue.toLowerCase()
            const today = new Date()

            if (lowerDueDateValue.includes('hôm nay') || lowerDueDateValue.includes('today')) {
              dueDate = today
            } else if (lowerDueDateValue.includes('ngày mai') || lowerDueDateValue.includes('tomorrow')) {
              dueDate = new Date(today)
              dueDate.setDate(today.getDate() + 1)
            } else if (lowerDueDateValue.includes('tuần sau') || lowerDueDateValue.includes('next week')) {
              dueDate = new Date(today)
              dueDate.setDate(today.getDate() + 7)
            } else if (lowerDueDateValue.includes('tháng sau') || lowerDueDateValue.includes('next month')) {
              dueDate = new Date(today)
              dueDate.setMonth(today.getMonth() + 1)
            }
          }
        }
      }

      // Xác định vị trí mới
      let newPosition = targetColumn.cardOrderIds.length // Mặc định thêm vào cuối

      if (positionMatch) {
        if (positionMatch[1]) {
          // Nếu là số cụ thể
          const pos = parseInt(positionMatch[1])
          newPosition = Math.min(pos, targetColumn.cardOrderIds.length)
        } else if (positionMatch[2]) {
          // Nếu là vị trí đặc biệt (đầu/cuối)
          const posType = positionMatch[2].toLowerCase()
          if (posType === 'đầu' || posType === 'top' || posType === 'trên cùng') {
            newPosition = 0
          }
          // Nếu là cuối thì giữ giá trị mặc định
        }
      }

      // Xác định mức độ ưu tiên
      let priority = null
      if (priorityMatch) {
        const priorityValue = priorityMatch[1].toLowerCase()
        if (priorityValue === 'cao' || priorityValue === 'high') {
          priority = 'high'
        } else if (priorityValue === 'trung bình' || priorityValue === 'medium') {
          priority = 'medium'
        } else if (priorityValue === 'thấp' || priorityValue === 'low') {
          priority = 'low'
        }
      }

      // Tạo card mới với đầy đủ thông tin
      const newCardData = {
        boardId: boardId,
        columnId: targetColumn._id.toString(),
        title: cardTitle
      }

      if (description) {
        newCardData.description = description
      }

      // Thêm các trường tùy chọn nếu có
      if (dueDate) {
        newCardData.dueDate = dueDate
      }

      if (priority) {
        newCardData.priority = priority
      }

      const newCard = await cardService.createNew(userId, newCardData)

      // Cập nhật cardOrderIds của column tại vị trí chỉ định
      const updatedCardOrderIds = [...targetColumn.cardOrderIds]
      updatedCardOrderIds.splice(newPosition, 0, newCard.insertedId)
      await columnService.update(userId, targetColumn._id, { cardOrderIds: updatedCardOrderIds })

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi đầy đủ
      let response = `Đã tạo thẻ mới '${cardTitle}' trong cột '${columnTitle}'`

      // Thêm thông tin về vị trí
      if (newPosition === 0) {
        response += ' ở vị trí đầu tiên'
      } else if (newPosition === targetColumn.cardOrderIds.length) {
        response += ' ở vị trí cuối cùng'
      } else {
        response += ` ở vị trí thứ ${newPosition + 1}`
      }

      // Thêm thông tin các thuộc tính khác
      const attributes = []
      if (description) {
        attributes.push(`mô tả: '${description}'`)
      }

      if (dueDate) {
        const formattedDate = dueDate.toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
        attributes.push(`ngày hết hạn: ${formattedDate}`)
      }

      if (priority) {
        const priorityText = {
          'high': 'cao',
          'medium': 'trung bình',
          'low': 'thấp'
        }
        attributes.push(`độ ưu tiên: ${priorityText[priority]}`)
      }

      if (attributes.length > 0) {
        response += ' với ' + attributes.join(', ')
      }

      if (attributes.length === 0) {
        response += ' (không có thông tin bổ sung)'
      }

      await chatBotService.saveChat(userId, boardId, message, response)
      return response

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling create card command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu tạo thẻ mới.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleCardDetails(message, userId, boardId) {
    try {
      // Tìm kiếm tên card và tên cột trong câu lệnh bằng regex
      const cardNameMatch = message.match(/(?:card|thẻ)\s+['"]([^'"]+)['"]/i)
      const columnNameMatch = message.match(/(?:từ|tại|trong|ở|cột)\s+['"]([^'"]+)['"]/i)

      if (!cardNameMatch) {
        const response = 'Vui lòng chỉ rõ tên thẻ cần xem thông tin. Ví dụ: xem thông tin thẻ \'Tên thẻ\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const cardTitle = cardNameMatch[1]
      const columnTitle = columnNameMatch ? columnNameMatch[1] : null

      // Lấy board details để có thông tin toàn diện về board, columns và cards
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm card cần xem thông tin
      let card = null
      let column = null

      if (columnTitle) {
        // Nếu có thông tin cột, tìm cột trước
        column = boardDetails.columns.find(col =>
          col.title.toLowerCase() === columnTitle.toLowerCase()
        )

        if (!column) {
          const response = `Không tìm thấy cột '${columnTitle}'. Vui lòng kiểm tra lại tên cột.`
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Tìm card trong cột cụ thể
        card = boardDetails.cards.find(c =>
          c.title.toLowerCase() === cardTitle.toLowerCase() &&
          c.columnId.toString() === column._id.toString()
        )
      } else {
        // Nếu không có thông tin cột, tìm card trên toàn bộ board
        card = boardDetails.cards.find(c =>
          c.title.toLowerCase() === cardTitle.toLowerCase()
        )

        if (card) {
          // Tìm cột chứa card này
          column = boardDetails.columns.find(col =>
            col._id.toString() === card.columnId.toString()
          )
        }
      }

      if (!card) {
        const response = columnTitle
          ? `Không tìm thấy thẻ '${cardTitle}' trong cột '${columnTitle}'. Vui lòng kiểm tra lại tên thẻ.`
          : `Không tìm thấy thẻ '${cardTitle}' trên bảng này. Vui lòng kiểm tra lại tên thẻ.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tạo phản hồi với thông tin chi tiết về card
      let cardDetailsResponse = `Thông tin chi tiết của thẻ '${card.title}':\n`
      cardDetailsResponse += `- Tiêu đề: ${card.title}\n`
      cardDetailsResponse += `- Mô tả: ${card.description || 'Không có mô tả'}\n`
      cardDetailsResponse += `- Thuộc cột: ${column ? column.title : 'Không xác định'}\n`

      if (card.memberIds && card.memberIds.length > 0) {
        cardDetailsResponse += `- Thành viên: ${card.memberIds.length} người được gán\n`
      }

      if (card.comments && card.comments.length > 0) {
        cardDetailsResponse += `- Bình luận: ${card.comments.length} bình luận\n`
      }

      if (card.attachments && card.attachments.length > 0) {
        cardDetailsResponse += `- Tệp đính kèm: ${card.attachments.length} tệp\n`
      }

      if (card.dueDate) {
        const dueDate = new Date(card.dueDate)
        const formattedDate = dueDate.toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
        cardDetailsResponse += `- Ngày hết hạn: ${formattedDate}\n`
      }

      if (card.checklists && card.checklists.length > 0) {
        cardDetailsResponse += `- Danh sách kiểm tra: ${card.checklists.length} danh sách\n`

        let completedItems = 0
        let totalItems = 0

        card.checklists.forEach(checklist => {
          if (checklist.items && checklist.items.length > 0) {
            totalItems += checklist.items.length
            completedItems += checklist.items.filter(item => item.completed).length
          }
        })

        if (totalItems > 0) {
          const percentage = Math.floor((completedItems / totalItems) * 100)
          cardDetailsResponse += `  - Tiến độ: ${completedItems}/${totalItems} mục đã hoàn thành (${percentage}%)\n`
        }
      }

      await chatBotService.saveChat(userId, boardId, message, cardDetailsResponse)
      return cardDetailsResponse

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling card details command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu xem thông tin thẻ.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleUpdateCard(message, userId, boardId) {
    try {
      // Tìm kiếm tên card và tên cột trong câu lệnh bằng regex
      const cardNameMatch = message.match(/(?:card|thẻ)\s+['"]([^'"]+)['"]/i)
      const columnNameMatch = message.match(/(?:trong|ở|từ|tại|cột)\s+['"]([^'"]+)['"]/i)

      // Tìm các thông tin cần cập nhật
      const newTitleMatch = message.match(/(?:tiêu đề|title|tên) (?:mới|thành|là|=|:)?\s+['"]([^'"]+)['"]/i)
      const newDescriptionMatch = message.match(/(?:mô tả|description|desc) (?:mới|thành|là|=|:)?\s+['"]([^'"]+)['"]/i)
      const newDueDateMatch = message.match(/(?:ngày hết hạn|deadline|due date) (?:mới|thành|là|=|:)?\s+['"]([^'"]+)['"]/i)
      const priorityMatch = message.match(/(?:ưu tiên|priority) (?:là|thành|=|:)?\s+['"]?(cao|thấp|trung bình|high|medium|low)['"]?/i)

      // Tìm xem người dùng muốn cập nhật tất cả hay chỉ một card cụ thể
      const updateAllMatch = message.match(/(?:tất cả|all|toàn bộ|cả|mọi)/i)
      const specificCardMatch = message.match(/(?:card|thẻ)(?:\s+(?:số|vị trí|thứ))?\s+(\d+)/i)
      const confirmationMatch = message.match(/(?:xác nhận|chắc chắn|đồng ý|confirm|yes|cập nhật luôn|cập nhật ngay|có)(?!\s+(?:card|thẻ))/i)

      if (!cardNameMatch) {
        const response = 'Vui lòng chỉ rõ tên thẻ cần cập nhật. Ví dụ: cập nhật thẻ \'Tên thẻ\' trong cột \'Tên cột\' tiêu đề mới \'Tiêu đề mới\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!newTitleMatch && !newDescriptionMatch && !newDueDateMatch && !priorityMatch) {
        const response = 'Vui lòng chỉ rõ thông tin cần cập nhật (tiêu đề, mô tả, ngày hết hạn hoặc độ ưu tiên). Ví dụ: cập nhật thẻ \'Tên thẻ\' tiêu đề mới \'Tiêu đề mới\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const cardTitle = cardNameMatch[1]
      const columnTitle = columnNameMatch ? columnNameMatch[1] : null
      const hasConfirmation = !!confirmationMatch
      const updateAll = !!updateAllMatch
      const specificCardIndex = specificCardMatch ? parseInt(specificCardMatch[1]) - 1 : -1

      // Lấy board details để có thông tin toàn diện về board, columns và cards
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm tất cả card có tên tương ứng
      let matchingCards = []
      let columns = new Map() // Lưu thông tin cột theo columnId

      if (columnTitle) {
        // Nếu có thông tin cột, tìm cột trước
        const column = boardDetails.columns.find(col =>
          col.title.toLowerCase() === columnTitle.toLowerCase()
        )

        if (!column) {
          const response = `Không tìm thấy cột '${columnTitle}'. Vui lòng kiểm tra lại tên cột.`
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Tìm các card trong cột cụ thể
        const cardsInColumn = boardDetails.cards.filter(c =>
          c.title.toLowerCase() === cardTitle.toLowerCase() &&
          c.columnId.toString() === column._id.toString()
        )

        if (cardsInColumn.length > 0) {
          matchingCards = cardsInColumn
          columns.set(column._id.toString(), column)
        }
      } else {
        // Tìm tất cả card có tên tương ứng trong toàn bộ board
        matchingCards = boardDetails.cards.filter(c =>
          c.title.toLowerCase() === cardTitle.toLowerCase()
        )

        // Lưu thông tin các cột chứa card
        matchingCards.forEach(card => {
          const column = boardDetails.columns.find(col =>
            col._id.toString() === card.columnId.toString()
          )
          if (column) {
            columns.set(column._id.toString(), column)
          }
        })
      }

      if (matchingCards.length === 0) {
        const response = columnTitle
          ? `Không tìm thấy thẻ '${cardTitle}' trong cột '${columnTitle}'. Vui lòng kiểm tra lại tên thẻ.`
          : `Không tìm thấy thẻ '${cardTitle}' trên bảng này. Vui lòng kiểm tra lại tên thẻ.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Nếu chỉ có 1 card thì cập nhật luôn
      if (matchingCards.length === 1) {
        // Tiếp tục xử lý với card duy nhất
      }
      // Nếu có nhiều card trùng tên và chưa có chỉ định cụ thể
      else if (matchingCards.length > 1 && !hasConfirmation && specificCardIndex === -1 && !updateAll) {
        // Tạo thông tin về các card trùng tên
        let cardInfo = ''
        let cardListDetails = ''

        // Lấy thông tin vị trí của các card trong cột và tạo danh sách thẻ chi tiết
        const cardDetailsPromises = matchingCards.map(async (card, index) => {
          const column = columns.get(card.columnId.toString())

          // Lấy vị trí của card trong cột
          let cardPosition = -1
          if (column) {
            cardPosition = column.cardOrderIds.findIndex(id => id.toString() === card._id.toString())
            // Chuyển đổi vị trí từ index (0-based) sang số thứ tự hiển thị cho người dùng (1-based)
            cardPosition = cardPosition + 1
          }

          let details = `${index + 1}. Thẻ '${card.title}' trong cột '${column ? column.title : 'Không xác định'}'`

          // Thêm vị trí của card trong cột
          if (cardPosition > 0) {
            details += `, vị trí: ${cardPosition} trong cột`
          }

          // Thêm mô tả ngắn nếu có
          if (card.description) {
            const shortDesc = card.description.length > 30
              ? card.description.substring(0, 30) + '...'
              : card.description
            details += `, mô tả: '${shortDesc}'`
          }

          // Thêm thông tin về ngày hết hạn nếu có
          if (card.dueDate) {
            const dueDate = new Date(card.dueDate)
            const formattedDate = dueDate.toLocaleDateString('vi-VN', {
              month: 'numeric',
              day: 'numeric'
            })
            details += `, hạn: ${formattedDate}`
          }

          details += '\n'
          return details
        })

        // Chờ tất cả các promise hoàn thành
        const cardDetailsList = await Promise.all(cardDetailsPromises)
        cardListDetails = cardDetailsList.join('')

        // Kiểm tra xem đã có lệnh lọc theo cột cụ thể hay chưa
        const hasColumnFilter = !!columnTitle

        // Nếu đã có lệnh lọc theo cột cụ thể hoặc tất cả các thẻ đều trong cùng một cột
        const uniqueColumnCount = new Set([...columns.values()].map(col => col._id.toString())).size
        const allCardsInSameColumn = uniqueColumnCount === 1

        if (hasColumnFilter || allCardsInSameColumn) {
          // Có nhiều thẻ trong cùng một cột
          const columnName = columnTitle || columns.values().next().value.title
          cardInfo = `Có ${matchingCards.length} thẻ trùng tên '${cardTitle}' trong cột '${columnName}':\n${cardListDetails}\n`
          cardInfo += 'Bạn muốn cập nhật tất cả các thẻ trên hay chỉ một thẻ cụ thể? Vui lòng trả lời:\n'
          cardInfo += '- "Cập nhật tất cả" để cập nhật tất cả các thẻ\n'
          cardInfo += '- "Cập nhật thẻ số [số thứ tự]" để cập nhật một thẻ cụ thể\n'
          cardInfo += '- "Cập nhật thẻ số 1, 2, 3" để cập nhật nhiều thẻ cụ thể'
        } else {
          // Có nhiều thẻ trong nhiều cột khác nhau
          const columnList = Array.from(columns.values()).map(col => `'${col.title}'`).join(', ')
          cardInfo = `Có ${matchingCards.length} thẻ trùng tên '${cardTitle}' được tìm thấy trong các cột: ${columnList}:\n${cardListDetails}\n`
          cardInfo += 'Bạn muốn cập nhật tất cả các thẻ trên hay chỉ một thẻ cụ thể? Vui lòng trả lời:\n'
          cardInfo += '- "Cập nhật tất cả" để cập nhật tất cả các thẻ\n'
          cardInfo += '- "Cập nhật thẻ số [số thứ tự]" để cập nhật một thẻ cụ thể\n'
          cardInfo += '- "Cập nhật thẻ số 1, 2, 3" để cập nhật nhiều thẻ cụ thể'
        }

        const response = cardInfo
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Chuẩn bị dữ liệu cập nhật
      const updateData = {
        updatedAt: Date.now()
      }

      // Cập nhật tiêu đề nếu có
      if (newTitleMatch) {
        const newTitle = newTitleMatch[1]
        updateData.title = newTitle
        updateData.slug = newTitle.toLowerCase()
          .replace(/\s+/g, '-') // Thay khoảng trắng bằng dấu gạch ngang
          .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
          .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
          .replace(/[ìíịỉĩ]/g, 'i')
          .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
          .replace(/[ùúụủũưừứựửữ]/g, 'u')
          .replace(/[ỳýỵỷỹ]/g, 'y')
          .replace(/đ/g, 'd')
          .replace(/[^\w\\-]+/g, '') // Loại bỏ tất cả ký tự không phải chữ cái, số, gạch ngang
          .replace(/-\\-+/g, '-') // Thay nhiều gạch ngang liên tiếp bằng một gạch ngang
          .replace(/^-+/, '') // Cắt bỏ gạch ngang ở đầu
          .replace(/-+$/, '') // Cắt bỏ gạch ngang ở cuối
      }

      // Cập nhật mô tả nếu có
      if (newDescriptionMatch) {
        updateData.description = newDescriptionMatch[1]
      }

      // Xác định ngày hết hạn mới nếu có
      if (newDueDateMatch) {
        const dueDateValue = newDueDateMatch[1]
        // Thử phân tích cú pháp ngày tháng trong nhiều định dạng
        const parsedDate = new Date(dueDateValue)

        // Kiểm tra ngày hợp lệ (không phải Invalid Date)
        if (!isNaN(parsedDate.getTime())) {
          updateData.dueDate = parsedDate
        } else {
          // Hỗ trợ định dạng ngày phổ biến ở Việt Nam như dd/MM/yyyy
          const datePatterns = [
            /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/, // dd/MM/yyyy hoặc dd-MM-yyyy
            /(\d{1,2})[/-](\d{1,2})/ // dd/MM (năm hiện tại)
          ]

          let isValidDate = false

          for (const pattern of datePatterns) {
            const match = dueDateValue.match(pattern)
            if (match) {
              if (match.length === 4) { // dd/MM/yyyy
                const day = parseInt(match[1])
                const month = parseInt(match[2]) - 1
                const year = parseInt(match[3])
                const date = new Date(year, month, day)
                if (!isNaN(date.getTime())) {
                  updateData.dueDate = date
                  isValidDate = true
                  break
                }
              } else if (match.length === 3) { // dd/MM
                const day = parseInt(match[1])
                const month = parseInt(match[2]) - 1
                const year = new Date().getFullYear()
                const date = new Date(year, month, day)
                if (!isNaN(date.getTime())) {
                  updateData.dueDate = date
                  isValidDate = true
                  break
                }
              }
            }
          }

          // Hỗ trợ các từ khóa ngày tháng tương đối
          if (!isValidDate) {
            const lowerDueDateValue = dueDateValue.toLowerCase()
            const today = new Date()

            if (lowerDueDateValue.includes('hôm nay') || lowerDueDateValue.includes('today')) {
              updateData.dueDate = today
            } else if (lowerDueDateValue.includes('ngày mai') || lowerDueDateValue.includes('tomorrow')) {
              updateData.dueDate = new Date(today)
              updateData.dueDate.setDate(today.getDate() + 1)
            } else if (lowerDueDateValue.includes('tuần sau') || lowerDueDateValue.includes('next week')) {
              updateData.dueDate = new Date(today)
              updateData.dueDate.setDate(today.getDate() + 7)
            } else if (lowerDueDateValue.includes('tháng sau') || lowerDueDateValue.includes('next month')) {
              updateData.dueDate = new Date(today)
              updateData.dueDate.setMonth(today.getMonth() + 1)
            }
          }
        }
      }

      // Xác định mức độ ưu tiên nếu có
      if (priorityMatch) {
        const priorityValue = priorityMatch[1].toLowerCase()
        if (priorityValue === 'cao' || priorityValue === 'high') {
          updateData.priority = 'high'
        } else if (priorityValue === 'trung bình' || priorityValue === 'medium') {
          updateData.priority = 'medium'
        } else if (priorityValue === 'thấp' || priorityValue === 'low') {
          updateData.priority = 'low'
        }
      }

      // Thực hiện cập nhật card
      // Nếu chọn cập nhật một card cụ thể
      if (specificCardIndex >= 0 && specificCardIndex < matchingCards.length) {
        // Chỉ cập nhật card được chỉ định
        await cardService.update(userId, matchingCards[specificCardIndex]._id.toString(), updateData)
      } else {
        // Cập nhật tất cả card hoặc card duy nhất
        for (const card of matchingCards) {
          await cardService.update(userId, card._id.toString(), updateData)
        }
      }

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      let response = ''

      if (matchingCards.length === 1) {
        // Nếu chỉ có một card
        const column = columns.get(matchingCards[0].columnId.toString())
        response = `Đã cập nhật thẻ '${cardTitle}'${column ? ` trong cột '${column.title}'` : ''}`
      } else if (specificCardIndex >= 0 && specificCardIndex < matchingCards.length) {
        // Nếu đã chọn cập nhật một card cụ thể
        const selectedCard = matchingCards[specificCardIndex]
        const column = columns.get(selectedCard.columnId.toString())
        response = `Đã cập nhật thẻ số ${specificCardIndex + 1}: '${cardTitle}'${column ? ` trong cột '${column.title}'` : ''}`
      } else if (matchingCards.length > 1 && columnTitle) {
        // Nếu có nhiều card trong cùng một cột và đã chọn cập nhật tất cả
        response = `Đã cập nhật tất cả ${matchingCards.length} thẻ có tên '${cardTitle}' trong cột '${columnTitle}'`
      } else {
        // Nếu có nhiều card trong nhiều cột khác nhau và đã chọn cập nhật tất cả
        const columnList = Array.from(columns.values()).map(col => `'${col.title}'`).join(', ')
        response = `Đã cập nhật tất cả ${matchingCards.length} thẻ có tên '${cardTitle}' từ các cột: ${columnList}`
      }

      // Thêm thông tin về các trường đã cập nhật
      const updatedFields = []
      if (newTitleMatch) {
        updatedFields.push(`tiêu đề thành '${updateData.title}'`)
      }
      if (newDescriptionMatch) {
        updatedFields.push(`mô tả thành '${updateData.description}'`)
      }
      if (newDueDateMatch && updateData.dueDate) {
        const formattedDate = updateData.dueDate.toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
        updatedFields.push(`ngày hết hạn thành ${formattedDate}`)
      }
      if (priorityMatch && updateData.priority) {
        const priorityText = {
          'high': 'cao',
          'medium': 'trung bình',
          'low': 'thấp'
        }
        updatedFields.push(`độ ưu tiên thành ${priorityText[updateData.priority]}`)
      }

      if (updatedFields.length > 0) {
        response += ` với các thay đổi: ${updatedFields.join(', ')}`
      }

      await chatBotService.saveChat(userId, boardId, message, response)
      return response

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling update card command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu cập nhật thẻ.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  }
}
