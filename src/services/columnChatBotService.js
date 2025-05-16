import { boardModel } from '~/models/boardModel'
import { columnService } from '~/services/columnService'
import { chatBotService, emitBatchEvent } from './chatBotService'
import { slugify } from '~/utils/formatter'

export const columnChatBotService = {
  async handleCreateColumn(message, userId, boardId) {
    try {
      // Kiểm tra xem có phải yêu cầu tạo nhiều cột không
      const multipleColumnsMatch = message.match(/(?:tạo|thêm|create|add)\s+(?:các|nhiều|multiple)\s+(?:cột|column)/i)
      // Pattern để tìm nhiều tên cột trong dấu ngoặc đơn hoặc kép
      const multipleColumnsTitlesPattern = /['"]([^'"]+)['"]/g

      if (multipleColumnsMatch) {
        // Trường hợp tạo nhiều cột
        const columnTitles = []
        let columnTitleMatch

        // Lấy tất cả tên cột từ câu lệnh
        while ((columnTitleMatch = multipleColumnsTitlesPattern.exec(message)) !== null) {
          columnTitles.push(columnTitleMatch[1])
        }

        if (columnTitles.length === 0) {
          const response = 'Vui lòng chỉ rõ tên các cột cần tạo trong dấu ngoặc đơn hoặc kép. Ví dụ: tạo các cột \'Tên cột 1\', \'Tên cột 2\''
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Lấy board details để có thông tin toàn diện về board và columns
        const boardDetails = await boardModel.getDetails(userId, boardId)
        if (!boardDetails) {
          const response = 'Không thể tìm thấy thông tin của board.'
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }
        // Kiểm tra xem câu lệnh có chỉ định vị trí không
        const specificPositionsMatch = message.match(/(?:vị trí|position|pos)\s+(\d+(?:\s*,\s*\d+)*)/i)
        let positions = []

        if (specificPositionsMatch) {
          // Lấy các vị trí từ câu lệnh
          positions = specificPositionsMatch[1].split(',').map(pos => {
            const position = parseInt(pos.trim())
            // Điều chỉnh vị trí (chuyển từ 1-based sang 0-based)
            return Math.max(0, position - 1)
          })
        }

        // Tạo các cột theo thứ tự
        const createdColumns = []
        let updatedBoard = await boardModel.findOneById(boardId)

        for (let i = 0; i < columnTitles.length; i++) {
          const columnTitle = columnTitles[i]

          // Xác định vị trí cho cột
          let newPosition

          if (i < positions.length) {
            // Sử dụng vị trí được chỉ định nếu có
            newPosition = positions[i]
          } else {
            // Mặc định thêm vào cuối
            newPosition = updatedBoard.columnOrderIds.length
          }

          // Đảm bảo vị trí không vượt quá số lượng cột hiện tại
          newPosition = Math.min(newPosition, updatedBoard.columnOrderIds.length)

          // Tạo cột mới
          const newColumnData = {
            boardId: boardId,
            title: columnTitle
          }

          // Tạo cột mới và lấy thông tin về cột
          const newColumn = await columnService.createNew(newColumnData)

          // Nếu không phải vị trí cuối cùng, điều chỉnh thứ tự cột
          if (newPosition < updatedBoard.columnOrderIds.length - 1) {
            // Lấy board mới nhất sau khi tạo cột
            updatedBoard = await boardModel.findOneById(boardId)

            // Lấy columnOrderIds hiện tại
            const currentColumnOrderIds = [...updatedBoard.columnOrderIds]

            // Tìm vị trí của cột mới (thường là vị trí cuối)
            const newColumnId = newColumn._id
            const newColumnIdIndex = currentColumnOrderIds.findIndex(id =>
              id.toString() === newColumnId.toString()
            )

            if (newColumnIdIndex !== -1) {
              // Xóa columnId khỏi vị trí cuối
              currentColumnOrderIds.splice(newColumnIdIndex, 1)

              // Thêm columnId vào vị trí mong muốn
              currentColumnOrderIds.splice(newPosition, 0, newColumnId)

              // Cập nhật lại columnOrderIds của board
              await boardModel.update(boardId, { columnOrderIds: currentColumnOrderIds })

              // Cập nhật lại board sau khi thay đổi
              updatedBoard = await boardModel.findOneById(boardId)
            }
          }

          createdColumns.push({
            title: columnTitle,
            position: newPosition
          })
        }

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        // Tạo thông báo phản hồi
        let response = `Đã tạo ${createdColumns.length} cột mới:\n`

        for (const column of createdColumns) {
          response += `- Cột '${column.title}' ở vị trí ${column.position + 1}\n`
        }

        await chatBotService.saveChat(userId, boardId, message, response)
        return response

      } else {
        // Trường hợp tạo một cột
        // Tìm kiếm tên cột và vị trí trong câu lệnh bằng regex
        const columnTitleMatch = message.match(/(?:cột|column)\s+['"]([^'"]+)['"]/i)
        const positionMatch = message.match(/(?:vị trí|position|pos)(?:\s+là|\s+=|\s+:)?\s*(?:["']?(\d+)["']?|(đầu|top|trên cùng|đầu tiên|cuối|bottom|dưới cùng|cuối cùng))/i)

        if (!columnTitleMatch) {
          const response = 'Vui lòng chỉ rõ tên cột cần tạo. Ví dụ: tạo cột \'Tên cột\''
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        const columnTitle = columnTitleMatch[1]

        // Lấy board details để có thông tin toàn diện về board và columns
        const boardDetails = await boardModel.getDetails(userId, boardId)
        if (!boardDetails) {
          const response = 'Không thể tìm thấy thông tin của board.'
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Kiểm tra xem cột với tên này đã tồn tại trên board chưa
        const existingColumn = boardDetails.columns.find(col =>
          col.title.toLowerCase() === columnTitle.toLowerCase()
        )

        if (existingColumn) {
          const response = `Cột có tên '${columnTitle}' đã tồn tại trên bảng này. Vui lòng chọn tên khác.`
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Xác định vị trí mới
        let newPosition = boardDetails.columns.length // Mặc định thêm vào cuối

        if (positionMatch) {
          if (positionMatch[1]) {
            // Nếu là số cụ thể
            const pos = parseInt(positionMatch[1])
            newPosition = Math.min(pos - 1, boardDetails.columns.length) // Điều chỉnh vị trí cho người dùng (người dùng đếm từ 1, hệ thống từ 0)
            newPosition = Math.max(0, newPosition) // Đảm bảo vị trí không âm
          } else if (positionMatch[2]) {
            // Nếu là vị trí đặc biệt (đầu/cuối)
            const posType = positionMatch[2].toLowerCase()
            if (posType === 'đầu' || posType === 'top' || posType === 'trên cùng' || posType === 'đầu tiên') {
              newPosition = 0
            }
            // Nếu là cuối thì giữ giá trị mặc định
          }
        }

        // Tạo cột mới
        const newColumnData = {
          boardId: boardId,
          title: columnTitle
        }

        // Tạo cột mới và lấy thông tin về cột
        const newColumn = await columnService.createNew(newColumnData)

        // Lưu ý: service columnService.createNew đã tự động thêm columnId vào cuối mảng columnOrderIds
        // Nếu vị trí không phải ở cuối, cần điều chỉnh lại thứ tự cột trong board
        if (newPosition < boardDetails.columns.length) {
          // Lấy board mới nhất (đã được cập nhật với cột mới ở cuối)
          const updatedBoard = await boardModel.findOneById(boardId)
          if (!updatedBoard) {
            const response = 'Không thể tìm thấy thông tin của board sau khi tạo cột.'
            await chatBotService.saveChat(userId, boardId, message, response)
            return response
          }

          // Lấy columnOrderIds hiện tại
          const currentColumnOrderIds = [...updatedBoard.columnOrderIds]

          // Tìm vị trí của cột mới (thường là vị trí cuối)
          const newColumnId = newColumn._id
          const newColumnIdIndex = currentColumnOrderIds.findIndex(id =>
            id.toString() === newColumnId.toString()
          )

          if (newColumnIdIndex !== -1) {
            // Xóa columnId khỏi vị trí cuối
            currentColumnOrderIds.splice(newColumnIdIndex, 1)

            // Thêm columnId vào vị trí mong muốn
            currentColumnOrderIds.splice(newPosition, 0, newColumnId)

            // Cập nhật lại columnOrderIds của board
            await boardModel.update(boardId, { columnOrderIds: currentColumnOrderIds })
          }
        }

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        // Tạo thông báo phản hồi đầy đủ
        let response = `Đã tạo cột mới '${columnTitle}'`

        // Thêm thông tin về vị trí
        if (newPosition === 0) {
          response += ' ở vị trí đầu tiên'
        } else if (newPosition === boardDetails.columns.length) {
          response += ' ở vị trí cuối cùng'
        } else {
          response += ` ở vị trí thứ ${newPosition + 1}`
        }

        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }
    } catch (error) {
      console.error('Error handling create column command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu tạo cột mới.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleCopyColumn(message, userId, boardId) {
    try {
      // Tìm kiếm tên cột nguồn và cột đích trong câu lệnh bằng regex
      const sourceColumnMatch = message.match(/(?:sao chép|copy|nhân bản)\s+(?:cột|column)\s+['"]([^'"]+)['"]/i)
      const toPositionMatch = message.match(/(?:vị trí|position|pos)(?:\s+là|\s+=|\s+:)?\s*(?:["']?(\d+)["']?|(đầu|top|trên cùng|đầu tiên|cuối|bottom|dưới cùng|cuối cùng))/i)
      const newNameMatch = message.match(/(?:tên mới|new name|new title)\s+['"]([^'"]+)['"]/i)

      if (!sourceColumnMatch) {
        const response = 'Vui lòng chỉ rõ tên cột cần sao chép. Ví dụ: sao chép cột \'Tên cột\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const sourceColumnTitle = sourceColumnMatch[1]
      const newColumnTitle = newNameMatch ? newNameMatch[1] : `Bản sao của ${sourceColumnTitle}`

      // Lấy board details để có thông tin toàn diện về board và columns
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm cột nguồn trong board
      const sourceColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === sourceColumnTitle.toLowerCase()
      )

      if (!sourceColumn) {
        const response = `Không tìm thấy cột '${sourceColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra xem cột với tên mới này đã tồn tại trên board chưa
      const existingColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === newColumnTitle.toLowerCase()
      )

      if (existingColumn) {
        const response = `Cột có tên '${newColumnTitle}' đã tồn tại trên bảng này. Vui lòng chọn tên khác.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Xác định vị trí cho cột mới
      let newPosition = boardDetails.columns.length // Mặc định thêm vào cuối

      if (toPositionMatch) {
        if (toPositionMatch[1]) {
          // Nếu là số cụ thể
          const pos = parseInt(toPositionMatch[1])
          newPosition = Math.min(pos - 1, boardDetails.columns.length) // Điều chỉnh vị trí cho người dùng (người dùng đếm từ 1, hệ thống từ 0)
          newPosition = Math.max(0, newPosition) // Đảm bảo vị trí không âm
        } else if (toPositionMatch[2]) {
          // Nếu là vị trí đặc biệt (đầu/cuối)
          const posType = toPositionMatch[2].toLowerCase()
          if (posType === 'đầu' || posType === 'top' || posType === 'trên cùng' || posType === 'đầu tiên') {
            newPosition = 0
          }
          // Nếu là cuối thì giữ giá trị mặc định
        }
      }

      // Chuẩn bị dữ liệu để sao chép cột
      const copyColumnData = {
        currentBoardId: boardId,
        newBoardId: boardId, // Sao chép trong cùng một board
        newPosition: newPosition,
        title: newColumnTitle
      }

      // Gọi service để sao chép cột
      const newColumn = await columnService.copyColumn(sourceColumn._id.toString(), copyColumnData)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      let response = `Đã sao chép cột '${sourceColumnTitle}' thành cột mới '${newColumnTitle}'`

      // Thêm thông tin về vị trí
      if (newPosition === 0) {
        response += ' ở vị trí đầu tiên'
      } else if (newPosition === boardDetails.columns.length) {
        response += ' ở vị trí cuối cùng'
      } else {
        response += ` ở vị trí thứ ${newPosition + 1}`
      }

      // Thêm thông tin về số lượng thẻ đã được sao chép
      const cardsInSourceColumn = boardDetails.cards.filter(card =>
        card.columnId.toString() === sourceColumn._id.toString()
      )

      if (cardsInSourceColumn.length > 0) {
        response += ` với ${cardsInSourceColumn.length} thẻ.`
      } else {
        response += ' (không có thẻ nào).'
      }

      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling copy column command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu sao chép cột.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleMoveAllCards(message, userId, boardId) {
    try {
      // Tìm kiếm tên cột nguồn và cột đích trong câu lệnh bằng regex linh hoạt hơn
      // Sử dụng nhiều pattern riêng biệt để tăng khả năng khớp
      let sourceColumnTitle, targetColumnTitle

      // Pattern chính để tìm cột nguồn
      const sourceColumnPatterns = [
        /(?:di chuyển|move|chuyển)\s+(?:tất cả|all|toàn bộ)\s+(?:các|những)?\s+(?:thẻ|card)\s+(?:từ|trong|của|in|from)\s+(?:cột|column)\s+['"]([^'"]+)['"]/i,
        /(?:di chuyển|move|chuyển)\s+(?:tất cả|all|toàn bộ)\s+(?:các|những)?\s+(?:thẻ|card)\s+['"]([^'"]+)['"]/i,
        /['"]([^'"]+)['"]\s+(?:sang|đến|tới|vào|to)/i
      ]

      // Pattern chính để tìm cột đích
      const targetColumnPatterns = [
        /(?:sang|đến|tới|vào|to|into)\s+(?:cột|column)\s+['"]([^'"]+)['"]/i,
        /(?:sang|đến|tới|vào|to|into)\s+['"]([^'"]+)['"]/i
      ]

      // Thử các pattern cho cột nguồn
      for (const pattern of sourceColumnPatterns) {
        const match = message.match(pattern)
        if (match && match[1]) {
          sourceColumnTitle = match[1]
          break
        }
      }

      // Thử các pattern cho cột đích
      for (const pattern of targetColumnPatterns) {
        const match = message.match(pattern)
        if (match && match[1]) {
          targetColumnTitle = match[1]
          break
        }
      }

      // Nếu không tìm được tên cột nguồn
      if (!sourceColumnTitle) {
        const response = 'Vui lòng chỉ rõ tên cột nguồn chứa các thẻ cần di chuyển. Ví dụ: di chuyển tất cả thẻ từ cột \'Tên cột nguồn\' sang cột \'Tên cột đích\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Nếu không tìm được tên cột đích
      if (!targetColumnTitle) {
        const response = 'Vui lòng chỉ rõ tên cột đích để di chuyển các thẻ đến. Ví dụ: di chuyển tất cả thẻ từ cột \'Tên cột nguồn\' sang cột \'Tên cột đích\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra xem cột nguồn và cột đích có trùng nhau không
      if (sourceColumnTitle.toLowerCase() === targetColumnTitle.toLowerCase()) {
        const response = 'Cột nguồn và cột đích không thể giống nhau. Vui lòng chỉ định hai cột khác nhau.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Lấy board details để có thông tin toàn diện về board và columns
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm cột nguồn và cột đích trong board
      const sourceColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === sourceColumnTitle.toLowerCase()
      )

      const targetColumn = boardDetails.columns.find(col =>
        col.title.toLowerCase() === targetColumnTitle.toLowerCase()
      )

      if (!sourceColumn) {
        const response = `Không tìm thấy cột nguồn '${sourceColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!targetColumn) {
        const response = `Không tìm thấy cột đích '${targetColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Đếm số thẻ trong cột nguồn
      const cardsInSourceColumn = boardDetails.cards.filter(card =>
        card.columnId.toString() === sourceColumn._id.toString()
      )

      // Kiểm tra xem cột nguồn có thẻ không
      if (cardsInSourceColumn.length === 0) {
        const response = `Cột '${sourceColumnTitle}' không có thẻ nào để di chuyển.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Gọi service để di chuyển tất cả thẻ sang cột mới
      await columnService.moveAllCardsToAnotherColumn(sourceColumn._id.toString(), targetColumn._id.toString())

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      const response = `Đã di chuyển tất cả ${cardsInSourceColumn.length} thẻ từ cột '${sourceColumnTitle}' sang cột '${targetColumnTitle}'.`
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling move all cards command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu di chuyển tất cả thẻ.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleCloseColumn(message, userId, boardId) {
    try {
      // Xác định loại lệnh đóng cột (một cột, nhiều cột, hoặc tất cả)
      const closeAllColumnsMatch = message.match(/(?:đóng|close)\s+(?:tất cả|all|toàn bộ)\s+(?:các|những)?\s+(?:cột|column)/i)
      const closeMultipleColumnsMatch = message.match(/(?:đóng|close)\s+(?:các|nhiều|multiple)\s+(?:cột|column)/i)

      // Kiểm tra xem có phải lệnh đóng cột theo vị trí không
      const closeByPositionMatch = message.match(/(?:đóng|close)\s+(?:cột|column)?\s+(?:ở|tại|at|in)?\s*(?:vị trí|position)\s+(?:thứ|số|number)?(?:\s*(\d+)(?:[,\s]+(?:và|and|\d+)[,\s]*(?:\d+)*)?)/i)

      // Lấy board details để có thông tin toàn diện về board và columns
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Trường hợp 0: Đóng cột theo vị trí
      if (closeByPositionMatch) {
        // Tìm tất cả các số trong câu lệnh
        const positionNumbers = message.match(/\d+/g).map(Number)

        if (positionNumbers.length === 0) {
          const response = 'Không thể xác định vị trí cột cần đóng. Vui lòng thử lại với vị trí cột cụ thể.'
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Xác định các cột theo vị trí
        const columnsByPosition = []
        const invalidPositions = []

        for (const position of positionNumbers) {
          // Người dùng đếm từ 1, hệ thống từ 0
          const index = position - 1

          if (index >= 0 && index < boardDetails.columns.length) {
            const columnAtPosition = boardDetails.columns[index]
            columnsByPosition.push({
              id: columnAtPosition._id.toString(),
              title: columnAtPosition.title,
              position: position
            })
          } else {
            invalidPositions.push(position)
          }
        }

        if (columnsByPosition.length === 0) {
          let response = 'Không tìm thấy cột ở vị trí đã chỉ định.'
          if (invalidPositions.length > 0) {
            response += ` Các vị trí không hợp lệ: ${invalidPositions.join(', ')}. Board hiện tại có ${boardDetails.columns.length} cột.`
          }
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Đóng các cột
        for (const column of columnsByPosition) {
          await columnService.closeColumn(column.id, true)
        }

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        // Tạo thông báo phản hồi
        let response = ''
        if (columnsByPosition.length === 1) {
          response = `Đã đóng cột '${columnsByPosition[0].title}' ở vị trí thứ ${columnsByPosition[0].position}.`
        } else {
          response = `Đã đóng ${columnsByPosition.length} cột ở các vị trí: ${columnsByPosition.map(col => `'${col.title}' (vị trí ${col.position})`).join(', ')}.`
        }

        if (invalidPositions.length > 0) {
          response += ` Không tìm thấy cột ở ${invalidPositions.length > 1 ? 'các vị trí' : 'vị trí'}: ${invalidPositions.join(', ')}.`
        }

        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Trường hợp 1: Đóng tất cả các cột
      if (closeAllColumnsMatch) {
        // Gọi service để đóng tất cả các cột
        await columnService.closeAllColumns(boardId, true)

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        const response = `Đã đóng tất cả ${boardDetails.columns.length} cột trên bảng.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Pattern để tìm nhiều tên cột trong dấu ngoặc đơn hoặc kép
      const columnTitlesInQuotesPattern = /['"]([^'"]+)['"]/g
      let columnTitles = []
      let columnTitleMatch

      // Lấy tất cả tên cột từ câu lệnh nếu có trong dấu ngoặc
      while ((columnTitleMatch = columnTitlesInQuotesPattern.exec(message)) !== null) {
        columnTitles.push(columnTitleMatch[1])
      }

      // Nếu không tìm thấy tên cột trong dấu ngoặc, thử tìm tên cột không có dấu ngoặc
      if (columnTitles.length === 0) {
        // Loại bỏ các từ khóa lệnh để lấy phần còn lại
        let cleanedMessage = message.toLowerCase()
          .replace(/(?:đóng|close)\s+(?:các|những|nhiều|multiple)?\s*(?:cột|column)\s+/i, '')
          .replace(/(?:đóng|close)\s+/i, '')

        // Tách các tên cột bằng dấu phẩy hoặc từ 'và', 'and'
        const potentialColumnTitles = cleanedMessage.split(/[,\s]+(?:và|and|,)\s+|[,\s]+/)
          .map(title => title.trim())
          .filter(title => title.length > 0)

        // Kiểm tra từng tên cột tiềm năng với danh sách cột trong board
        for (const potentialTitle of potentialColumnTitles) {
          // Tìm cột có tên gần giống nhất
          const matchingColumn = boardDetails.columns.find(col =>
            col.title.toLowerCase().includes(potentialTitle) ||
            potentialTitle.includes(col.title.toLowerCase())
          )

          if (matchingColumn) {
            columnTitles.push(matchingColumn.title)
          }
        }
      }

      // Trường hợp 2: Đóng nhiều cột
      if (closeMultipleColumnsMatch || columnTitles.length > 1) {
        if (columnTitles.length === 0) {
          const response = 'Không thể xác định tên các cột cần đóng. Vui lòng thử lại với tên cột cụ thể hơn.'
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Tìm và đóng từng cột
        const closedColumns = []
        const notFoundColumns = []

        for (const columnTitle of columnTitles) {
          // Tìm cột trong board
          const column = boardDetails.columns.find(col =>
            col.title.toLowerCase() === columnTitle.toLowerCase()
          )

          if (column) {
            // Đóng cột
            await columnService.closeColumn(column._id.toString(), true)
            closedColumns.push(columnTitle)
          } else {
            notFoundColumns.push(columnTitle)
          }
        }

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        // Tạo thông báo phản hồi
        let response = ''

        if (closedColumns.length > 0) {
          response += `Đã đóng ${closedColumns.length} cột: ${closedColumns.map(title => `'${title}'`).join(', ')}.`
        }

        if (notFoundColumns.length > 0) {
          response += ` Không tìm thấy ${notFoundColumns.length} cột: ${notFoundColumns.map(title => `'${title}'`).join(', ')}.`
        }

        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Trường hợp 3: Đóng một cột
      // Thử tìm tên cột trong dấu ngoặc trước
      const columnTitleInQuotesMatch = message.match(/(?:đóng|close)\s+(?:cột|column)\s+['"]([^'"]+)['"]/i)
      let columnTitle = ''

      if (columnTitleInQuotesMatch) {
        columnTitle = columnTitleInQuotesMatch[1]
      } else if (columnTitles.length === 1) {
        // Nếu đã tìm được một cột từ phân tích không dấu ngoặc
        columnTitle = columnTitles[0]
      } else {
        // Thử tìm tên cột không có dấu ngoặc
        const cleanedMessage = message.toLowerCase()
          .replace(/(?:đóng|close)\s+(?:cột|column)\s+/i, '')
          .replace(/(?:đóng|close)\s+/i, '')
          .trim()

        // Tìm cột có tên gần giống nhất
        const matchingColumn = boardDetails.columns.find(col =>
          col.title.toLowerCase().includes(cleanedMessage) ||
          cleanedMessage.includes(col.title.toLowerCase())
        )

        if (matchingColumn) {
          columnTitle = matchingColumn.title
        }
      }

      if (!columnTitle) {
        const response = 'Không thể xác định tên cột cần đóng. Vui lòng thử lại với tên cột cụ thể hơn.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm cột trong board
      const column = boardDetails.columns.find(col =>
        col.title.toLowerCase() === columnTitle.toLowerCase()
      )

      if (!column) {
        const response = `Không tìm thấy cột '${columnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Đóng cột
      await columnService.closeColumn(column._id.toString(), true)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      const response = `Đã đóng cột '${columnTitle}'.`
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling close column command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu đóng cột.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleOpenColumn(message, userId, boardId) {
    try {
      // Xác định loại lệnh mở cột (một cột, nhiều cột, hoặc tất cả)
      const openAllColumnsMatch = message.match(/(?:mở|open)\s+(?:tất cả|all|toàn bộ)\s+(?:các|những)?\s+(?:cột|column)/i)
      const openMultipleColumnsMatch = message.match(/(?:mở|open)\s+(?:các|nhiều|multiple)\s+(?:cột|column)/i)

      // Kiểm tra xem có phải lệnh mở cột theo vị trí không
      const openByPositionMatch = message.match(/(?:mở|open)\s+(?:cột|column)?\s+(?:ở|tại|at|in)?\s*(?:vị trí|position)\s+(?:thứ|số|number)?(?:\s*(\d+)(?:[,\s]+(?:và|and|\d+)[,\s]*(?:\d+)*)?)/i)

      // Lấy board details để có thông tin toàn diện về board và columns
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Trường hợp 0: Mở cột theo vị trí
      if (openByPositionMatch) {
        // Tìm tất cả các số trong câu lệnh
        const positionNumbers = message.match(/\d+/g).map(Number)

        if (positionNumbers.length === 0) {
          const response = 'Không thể xác định vị trí cột cần mở. Vui lòng thử lại với vị trí cột cụ thể.'
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Xác định các cột theo vị trí
        const columnsByPosition = []
        const invalidPositions = []

        for (const position of positionNumbers) {
          // Người dùng đếm từ 1, hệ thống từ 0
          const index = position - 1

          if (index >= 0 && index < boardDetails.columns.length) {
            const columnAtPosition = boardDetails.columns[index]
            columnsByPosition.push({
              id: columnAtPosition._id.toString(),
              title: columnAtPosition.title,
              position: position
            })
          } else {
            invalidPositions.push(position)
          }
        }

        if (columnsByPosition.length === 0) {
          let response = 'Không tìm thấy cột ở vị trí đã chỉ định.'
          if (invalidPositions.length > 0) {
            response += ` Các vị trí không hợp lệ: ${invalidPositions.join(', ')}. Board hiện tại có ${boardDetails.columns.length} cột.`
          }
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Mở các cột
        for (const column of columnsByPosition) {
          await columnService.closeColumn(column.id, false)
        }

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        // Tạo thông báo phản hồi
        let response = ''
        if (columnsByPosition.length === 1) {
          response = `Đã mở cột '${columnsByPosition[0].title}' ở vị trí thứ ${columnsByPosition[0].position}.`
        } else {
          response = `Đã mở ${columnsByPosition.length} cột ở các vị trí: ${columnsByPosition.map(col => `'${col.title}' (vị trí ${col.position})`).join(', ')}.`
        }

        if (invalidPositions.length > 0) {
          response += ` Không tìm thấy cột ở ${invalidPositions.length > 1 ? 'các vị trí' : 'vị trí'}: ${invalidPositions.join(', ')}.`
        }

        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Trường hợp 1: Mở tất cả các cột
      if (openAllColumnsMatch) {
        // Gọi service để mở tất cả các cột
        await columnService.closeAllColumns(boardId, false)

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        const response = 'Đã mở tất cả cột trên bảng.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Pattern để tìm nhiều tên cột trong dấu ngoặc đơn hoặc kép
      const columnTitlesInQuotesPattern = /['"]([^'"]+)['"]/g
      let columnTitles = []
      let columnTitleMatch

      // Lấy tất cả tên cột từ câu lệnh nếu có trong dấu ngoặc
      while ((columnTitleMatch = columnTitlesInQuotesPattern.exec(message)) !== null) {
        columnTitles.push(columnTitleMatch[1])
      }

      // Nếu không tìm thấy tên cột trong dấu ngoặc, thử tìm tên cột không có dấu ngoặc
      if (columnTitles.length === 0) {
        // Loại bỏ các từ khóa lệnh để lấy phần còn lại
        let cleanedMessage = message.toLowerCase()
          .replace(/(?:mở|open)\s+(?:các|những|nhiều|multiple)?\s*(?:cột|column)\s+/i, '')
          .replace(/(?:mở|open)\s+/i, '')

        // Tách các tên cột bằng dấu phẩy hoặc từ 'và', 'and'
        const potentialColumnTitles = cleanedMessage.split(/[,\s]+(?:và|and|,)\s+|[,\s]+/)
          .map(title => title.trim())
          .filter(title => title.length > 0)

        // Kiểm tra từng tên cột tiềm năng với danh sách cột trong board
        for (const potentialTitle of potentialColumnTitles) {
          // Tìm cột có tên gần giống nhất
          const matchingColumn = boardDetails.columns.find(col =>
            col.title.toLowerCase().includes(potentialTitle) ||
            potentialTitle.includes(col.title.toLowerCase())
          )

          if (matchingColumn) {
            columnTitles.push(matchingColumn.title)
          }
        }
      }

      // Trường hợp 2: Mở nhiều cột
      if (openMultipleColumnsMatch || columnTitles.length > 1) {
        if (columnTitles.length === 0) {
          const response = 'Không thể xác định tên các cột cần mở. Vui lòng thử lại với tên cột cụ thể hơn.'
          await chatBotService.saveChat(userId, boardId, message, response)
          return response
        }

        // Tìm và mở từng cột
        const openedColumns = []
        const notFoundColumns = []

        for (const columnTitle of columnTitles) {
          // Tìm cột trong board
          const column = boardDetails.columns.find(col =>
            col.title.toLowerCase() === columnTitle.toLowerCase()
          )

          if (column) {
            // Mở cột
            await columnService.closeColumn(column._id.toString(), false)
            openedColumns.push(columnTitle)
          } else {
            notFoundColumns.push(columnTitle)
          }
        }

        // Phát sự kiện batch để cập nhật UI
        emitBatchEvent(boardId)

        // Tạo thông báo phản hồi
        let response = ''

        if (openedColumns.length > 0) {
          response += `Đã mở ${openedColumns.length} cột: ${openedColumns.map(title => `'${title}'`).join(', ')}.`
        }

        if (notFoundColumns.length > 0) {
          response += ` Không tìm thấy ${notFoundColumns.length} cột: ${notFoundColumns.map(title => `'${title}'`).join(', ')}.`
        }

        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Trường hợp 3: Mở một cột
      // Thử tìm tên cột trong dấu ngoặc trước
      const columnTitleInQuotesMatch = message.match(/(?:mở|open)\s+(?:cột|column)\s+['"]([^'"]+)['"]/i)
      let columnTitle = ''

      if (columnTitleInQuotesMatch) {
        columnTitle = columnTitleInQuotesMatch[1]
      } else if (columnTitles.length === 1) {
        // Nếu đã tìm được một cột từ phân tích không dấu ngoặc
        columnTitle = columnTitles[0]
      } else {
        // Thử tìm tên cột không có dấu ngoặc
        const cleanedMessage = message.toLowerCase()
          .replace(/(?:mở|open)\s+(?:cột|column)\s+/i, '')
          .replace(/(?:mở|open)\s+/i, '')
          .trim()

        // Tìm cột có tên gần giống nhất
        const matchingColumn = boardDetails.columns.find(col =>
          col.title.toLowerCase().includes(cleanedMessage) ||
          cleanedMessage.includes(col.title.toLowerCase())
        )

        if (matchingColumn) {
          columnTitle = matchingColumn.title
        }
      }

      if (!columnTitle) {
        const response = 'Không thể xác định tên cột cần mở. Vui lòng thử lại với tên cột cụ thể hơn.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm cột trong board
      const column = boardDetails.columns.find(col =>
        col.title.toLowerCase() === columnTitle.toLowerCase()
      )

      if (!column) {
        const response = `Không tìm thấy cột '${columnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Mở cột
      await columnService.closeColumn(column._id.toString(), false)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      const response = `Đã mở cột '${columnTitle}'.`
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling open column command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu mở cột.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async handleRenameColumn(message, userId, boardId) {
    try {
      // Tìm kiếm tên cột cũ và tên mới trong câu lệnh
      const columnOldNameMatch = message.match(/(?:đổi tên|rename|sửa tên)\s+(?:cột|column)\s+['"]([^'"]+)['"]/i)
      const columnNewNameMatch = message.match(/(?:thành|to|sang|thay đổi thành|change to|thay đổi|set to)\s+['"]([^'"]+)['"]/i)

      if (!columnOldNameMatch) {
        const response = 'Vui lòng chỉ rõ tên cột cần đổi tên. Ví dụ: đổi tên cột \'Tên cột cũ\' thành \'Tên cột mới\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      if (!columnNewNameMatch) {
        const response = 'Vui lòng chỉ rõ tên mới cho cột. Ví dụ: đổi tên cột \'Tên cột cũ\' thành \'Tên cột mới\''
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      const oldColumnTitle = columnOldNameMatch[1]
      const newColumnTitle = columnNewNameMatch[1]

      // Lấy board details để có thông tin toàn diện về board và columns
      const boardDetails = await boardModel.getDetails(userId, boardId)
      if (!boardDetails) {
        const response = 'Không thể tìm thấy thông tin của board.'
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Tìm cột cần đổi tên trong board
      const columnToRename = boardDetails.columns.find(col =>
        col.title.toLowerCase() === oldColumnTitle.toLowerCase()
      )

      if (!columnToRename) {
        const response = `Không tìm thấy cột '${oldColumnTitle}'. Vui lòng kiểm tra lại tên cột.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Kiểm tra xem tên mới đã tồn tại trên board chưa
      const existingColumnWithNewName = boardDetails.columns.find(col =>
        col.title.toLowerCase() === newColumnTitle.toLowerCase() && 
        col._id.toString() !== columnToRename._id.toString()
      )

      if (existingColumnWithNewName) {
        const response = `Cột có tên '${newColumnTitle}' đã tồn tại trên bảng này. Vui lòng chọn tên khác.`
        await chatBotService.saveChat(userId, boardId, message, response)
        return response
      }

      // Cập nhật tên cột
      const updateData = {
        title: newColumnTitle,
        slug: slugify(newColumnTitle) // Đảm bảo slug cũng được cập nhật
      }

      // Gọi service để cập nhật tên cột
      await columnService.update(columnToRename._id.toString(), updateData)

      // Phát sự kiện batch để cập nhật UI
      emitBatchEvent(boardId)

      // Tạo thông báo phản hồi
      const response = `Đã đổi tên cột '${oldColumnTitle}' thành '${newColumnTitle}'.`
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    } catch (error) {
      console.error('Error handling rename column command:', error)
      const response = 'Đã xảy ra lỗi khi xử lý yêu cầu đổi tên cột.'
      await chatBotService.saveChat(userId, boardId, message, response)
      return response
    }
  }
}
