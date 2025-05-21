// src/services/aiService.js
import OpenAI from 'openai'
import { chatBotHistoryModel } from '~/models/chatBotHistoryModel'
import { cardChatBotService } from '~/services/cardChatBotService'
import { columnChatBotService } from '~/services/columnChatBotService'
import { boardChatBotService } from '~/services/boardChatBotService'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Lấy tham chiếu đến io server từ server.js
let io

// Hàm để thiết lập kết nối socket.io từ bên ngoài (sẽ được gọi từ server.js)
export const setupSocketIo = (socketIo) => {
  io = socketIo
}

// Hàm gửi sự kiện batch qua socket
export const emitBatchEvent = (boardId) => {
  if (io) {
    io.emit('batch', boardId)
  } else {
    console.error('Socket.IO instance not initialized')
  }
}

// Các pattern để nhận diện lệnh từ người dùng (giữ lại để tương thích với code cũ)
const COMMAND_PATTERNS = {
  SUMMARY: /(?:tóm tắt|summary)/i,

  // Card patterns
  MOVE_CARD: /(?:di chuyển|move|chuyển) (?:thẻ|card)/i,
  COPY_CARD: /(?:sao chép|copy|nhân bản) (?:thẻ|card)/i,
  DELETE_CARD: /(?:xóa|xoá|delete|remove) (?:thẻ|card|cột|column|bảng|board)/i,
  CREATE_CARD: /(?:tạo|thêm|create|add) (?:thẻ|card) (?:mới|new)?/i,
  CARD_DETAILS: /(?:thông tin|details|chi tiết) (?:thẻ|card)/i,
  UPDATE_CARD: /(?:cập nhật|update|sửa|chỉnh sửa|edit) (?:thẻ|card)/i,

  // Column patterns
  CREATE_COLUMN: /(?:tạo|thêm|create|add) (?:cột|column|các cột|nhiều cột|multiple column) (?:mới|new)?/i,
  RENAME_COLUMN: /(?:đổi tên|rename|sửa tên) (?:cột|column)/i,
  COPY_COLUMN: /(?:sao chép|copy|nhân bản) (?:cột|column)/i,
  MOVE_ALL_CARDS: /(?:di chuyển|move|chuyển) (?:tất cả|all|toàn bộ) (?:các|những)? (?:thẻ|card)/i,
  CLOSE_COLUMN: /(?:đóng|close) (?:cột|column|các cột|nhiều cột|tất cả cột|all column)/i,
  OPEN_COLUMN: /(?:mở|open) (?:cột|column|các cột|nhiều cột|tất cả cột|all column)/i,

  // Board patterns
  UPDATE_BOARD: /(?:cập nhật|update|sửa|chỉnh sửa|edit|đổi tên|rename) (?:bảng|board)/i,
  OPEN_BOARD: /(?:mở|open) (?:bảng|board)/i,
  CLOSE_BOARD: /(?:đóng|close) (?:bảng|board)/i
}

// Kiểm tra xem câu lệnh có sử dụng dấu ngoặc đơn hoặc ngoặc kép cho tên thẻ/cột không
const checkCommandFormat = (message, command) => {
  // Tạo các pattern cụ thể cho từng loại lệnh
  let cardNamePattern, columnNamePattern

  if (command === 'MOVE_CARD' || command === 'COPY_CARD') {
    // Di chuyển hoặc sao chép thẻ cần có dấu ngoặc cho cả tên thẻ và tên cột nguồn/đích
    cardNamePattern = /(?:thẻ|card)\s+['"]([^'"]+)['"]/i
    columnNamePattern = /(?:cột|column)\s+['"]([^'"]+)['"]|['"]([^'"]+)['"]\s+(?:cột|column)/i
  } else if (command === 'DELETE_CARD' || command === 'CARD_DETAILS') {
    // Xóa hoặc xem chi tiết thẻ chỉ cần dấu ngoặc cho tên thẻ
    cardNamePattern = /(?:thẻ|card)\s+['"]([^'"]+)['"]/i
    columnNamePattern = null
  } else if (command === 'CREATE_CARD') {
    // Tạo thẻ cần có dấu ngoặc cho tên thẻ mới và tên cột
    cardNamePattern = /(?:thẻ|card)\s+['"]([^'"]+)['"]/i
    columnNamePattern = /(?:cột|column)\s+['"]([^'"]+)['"]|['"]([^'"]+)['"]\s+(?:cột|column)/i
  } else if (command === 'UPDATE_CARD') {
    // Cập nhật thẻ cần có dấu ngoặc cho tên thẻ và thông tin cập nhật
    cardNamePattern = /(?:thẻ|card)\s+['"]([^'"]+)['"]/i
    columnNamePattern = null

    // Kiểm tra xem có ít nhất một thông tin cập nhật trong dấu ngoặc (tiêu đề, mô tả, ngày hết hạn) không
    const hasUpdateInfo = /(?:tiêu đề|title|tên|mô tả|description|desc|ngày hết hạn|deadline|due date)\s+(?:mới|thành|là|=|:)?\s+['"]([^'"]+)['"]/i.test(message)

    if (!hasUpdateInfo) {
      return {
        isValid: false,
        message: 'Vui lòng cung cấp thông tin cần cập nhật trong dấu ngoặc. Ví dụ: cập nhật thẻ \'Tên thẻ\' tiêu đề mới \'Tiêu đề mới\''
      }
    }
  }


  else if (command === 'CREATE_COLUMN') {
    // Tạo cột chỉ cần có dấu ngoặc cho tên cột mới
    cardNamePattern = null
    columnNamePattern = /(?:cột|column)\s+['"]([^'"]+)['"]/i
  }

  else if (command === 'RENAME_COLUMN') {
    // Đổi tên cột chỉ cần có dấu ngoặc cho tên cột mới
    cardNamePattern = null
    columnNamePattern = /(?:cột|column)\s+['"]([^'"]+)['"]/i
  }

  else if (command === 'COPY_COLUMN') {
    // Sao chép cột chỉ cần có dấu ngoặc cho tên cột nguồn
    cardNamePattern = null
    columnNamePattern = /(?:cột|column)\s+['"]([^'"]+)['"]/i
  } else if (command === 'CLOSE_COLUMN') {
    // Đóng cột không nhất thiết cần có dấu ngoặc cho tên cột
    cardNamePattern = null
    columnNamePattern = null

    // Trường hợp đặc biệt: đóng tất cả cột không cần ngoặc
    if (/(?:đóng|close)\s+(?:tất cả|all|toàn bộ)\s+(?:các|những)?\s+(?:cột|column)/i.test(message)) {
      return { isValid: true, message: '' }
    }

    // Trường hợp đóng nhiều cột - không cần kiểm tra dấu ngoặc
    if (/(?:đóng|close)\s+(?:các|nhiều|multiple)\s+(?:cột|column)/i.test(message)) {
      return { isValid: true, message: '' }
    }

    // Trường hợp đóng một cột - không cần kiểm tra dấu ngoặc
    if (/(?:đóng|close)\s+(?:cột|column)/i.test(message) || /(?:đóng|close)/i.test(message)) {
      return { isValid: true, message: '' }
    }
  } else if (command === 'OPEN_COLUMN') {
    // Mở cột không nhất thiết cần có dấu ngoặc cho tên cột
    cardNamePattern = null
    columnNamePattern = null

    // Trường hợp đặc biệt: mở tất cả cột không cần ngoặc
    if (/(?:mở|open)\s+(?:tất cả|all|toàn bộ)\s+(?:các|những)?\s+(?:cột|column)/i.test(message)) {
      return { isValid: true, message: '' }
    }

    // Trường hợp mở nhiều cột - không cần kiểm tra dấu ngoặc
    if (/(?:mở|open)\s+(?:các|nhiều|multiple)\s+(?:cột|column)/i.test(message)) {
      return { isValid: true, message: '' }
    }

    // Trường hợp mở một cột - không cần kiểm tra dấu ngoặc
    if (/(?:mở|open)\s+(?:cột|column)/i.test(message) || /(?:mở|open)/i.test(message)) {
      return { isValid: true, message: '' }
    }
  }

  // Kiểm tra format
  const hasValidCardFormat = cardNamePattern ? cardNamePattern.test(message) : true
  const hasValidColumnFormat = columnNamePattern ? columnNamePattern.test(message) : true

  // Trả về kết quả kiểm tra và thông báo phù hợp
  if (!hasValidCardFormat && !hasValidColumnFormat) {
    return {
      isValid: false,
      message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh card và cột cần làm việc. Ví dụ: sao chép thẻ \'cardmoitiep\' ở cột \'đã xong\' sang cột \'chuẩn bị làm\''
    }
  } else if (!hasValidCardFormat && command !== 'CREATE_COLUMN' && command !== 'COPY_COLUMN' && command !== 'CLOSE_COLUMN') {
    return {
      isValid: false,
      message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh card cần làm việc. Ví dụ: sao chép thẻ \'cardmoitiep\' ở cột đã xong'
    }
  } else if (!hasValidColumnFormat) {
    if (command === 'CREATE_COLUMN') {
      return {
        isValid: false,
        message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh cột cần tạo. Ví dụ: tạo cột \'Tên cột\''
      }
    }
    else if (command === 'RENAME_COLUMN') {
      return {
        isValid: false,
        message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh cột cần đổi tên. Ví dụ: đổi tên cột \'Tên cột\' thành \'Tên cột mới\''
      }
    }

    else if (command === 'COPY_COLUMN') {
      return {
        isValid: false,
        message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh cột cần sao chép. Ví dụ: sao chép cột \'Tên cột\''
      }
    } else if (command === 'CLOSE_COLUMN') {
      return {
        isValid: false,
        message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh cột cần đóng. Ví dụ: đóng cột \'Tên cột\''
      }
    } else if (command === 'OPEN_COLUMN') {
      return {
        isValid: false,
        message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh cột cần mở. Ví dụ: mở cột \'Tên cột\''
      }
    } else {
      return {
        isValid: false,
        message: 'Bạn vui lòng sử dụng dấu \' hoặc " để chỉ đích danh cột cần làm việc. Ví dụ: sao chép thẻ cardmoitiep ở cột \'đã xong\''
      }
    }
  }

  return { isValid: true, message: '' }
}

// Hàm mới: Sử dụng OpenAI để phân tích ý định và trích xuất thông tin từ lệnh
async function analyzeUserIntent(message, userId, boardId, conversationHistory) {
  try {
    // Tạo prompt chứa thông tin về lịch sử trò chuyện gần nhất (nếu có)
    let systemPrompt = `Bạn là trợ lý thông minh trong một ứng dụng quản lý công việc (Trello). 
Nhiệm vụ của bạn là phân tích yêu cầu của người dùng và trả về JSON định dạng chuẩn để hệ thống xử lý.

Hãy phân tích ý định của người dùng là một trong các loại sau:
1. MOVE_CARD (di chuyển thẻ): Di chuyển thẻ từ cột này sang cột khác
2. COPY_CARD (sao chép thẻ): Sao chép thẻ từ cột này sang cột khác
3. DELETE_CARD (xóa thẻ): Xóa thẻ khỏi cột
4. CREATE_CARD (tạo thẻ): Tạo thẻ mới trong cột
5. CARD_DETAILS (xem thông tin thẻ): Xem thông tin chi tiết của thẻ
6. UPDATE_CARD (cập nhật thẻ): Cập nhật thông tin của thẻ (tiêu đề, mô tả, ngày hết hạn, độ ưu tiên)
7. BOARD_SUMMARY (tóm tắt bảng): Tóm tắt nội dung bảng
8. CREATE_COLUMN (tạo cột): Tạo cột mới trên bảng
9. COPY_COLUMN (sao chép cột): Sao chép cột hiện có thành cột mới
10. MOVE_ALL_CARDS (di chuyển tất cả thẻ): Di chuyển tất cả các thẻ từ cột này sang cột khác
11. CLOSE_COLUMN (đóng cột): Đóng một hoặc nhiều cột trên bảng
12. OPEN_COLUMN (mở cột): Mở một hoặc nhiều cột trên bảng
13. RENAME_COLUMN (đổi tên cột): Đổi tên cột trên bảng
14. UPDATE_BOARD (cập nhật bảng): Cập nhật thông tin của bảng (tiêu đề, loại)
15. GENERAL_QUERY (câu hỏi chung): Câu hỏi hoặc trò chuyện chung không liên quan đến các hành động trên

Nếu thuộc các loại từ 1-13, hãy trích xuất thông tin cần thiết tương ứng:
- MOVE_CARD: cardTitle, fromColumn, toColumn, position (nếu có)
- COPY_CARD: cardTitle, fromColumn, toColumn, keepingItems (nếu có)
- DELETE_CARD: cardTitle, column (nếu có), confirmation (true/false)
- CREATE_CARD: cardTitle, column, description (nếu có), dueDate (nếu có), priority (nếu có), position (nếu có)
- CARD_DETAILS: cardTitle, column (nếu có)
- UPDATE_CARD: cardTitle, column (nếu có), newTitle (nếu có), newDescription (nếu có), newDueDate (nếu có), priority (nếu có)
- BOARD_SUMMARY: không cần thông tin thêm
- CREATE_COLUMN: columnTitles (mảng các tên cột), positions (mảng các vị trí, nếu có), isMultipleColumns (boolean)
- COPY_COLUMN: sourceColumnTitle, newTitle (nếu có), position (nếu có)
- MOVE_ALL_CARDS: fromColumn, toColumn
- CLOSE_COLUMN: columnTitles (mảng tên các cột cần đóng), positions (mảng vị trí cột, nếu có), isAllColumns (boolean), isByPosition (boolean)
- OPEN_COLUMN: columnTitles (mảng tên các cột cần mở), positions (mảng vị trí cột, nếu có), isAllColumns (boolean), isByPosition (boolean)
- RENAME_COLUMN: columnTitle, newTitle (nếu có)
- UPDATE_BOARD: newTitle (nếu có), newType (nếu có, giá trị là 'public' hoặc 'private')
- OPEN_BOARD: không cần thông tin thêm
- CLOSE_BOARD: không cần thông tin thêm

Trả về JSON có cấu trúc:
{
  'intent': 'MOVE_CARD|COPY_CARD|DELETE_CARD|CREATE_CARD|CARD_DETAILS|UPDATE_CARD|BOARD_SUMMARY|CREATE_COLUMN|COPY_COLUMN|MOVE_ALL_CARDS|CLOSE_COLUMN|OPEN_COLUMN|GENERAL_QUERY',
  'data': {
    // các trường tương ứng với intent
  },
  'confidence': 0.0 - 1.0 // mức độ tự tin về việc nhận diện ý định
}

Lưu ý:
- Nếu cardTitle, columnTitle hoặc tên cột không được nêu rõ trong dấu ngoặc đơn hoặc ngoặc kép, hãy cố gắng đoán từ ngữ cảnh
- Trường confidence thấp (< 0.7) cho các ý định không rõ ràng
- Nếu không thể xác định rõ ý định, hãy chọn GENERAL_QUERY và đặt confidence thấp
- Với CREATE_COLUMN, nếu phát hiện người dùng muốn tạo nhiều cột, hãy đặt isMultipleColumns = true và columnTitles là mảng chứa tên các cột
- Với MOVE_ALL_CARDS, cần phải trích xuất chính xác fromColumn và toColumn từ yêu cầu người dùng
- Với CLOSE_COLUMN hoặc OPEN_COLUMN, nếu người dùng muốn đóng/mở tất cả các cột, hãy đặt isAllColumns = true
- Với CLOSE_COLUMN hoặc OPEN_COLUMN, nếu người dùng muốn đóng/mở cột theo vị trí (ví dụ: "đóng cột ở vị trí thứ 3"), hãy đặt isByPosition = true và positions là mảng chứa các vị trí cột`

    // Thêm thông tin về lịch sử trò chuyện gần nhất (nếu có)
    if (conversationHistory && conversationHistory.length > 0) {
      systemPrompt += '\n\nĐây là lịch sử trò chuyện gần nhất (từ cũ đến mới):'
      for (let i = Math.max(0, conversationHistory.length - 3); i < conversationHistory.length; i++) {
        systemPrompt += `\nUser: ${conversationHistory[i].message}`
        systemPrompt += `\nAI: ${conversationHistory[i].response}`
      }

    }

    // Gọi API phân tích ý định
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      response_format: { type: 'json_object' }
    })

    // Phân tích kết quả trả về
    const result = JSON.parse(completion.choices[0].message.content)
    return result
  } catch (error) {
    console.error('Error analyzing user intent:', error)
    return {
      intent: 'GENERAL_QUERY',
      data: {},
      confidence: 0.5
    }
  }
}

export const chatBotService = {
  async chat(message, userId, boardId) {
    try {
      const lowerMessage = message.toLowerCase()

      // Kiểm tra xem đây có phải là câu trả lời xác nhận cho các câu hỏi
      const lastMessage = await chatBotHistoryModel.getLastMessageForBoard(boardId)

      // Giữ nguyên các xử lý khác
      const isConfirmingUpdate = lastMessage &&
        lastMessage.response &&
        (lastMessage.response.includes('Bạn có chắc chắn muốn cập nhật tất cả?') ||
         lastMessage.response.includes('Bạn muốn cập nhật tất cả các thẻ trên hay chỉ một thẻ cụ thể?')) &&
        (lowerMessage.includes('có') ||
          lowerMessage.includes('xác nhận') ||
          lowerMessage.includes('đồng ý') ||
          lowerMessage.includes('yes') ||
          lowerMessage.includes('chắc chắn') ||
          lowerMessage === 'có' ||
          lowerMessage.includes('tất cả'))

      const isSpecificCardUpdate = lastMessage &&
        lastMessage.response &&
        (lastMessage.response.includes('Bạn muốn cập nhật tất cả các thẻ trên hay chỉ một thẻ cụ thể?') ||
         lastMessage.response.includes('Có nhiều thẻ trùng tên')) &&
        (lowerMessage.includes('thẻ số') || lowerMessage.includes('card số') || lowerMessage.match(/(?:thẻ|card)\s+(\d+)/i) || lowerMessage.match(/(\d+)/))

      const isMultipleSpecificCards = lastMessage &&
        lastMessage.response &&
        ((lastMessage.response.includes('Bạn muốn cập nhật tất cả các thẻ trên hay chỉ một thẻ cụ thể?') ||
         lastMessage.response.includes('Có nhiều thẻ trùng tên')) &&
         (lowerMessage.match(/(?:thẻ|card)\s+(?:\d+)[,\s]+(?:và|and|\d+)[,\s]*(?:\d+)*/i) ||
          lowerMessage.match(/(?:\d+)[,\s]+(?:và|and|\d+)[,\s]*(?:\d+)*/i) ||
          lowerMessage.match(/(?:thẻ|card)(?:\s+số|\s+vị trí|\s+thứ)?\s+(?:\d+)(?:[,\s]+(?:\d+))+/i) ||
          lowerMessage.match(/(?:\d+)(?:[,\s]+(?:\d+))+/i)))

      if (isConfirmingUpdate) {
        // Tìm lại câu lệnh cập nhật ban đầu
        const originalCommand = lastMessage.message
        // Thêm xác nhận vào câu lệnh gốc để cập nhật tất cả
        const updateCommand = originalCommand + ' tất cả'
        return await cardChatBotService.handleUpdateCard(updateCommand, userId, boardId)
      }

      if (isSpecificCardUpdate) {
        // Tìm số thẻ được chọn
        const cardNumberMatch = lowerMessage.match(/(?:thẻ|card)(?:\s+(?:số|vị trí|thứ))?\s+(\d+)/i) || lowerMessage.match(/(\d+)/)
        if (cardNumberMatch) {
          const cardNumber = cardNumberMatch[1]
          // Tìm lại câu lệnh cập nhật ban đầu
          const originalCommand = lastMessage.message
          // Thêm chỉ định thẻ cụ thể vào câu lệnh gốc
          const updateCommand = originalCommand + ` thẻ số ${cardNumber}`
          return await cardChatBotService.handleUpdateCard(updateCommand, userId, boardId)
        }
      }

      if (isMultipleSpecificCards) {
        // Tìm tất cả các số thẻ được chọn
        const allNumbers = (lowerMessage.match(/\d+/g) || []).map(Number)
        if (allNumbers.length > 0) {
          // Sắp xếp các số thẻ theo thứ tự tăng dần
          const cardNumbers = [...new Set(allNumbers)].sort((a, b) => a - b)
          // Tìm lại câu lệnh cập nhật ban đầu
          const originalCommand = lastMessage.message
          // Thêm chỉ định các thẻ cụ thể vào câu lệnh gốc
          const updateCommand = originalCommand + ` thẻ số ${cardNumbers.join(', ')}`
          return await cardChatBotService.handleUpdateCard(updateCommand, userId, boardId)
        }
      }

      // Lấy lịch sử trò chuyện để cung cấp ngữ cảnh
      const chatHistory = await this.getChatHistory(userId, boardId)
      // console.log('chatHistory', chatHistory)

      // Phân tích ý định người dùng bằng OpenAI
      const analysis = await analyzeUserIntent(message, userId, boardId, chatHistory)

      // Xử lý dựa trên ý định đã phân tích
      switch (analysis.intent) {
      case 'BOARD_SUMMARY':
        return await this.summarizeBoard(userId, boardId)

      case 'MOVE_CARD': {
        // Nếu độ tin cậy cao và đã xác định được các trường bắt buộc
        if (analysis.confidence >= 0.7 && analysis.data.cardTitle && analysis.data.fromColumn && analysis.data.toColumn) {
          // Tạo lệnh chuẩn hóa để tương thích với hàm xử lý hiện tại
          const standardizedCommand = `di chuyển thẻ '${analysis.data.cardTitle}' từ cột '${analysis.data.fromColumn}' sang cột '${analysis.data.toColumn}'${analysis.data.position ? ` vị trí ${analysis.data.position}` : ''}`
          return await cardChatBotService.handleMoveCard(standardizedCommand, userId, boardId)
        }
        // Nếu không đủ tin cậy hoặc thiếu thông tin, yêu cầu người dùng cung cấp thêm
        const missingMoveFields = []
        if (!analysis.data.cardTitle) missingMoveFields.push('tên thẻ')
        if (!analysis.data.fromColumn) missingMoveFields.push('cột nguồn')
        if (!analysis.data.toColumn) missingMoveFields.push('cột đích')

        if (missingMoveFields.length > 0) {
          const response = `Vui lòng cung cấp thêm thông tin về ${missingMoveFields.join(', ')} để tôi có thể giúp bạn di chuyển thẻ. Ví dụ: "Di chuyển thẻ 'Tên thẻ' từ cột 'Nguồn' sang cột 'Đích'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'COPY_CARD': {
        if (analysis.confidence >= 0.7 && analysis.data.cardTitle && analysis.data.fromColumn && analysis.data.toColumn) {
          // Tạo lệnh chuẩn hóa
          let standardizedCommand = `sao chép thẻ '${analysis.data.cardTitle}' từ cột '${analysis.data.fromColumn}' sang cột '${analysis.data.toColumn}'`

          // Thêm thông tin về các trường cần giữ lại nếu có
          if (analysis.data.keepingItems && Array.isArray(analysis.data.keepingItems) && analysis.data.keepingItems.length > 0) {
            standardizedCommand += ` giữ lại ${analysis.data.keepingItems.join(', ')}`
          }

          return await cardChatBotService.handleCopyCard(standardizedCommand, userId, boardId)
        }

        const missingCopyFields = []
        if (!analysis.data.cardTitle) missingCopyFields.push('tên thẻ')
        if (!analysis.data.fromColumn) missingCopyFields.push('cột nguồn')
        if (!analysis.data.toColumn) missingCopyFields.push('cột đích')

        if (missingCopyFields.length > 0) {
          const response = `Vui lòng cung cấp thêm thông tin về ${missingCopyFields.join(', ')} để tôi có thể giúp bạn sao chép thẻ. Ví dụ: "Sao chép thẻ 'Tên thẻ' từ cột 'Nguồn' sang cột 'Đích'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'DELETE_CARD': {
        // Thay đổi xử lý cho DELETE_CARD: Không thực hiện xóa mà chỉ thông báo cho người dùng
        const response = 'Các tính năng xóa đã bị vô hiệu hóa. Vui lòng xóa thủ công từ giao diện người dùng.'
        await this.saveChat(userId, boardId, message, response)
        return response
      }

      case 'CREATE_CARD': {
        if (analysis.confidence >= 0.7 && analysis.data.cardTitle && analysis.data.column) {
          let standardizedCommand = `tạo thẻ '${analysis.data.cardTitle}' vào cột '${analysis.data.column}'`

          if (analysis.data.description) {
            standardizedCommand += ` mô tả '${analysis.data.description}'` }

          if (analysis.data.dueDate) {
            standardizedCommand += ` ngày hết hạn '${analysis.data.dueDate}'`
          }

          if (analysis.data.priority) {
            standardizedCommand += ` ưu tiên ${analysis.data.priority}`
          }

          if (analysis.data.position) {
            standardizedCommand += ` vị trí ${analysis.data.position}`
          }

          return await cardChatBotService.handleCreateCard(standardizedCommand, userId, boardId)
        }

        const missingCreateFields = []
        if (!analysis.data.cardTitle) missingCreateFields.push('tên thẻ')
        if (!analysis.data.column) missingCreateFields.push('tên cột')

        if (missingCreateFields.length > 0) {
          const response = `Vui lòng cung cấp thêm thông tin về ${missingCreateFields.join(', ')} để tôi có thể giúp bạn tạo thẻ mới. Ví dụ: "Tạo thẻ 'Tên thẻ' vào cột 'Tên cột'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'CARD_DETAILS': {
        if (analysis.confidence >= 0.7 && analysis.data.cardTitle) {
          let standardizedCommand = `thông tin thẻ '${analysis.data.cardTitle}'`

          if (analysis.data.column) {
            standardizedCommand += ` từ cột '${analysis.data.column}'`
          }

          return await cardChatBotService.handleCardDetails(standardizedCommand, userId, boardId)
        }

        if (!analysis.data.cardTitle) {
          const response = 'Vui lòng cho biết tên thẻ bạn muốn xem thông tin. Ví dụ: "Xem thông tin thẻ \'Tên thẻ\'".'
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'UPDATE_CARD': {
        if (analysis.confidence >= 0.7 && analysis.data.cardTitle) {
          let standardizedCommand = `cập nhật thẻ '${analysis.data.cardTitle}'`

          if (analysis.data.column) {
            standardizedCommand += ` trong cột '${analysis.data.column}'`
          }

          // Thêm các thông tin cần cập nhật
          if (analysis.data.newTitle) {
            standardizedCommand += ` tiêu đề mới '${analysis.data.newTitle}'`
          }

          if (analysis.data.newDescription) {
            standardizedCommand += ` mô tả mới '${analysis.data.newDescription}'`
          }

          if (analysis.data.newDueDate) {
            standardizedCommand += ` ngày hết hạn mới '${analysis.data.newDueDate}'`
          }

          if (analysis.data.priority) {
            standardizedCommand += ` ưu tiên ${analysis.data.priority}`
          }

          return await cardChatBotService.handleUpdateCard(standardizedCommand, userId, boardId)
        }

        if (!analysis.data.cardTitle) {
          const response = 'Vui lòng cho biết tên thẻ bạn muốn cập nhật. Ví dụ: "Cập nhật thẻ \'Tên thẻ\' tiêu đề mới \'Tiêu đề mới\'".'
          await this.saveChat(userId, boardId, message, response)
          return response
        }

        const missingUpdateFields = []
        if (!analysis.data.newTitle && !analysis.data.newDescription && !analysis.data.newDueDate && !analysis.data.priority) {
          missingUpdateFields.push('thông tin cần cập nhật (tiêu đề, mô tả, ngày hết hạn hoặc độ ưu tiên)')
        }

        if (missingUpdateFields.length > 0) {
          const response = `Vui lòng cung cấp thêm ${missingUpdateFields.join(', ')} để tôi có thể giúp bạn cập nhật thẻ. Ví dụ: "Cập nhật thẻ 'Tên thẻ' tiêu đề mới 'Tiêu đề mới'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'CREATE_COLUMN': {
        if (analysis.confidence >= 0.7) {
          if (analysis.data.isMultipleColumns && Array.isArray(analysis.data.columnTitles) && analysis.data.columnTitles.length > 0) {
            // Xử lý tạo nhiều cột
            let standardizedCommand = 'tạo các cột '

            // Thêm tên các cột
            analysis.data.columnTitles.forEach((title, index) => {
              standardizedCommand += `'${title}'`
              if (index < analysis.data.columnTitles.length - 1) {
                standardizedCommand += ', '
              }
            })

            // Thêm thông tin về vị trí nếu có
            if (analysis.data.positions && Array.isArray(analysis.data.positions) && analysis.data.positions.length > 0) {
              standardizedCommand += ' vị trí '
              analysis.data.positions.forEach((pos, index) => {
                standardizedCommand += pos
                if (index < analysis.data.positions.length - 1) {
                  standardizedCommand += ', '
                }
              })
            }

            return await columnChatBotService.handleCreateColumn(standardizedCommand, userId, boardId)
          } else if (analysis.data.columnTitles && analysis.data.columnTitles.length === 1) {
            // Xử lý tạo một cột
            let standardizedCommand = `tạo cột '${analysis.data.columnTitles[0]}'`

            if (analysis.data.positions && analysis.data.positions.length > 0) {
              standardizedCommand += ` vị trí ${analysis.data.positions[0]}`
            }

            return await columnChatBotService.handleCreateColumn(standardizedCommand, userId, boardId)
          } else if (analysis.data.columnTitle) {
            // Hỗ trợ backward compatibility với schema cũ có thể trả về columnTitle thay vì columnTitles
            let standardizedCommand = `tạo cột '${analysis.data.columnTitle}'`

            if (analysis.data.position) {
              standardizedCommand += ` vị trí ${analysis.data.position}`
            }

            return await columnChatBotService.handleCreateColumn(standardizedCommand, userId, boardId)
          }
        }

        const missingCreateColumnFields = []
        if ((!analysis.data.columnTitles || analysis.data.columnTitles.length === 0) && !analysis.data.columnTitle) {
          missingCreateColumnFields.push('tên cột')
        }

        if (missingCreateColumnFields.length > 0) {
          const response = `Vui lòng cung cấp thêm thông tin về ${missingCreateColumnFields.join(', ')} để tôi có thể giúp bạn tạo cột mới. Ví dụ: "Tạo cột 'Tên cột'" hoặc "Tạo các cột 'Cột 1', 'Cột 2'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'RENAME_COLUMN': {
        if (analysis.confidence >= 0.7 && analysis.data.columnTitle) {
          let standardizedCommand = `đổi tên cột '${analysis.data.columnTitle}'`

          if (analysis.data.newTitle) {
            standardizedCommand += ` thành '${analysis.data.newTitle}'`
          }

          return await columnChatBotService.handleRenameColumn(standardizedCommand, userId, boardId)
        }

        const missingRenameFields = []
        if (!analysis.data.columnTitle) missingRenameFields.push('tên cột cần đổi')
        if (!analysis.data.newTitle) missingRenameFields.push('tên mới cho cột')

        if (missingRenameFields.length > 0) {
          const response = `Vui lòng cung cấp thêm thông tin về ${missingRenameFields.join(' và ')} để tôi có thể giúp bạn đổi tên cột. Ví dụ: "Đổi tên cột 'Tên cột cũ' thành 'Tên cột mới'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'COPY_COLUMN': {
        if (analysis.confidence >= 0.7 && analysis.data.sourceColumnTitle) {
          let standardizedCommand = `sao chép cột '${analysis.data.sourceColumnTitle}'`

          if (analysis.data.newTitle) {
            standardizedCommand += ` tên mới '${analysis.data.newTitle}'`
          }

          if (analysis.data.position) {
            standardizedCommand += ` vị trí ${analysis.data.position}`
          }

          return await columnChatBotService.handleCopyColumn(standardizedCommand, userId, boardId)
        }

        if (!analysis.data.sourceColumnTitle) {
          const response = 'Vui lòng chỉ rõ tên cột cần sao chép. Ví dụ: "Sao chép cột \'Tên cột\'".'
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'MOVE_ALL_CARDS': {
        if (analysis.confidence >= 0.7 && analysis.data.fromColumn && analysis.data.toColumn) {
          // Tạo lệnh chuẩn hóa
          const standardizedCommand = `di chuyển tất cả thẻ từ cột '${analysis.data.fromColumn}' sang cột '${analysis.data.toColumn}'`
          return await columnChatBotService.handleMoveAllCards(standardizedCommand, userId, boardId)
        }

        const missingFields = []
        if (!analysis.data.fromColumn) missingFields.push('cột nguồn')
        if (!analysis.data.toColumn) missingFields.push('cột đích')

        if (missingFields.length > 0) {
          const response = `Vui lòng cung cấp thêm thông tin về ${missingFields.join(', ')} để tôi có thể giúp bạn di chuyển tất cả thẻ. Ví dụ: "Di chuyển tất cả thẻ từ cột 'Nguồn' sang cột 'Đích'".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'CLOSE_COLUMN': {
        if (analysis.confidence >= 0.7) {
          // Trường hợp đóng tất cả cột
          if (analysis.data.isAllColumns) {
            return await columnChatBotService.handleCloseColumn(message, userId, boardId)
          }
          // Trường hợp đóng cột theo vị trí
          if (analysis.data.isByPosition && analysis.data.positions && analysis.data.positions.length > 0) {
            return await columnChatBotService.handleCloseColumn(message, userId, boardId)
          }
          // Trường hợp đóng một hoặc nhiều cột cụ thể
          if (analysis.data.columnTitles && analysis.data.columnTitles.length > 0) {
            return await columnChatBotService.handleCloseColumn(message, userId, boardId)
          }
        }

        // Nếu không đủ thông tin, yêu cầu người dùng cung cấp thêm
        const response = 'Vui lòng cho biết tên cột hoặc vị trí cột bạn muốn đóng. Ví dụ: "Đóng cột \'Tên cột\'", "Đóng cột ở vị trí thứ 3" hoặc "Đóng tất cả cột".'
        await this.saveChat(userId, boardId, message, response)
        return response
      }

      case 'OPEN_COLUMN': {
        if (analysis.confidence >= 0.7) {
          // Trường hợp mở tất cả cột
          if (analysis.data.isAllColumns) {
            return await columnChatBotService.handleOpenColumn(message, userId, boardId)
          }
          // Trường hợp mở cột theo vị trí
          if (analysis.data.isByPosition && analysis.data.positions && analysis.data.positions.length > 0) {
            return await columnChatBotService.handleOpenColumn(message, userId, boardId)
          }
          // Trường hợp mở một hoặc nhiều cột cụ thể
          if (analysis.data.columnTitles && analysis.data.columnTitles.length > 0) {
            return await columnChatBotService.handleOpenColumn(message, userId, boardId)
          }
        }

        // Nếu không đủ thông tin, yêu cầu người dùng cung cấp thêm
        const response = 'Vui lòng cho biết tên cột hoặc vị trí cột bạn muốn mở. Ví dụ: "Mở cột \'Tên cột\'", "Mở cột ở vị trí thứ 3" hoặc "Mở tất cả cột".'
        await this.saveChat(userId, boardId, message, response)
        return response
      }

      case 'UPDATE_BOARD': {
        if (analysis.confidence >= 0.7) {
          return await boardChatBotService.handleUpdateBoard(message, userId, boardId)
        }

        const missingUpdateBoardFields = []
        if (!analysis.data.newTitle && !analysis.data.newType) {
          missingUpdateBoardFields.push('thông tin cần cập nhật (tiêu đề hoặc loại board)')
        }

        if (missingUpdateBoardFields.length > 0) {
          const response = `Vui lòng cung cấp thêm ${missingUpdateBoardFields.join(', ')} để tôi có thể giúp bạn cập nhật board. Ví dụ: "Cập nhật board tiêu đề mới 'Tiêu đề mới'" hoặc "Cập nhật board loại mới public".`
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        break
      }

      case 'OPEN_BOARD': {
        return await boardChatBotService.handleOpenBoard(message, userId, boardId)
      }

      case 'CLOSE_BOARD': {
        return await boardChatBotService.handleCloseBoard(message, userId, boardId)
      }

      case 'GENERAL_QUERY':
      default:
        // Nếu không nhận diện được ý định cụ thể hoặc là câu hỏi chung, sử dụng chat thông thường
        // Kiểm tra nếu có vẻ là lệnh sử dụng regex pattern cũ
        if (COMMAND_PATTERNS.SUMMARY.test(lowerMessage)) {
          return await this.summarizeBoard(userId, boardId)
        }
        else if (COMMAND_PATTERNS.MOVE_CARD.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'MOVE_CARD')
          if (formatCheck.isValid) {
            return await cardChatBotService.handleMoveCard(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.COPY_CARD.test(lowerMessage)) {
          return await cardChatBotService.handleCopyCard(message, userId, boardId)
        }
        else if (COMMAND_PATTERNS.DELETE_CARD.test(lowerMessage)) {
          // Thay đổi xử lý cho DELETE_CARD khi phát hiện bằng regex
          const response = 'Tính năng xóa thẻ đã bị vô hiệu hóa. Vui lòng xóa thẻ thủ công từ giao diện người dùng.'
          await this.saveChat(userId, boardId, message, response)
          return response
        }
        else if (COMMAND_PATTERNS.CREATE_CARD.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'CREATE_CARD')
          if (formatCheck.isValid) {
            return await cardChatBotService.handleCreateCard(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.CARD_DETAILS.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'CARD_DETAILS')
          if (formatCheck.isValid) {
            return await cardChatBotService.handleCardDetails(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.UPDATE_CARD.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'UPDATE_CARD')
          if (formatCheck.isValid) {
            return await cardChatBotService.handleUpdateCard(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.CREATE_COLUMN.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'CREATE_COLUMN')
          if (formatCheck.isValid) {
            return await columnChatBotService.handleCreateColumn(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.COPY_COLUMN.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'COPY_COLUMN')
          if (formatCheck.isValid) {
            return await columnChatBotService.handleCopyColumn(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.RENAME_COLUMN.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'RENAME_COLUMN')
          if (formatCheck.isValid) {
            return await columnChatBotService.handleRenameColumn(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.MOVE_ALL_CARDS.test(lowerMessage)) {
          return await columnChatBotService.handleMoveAllCards(message, userId, boardId)
        }
        else if (COMMAND_PATTERNS.CLOSE_COLUMN.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'CLOSE_COLUMN')
          if (formatCheck.isValid) {
            return await columnChatBotService.handleCloseColumn(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.OPEN_COLUMN.test(lowerMessage)) {
          const formatCheck = checkCommandFormat(message, 'OPEN_COLUMN')
          if (formatCheck.isValid) {
            return await columnChatBotService.handleOpenColumn(message, userId, boardId)
          }
          await this.saveChat(userId, boardId, message, formatCheck.message)
          return formatCheck.message
        }
        else if (COMMAND_PATTERNS.UPDATE_BOARD.test(lowerMessage)) {
          return await boardChatBotService.handleUpdateBoard(message, userId, boardId)
        }
        else if (COMMAND_PATTERNS.OPEN_BOARD.test(lowerMessage)) {
          return await boardChatBotService.handleOpenBoard(message, userId, boardId)
        }
        else if (COMMAND_PATTERNS.CLOSE_BOARD.test(lowerMessage)) {
          return await boardChatBotService.handleCloseBoard(message, userId, boardId)
        }
        // Mặc định xử lý như phân tích nội dung thông thường
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Bạn là trợ lý AI hữu ích trong ứng dụng quản lý công việc (giống Trello). 
                    Trả lời người dùng một cách thân thiện và hữu ích. 
                    Nếu người dùng muốn thực hiện các tác vụ liên quan đến thẻ/cột mà không rõ cú pháp, hãy gợi ý cách sử dụng:
                    - Di chuyển thẻ: "Di chuyển thẻ 'Tên thẻ' từ cột 'Nguồn' sang cột 'Đích'"
                    - Sao chép thẻ: "Sao chép thẻ 'Tên thẻ' từ cột 'Nguồn' sang cột 'Đích'"
                    - Tạo thẻ: "Tạo thẻ 'Tên thẻ' vào cột 'Tên cột'"
                    - Xóa thẻ: "Xóa thẻ 'Tên thẻ' từ cột 'Tên cột'"
                    - Xem thông tin thẻ: "Xem thông tin thẻ 'Tên thẻ'" `
            },
            {
              role: 'user',
              content: message
            }
          ]
        })

        const response = completion.choices[0].message.content
        // Lưu lịch sử chat vào database
        await this.saveChat(userId, boardId, message, response)
        return response
      }
    } catch (error) {
      console.error('Error processing chat request:', error)
      const response = 'Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.'
      await this.saveChat(userId, boardId, message, response)
      return response
    }
  },

  async saveChat(userId, boardId, message, response) {
    // Lưu lịch sử chat vào database
    await chatBotHistoryModel.createNew({
      userId,
      boardId,
      message,
      response
    })
  },

  async getChatHistory(userId, boardId) {
    const chatHistory = await chatBotHistoryModel.getHistoryByUserAndBoard(userId, boardId)
    return chatHistory
  }
}

