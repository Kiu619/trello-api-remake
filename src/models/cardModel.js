import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { CARD_MEMBER_ACTIONS } from '~/utils/constants'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { attachmantInCardModel, ATTACHMENT_SCHEMA } from './attachmentModel'
import { BOARD_COLLECTION_NAME } from './boardModel'
import { CHECKLIST_SCHEMA, checkListInCardModel } from './checkListInCardModel'
import { COLUMN_COLLECTION_NAME } from './columnModel'
import { DUEDATE_SCHEMA } from './dueDateModel'
import { activityService } from '~/services/activityService'
import { labelModel } from './labelModel'
import { cardDueDateFlagModel } from './cardDueDateFlag'

// Define Comment Schema
const COMMENT_SCHEMA = Joi.object({
  userId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  userEmail: Joi.string().email().required(),
  userAvatar: Joi.string().uri().optional(),
  userDisplayName: Joi.string().required(),
  content: Joi.string().required(),
  taggedUserIds: Joi.array().items(Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)).default([]),
  commentedAt: Joi.date().timestamp(),
  isEdited: Joi.boolean().default(false),
  edittedAt: Joi.date().timestamp().default(null)
})

// Define Collection (name & schema)
export const CARD_COLLECTION_NAME = 'cards'
const CARD_COLLECTION_SCHEMA = Joi.object({
  boardId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  columnId: Joi.string().required().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),

  title: Joi.string().required().min(3).max(50).trim().strict(),
  slug: Joi.string().required().min(3).trim().strict(),
  description: Joi.string().optional(),

  cover: Joi.string().default(null),
  memberIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),

  dueDate: DUEDATE_SCHEMA.default({
    title: Joi.string().required().min(3).max(50).trim().strict(),
    dueDate: null,
    dueDateTime: null,
    startDate: null,
    startDateTime: null,
    isComplete: false
  }),

  labelIds: Joi.array().items(Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)).default([]),
  attachments: Joi.array().items(ATTACHMENT_SCHEMA).default([]),
  comments: Joi.array().items(COMMENT_SCHEMA).default([]),
  checklists: Joi.array().items(CHECKLIST_SCHEMA).default([]),
  location: Joi.object().default({}),
  isCompleted: Joi.boolean().default(false),
  isClosed: Joi.boolean().default(false),

  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const INVALID_UPDATE_FIELDS = ['_id', 'boardId', 'createAt']

const validateBeforeCreate = async (data) => {
  return await CARD_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (userId, data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newCardToAdd = {
      ...validData,
      boardId: new ObjectId(validData.boardId),
      columnId: new ObjectId(validData.columnId)
    }
    const newCard = await GET_DB().collection(CARD_COLLECTION_NAME).insertOne(newCardToAdd)

    // Tạo activity
    const columnInfo = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(validData.columnId) })

    await activityService.createActivity({
      userId,
      type: 'createCard',
      cardId: newCard.insertedId.toString(),
      boardId: validData.boardId,
      columnId: validData.columnId,
      data: {
        cardTitle: validData.title,
        columnTitle: columnInfo.title
      }
    })

    return newCard
  } catch (error) {
    throw new Error(error)
  }
}

const getDetails = async (userId, cardId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).aggregate([
      { $match: { _id: new ObjectId(cardId), _destroy: false } },
      {
        $lookup: {
          from: 'labels',
          localField: 'labelIds',
          foreignField: '_id',
          as: 'labelDetails'
        }
      }
    ]).toArray()
    return result[0]

  } catch (error) {
    throw new Error(error)
  }
}

const findOneByTitle = async (columnId, cardTitle) => {
  try {
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ columnId: new ObjectId(columnId), title: cardTitle })
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (id) => {
  try {
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(id) })
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (userId, cardId, updateData) => {
  try {
    // Loại bỏ các trường không được phép update
    Object.keys(updateData).forEach(key => {
      if (INVALID_UPDATE_FIELDS.includes(key)) {
        delete updateData[key]
      }
    })

    let oldCardTitle
    if (updateData.title) {
      const oldCard = await findOneById(cardId)
      oldCardTitle = oldCard.title
    }

    if (updateData.columnId) updateData.columnId = new ObjectId(updateData.columnId)

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    if (updateData.cover) {
      activityService.createActivity({
        userId,
        type: 'updateCardCover',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }
    if (updateData.title) {
      activityService.createActivity({
        userId,
        type: 'renameCard',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          newCardTitle: result.title,
          oldCardTitle: oldCardTitle
        }
      })
    }
    if (updateData.description) {
      activityService.createActivity({
        userId,
        type: 'updateCardDescription',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }

    if (updateData.dueDate) {
      if (!updateData.dueDate.dueDate) {
        activityService.createActivity({
          userId,
          type: 'removeDueDate',
          cardId: cardId,
          boardId: result.boardId.toString(),
          data: {
            cardTitle: result.title
          }
        })

        // Xóa flag due date
        await cardDueDateFlagModel.deleteCardDueDateFlag(cardId)
      } else {
        activityService.createActivity({
          userId,
          type: 'setDueDate',
          cardId: cardId,
          boardId: result.boardId.toString(),
          data: {
            cardTitle: result.title,
            dueDate: updateData.dueDate.dueDate,
            dueDateTime: updateData.dueDate.dueDateTime
          }
        })

        // Tạo flag due date
        await cardDueDateFlagModel.createCardDueDateFlag(cardId, 'card')
      }
    }

    if (updateData.location) {
      if (updateData.location.name) {
        activityService.createActivity({
          userId,
          type: 'updateCardLocation',
          cardId: cardId,
          boardId: result.boardId.toString(),
          data: {
            cardTitle: result.title,
            location: updateData.location.name
          }
        })
      }
    }
    if (updateData.location === null) {
      activityService.createActivity({
        userId,
        type: 'removeCardLocation',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }

    if (updateData.isClosed === true) {
      activityService.createActivity({
        userId,
        type: 'closeCard',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }
    if (updateData.isClosed === false) {
      activityService.createActivity({
        userId,
        type: 'openCard',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }

    if (updateData.isCompleted) {
      activityService.createActivity({
        userId,
        type: 'completeCard',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }

    if (updateData.isCompleted === false) {
      activityService.createActivity({
        userId,
        type: 'uncompleteCard',
        cardId: cardId,
        boardId: result.boardId.toString(),
        data: {
          cardTitle: result.title
        }
      })
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const removeMemberFromCard = async (cardId, userId) => {
  try {
    const db = GET_DB()
    const card = await db.collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })

    if (!card) {
      throw new Error('Card not found')
    }

    // Remove the user from memberIds
    await db.collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $pull: { memberIds: new ObjectId(userId) } },
      { returnDocument: 'after' }
    )

    // Remove the user from assignedTo in checklist items
    const updatedChecklists = card.checklists.map(checklist => {
      checklist.items = checklist.items.map(item => {
        item.assignedTo = item.assignedTo.filter(assignedUserId => assignedUserId.toString() !== userId.toString())
        return item
      })
      return checklist
    })

    // Update the card with the modified checklists
    const result = await db.collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: { checklists: updatedChecklists } },
      { returnDocument: 'after' }
    )

    return result.value
  } catch (error) {
    throw new Error(error)
  }
}

const deleteAllCardByColumnId = async (columnId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteMany({ columnId: new ObjectId(columnId) })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

/**
* Đẩy một phần tử comment vào đầu mảng comments!
* – Trong JS, ngược lại với push (thêm phần tử vào cuối mảng) sẽ là unshift (thêm phần tử vào đầu mảng)
* – Nhưng trong mongodb hiện tại chỉ có $push – mặc định đẩy phần tử vào cuối mảng.
* - Có thể đẩy cuối mảng cũng được (sau đó sắp xếp lại mảng comments theo thời gian tăng dần) nhưng thử cách này trước.
* Vẫn dùng $push, nhưng bọc data vào Array để trong $each và chỉ định $position: 0
*/
const unshiftNewComment = async (cardId, newComment) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { comments: { $each: [newComment], $position: 0 } } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateComment = async (cardId, updateCommentData) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'comments._id': new ObjectId(updateCommentData._id) },
      {
        $set: {
          'comments.$.userId': updateCommentData.userId,
          'comments.$.userEmail': updateCommentData.userEmail,
          'comments.$.userAvatar': updateCommentData.userAvatar,
          'comments.$.userDisplayName': updateCommentData.userDisplayName,
          'comments.$.content': updateCommentData.content,
          'comments.$.taggedUserIds': updateCommentData.taggedUserIds,
          'comments.$.isEdited': updateCommentData.isEdited,
          'comments.$.commentedAt': updateCommentData.commentedAt,
          'comments.$.edittedAt': updateCommentData.edittedAt
        }
      },
      { returnDocument: 'after' }
    )

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteComment = async (cardId, commentId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $pull: { comments: { _id: new ObjectId(commentId) } } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateMember = async (userId, cardId, incomingMemberInfo) => {
  try {
    let updateCondition = {}
    if (incomingMemberInfo.action === CARD_MEMBER_ACTIONS.ADD) {
      updateCondition = { $push: { memberIds: new ObjectId(incomingMemberInfo.userId) } }
    }
    else if (incomingMemberInfo.action === CARD_MEMBER_ACTIONS.REMOVE) {
      updateCondition = { $pull: { memberIds: new ObjectId(incomingMemberInfo.userId) } }
    }
    else {
      throw new Error('Invalid action')
    }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      updateCondition,
      { returnDocument: 'after' }
    )

    activityService.createActivity({
      userId: incomingMemberInfo.userId,
      type: 'updateCardMembers',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        joinType: incomingMemberInfo.action === CARD_MEMBER_ACTIONS.ADD ? 'join' : 'leave'
      }
    })

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const addAttachment = async (userId, cardId, attachmentFile) => {
  try {
    const result = await attachmantInCardModel.addAttachment(userId, cardId, attachmentFile)
    return result
  }
  catch (error) {
    throw new Error(error)
  }
}

const editAttachment = async (userId, cardId, attachmentData) => {
  try {
    let result = null
    if (attachmentData.action === 'EDIT') {
      result = attachmantInCardModel.editAttachment(userId, cardId, attachmentData)
    }
    else if (attachmentData.action === 'DELETE') {
      result = attachmantInCardModel.deleteAttachment(userId, cardId, attachmentData._id)
    }
    else {
      throw new Error('Invalid action')
    }
    return result
  }
  catch (error) {
    throw new Error(error)
  }
}

const updateChecklist = async (userId, cardId, incomingChecklistInfo) => {
  try {
    let result = null
    if (incomingChecklistInfo.action === 'ADD') {
      result = checkListInCardModel.addChecklistInCard(userId, cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'UPDATE') {
      result = checkListInCardModel.updateChecklistInCard(userId, cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'DELETE') {
      result = checkListInCardModel.deleteChecklistInCard(userId, cardId, incomingChecklistInfo.checklistId)
    }
    else {
      throw new Error('Invalid action')
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateChecklistItem = async (userId, cardId, incomingChecklistInfo) => {
  try {
    let result = null
    if (incomingChecklistInfo.action === 'ADD') {
      result = checkListInCardModel.addChecklistItem(userId, cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'UPDATE') {
      result = await checkListInCardModel.updateChecklistItem(userId, cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'DELETE') {
      result = checkListInCardModel.deleteChecklistItem(userId, cardId, incomingChecklistInfo)
    }
    else {
      throw new Error('Invalid action')
    }

    // console.log('result', result)

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const moveCardToDifferentBoard = async (userId, cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition) => {
  try {
    // Validate input data
    if (!ObjectId.isValid(cardId) || !ObjectId.isValid(currentBoardId) || !ObjectId.isValid(currentColumnId) || !ObjectId.isValid(newBoardId) || !ObjectId.isValid(newColumnId)) {
      throw new Error('Invalid input data')
    }

    // Fetch the card
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    if (!card) {
      throw new Error('Card not foundee')
    }

    // Fetch the current board
    const currentBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(currentBoardId) })
    if (!currentBoard) {
      throw new Error('Current board not found')
    }

    // Fetch the current column
    const currentColumn = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(currentColumnId) })
    if (!currentColumn) {
      throw new Error('Current column not found')
    }

    // Fetch the new board
    const newBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(newBoardId) })
    if (!newBoard) {
      throw new Error('New board not found')
    }

    // Update the card's memberIds to include ownerIds from the new board and only include members that are also in the new board's memberIds
    const updatedMemberIds = [
      ...new Set([
        ...newBoard.ownerIds,
        ...card.memberIds.filter(memberId => newBoard.memberIds.map(id => id.toString()).includes(memberId.toString()))
      ])
    ]

    // Xử lý labels khi di chuyển card sang board khác
    let updatedLabelIds = []
    if (card.labelIds && Array.isArray(card.labelIds) && card.labelIds.length > 0) {
      if (currentBoardId !== newBoardId) {
        // Tạo labels mới cho board đích
        const newLabels = await Promise.all(card.labelIds.map(async labelId => {
          const label = await labelModel.findOneById(labelId)
          if (label) {
            const newLabelId = await labelModel.createNew({
              boardId: newBoardId,
              title: label.title,
              color: label.color
            })
            return newLabelId // labelModel.createNew trả về insertedId
          }
          return null
        }))

        // Lọc bỏ các giá trị null
        updatedLabelIds = newLabels.filter(labelId => labelId !== null)
      } else {
        // Nếu cùng board thì giữ nguyên labelIds
        updatedLabelIds = card.labelIds
      }
    }

    // Remove members from checklist items that are not in the new card's memberIds
    const updatedChecklists = card.checklists.map(checklist => {
      checklist.items = checklist.items.map(item => {
        item.assignedTo = item.assignedTo.filter(memberId => updatedMemberIds.includes(memberId))
        return item
      })
      return checklist
    })

    // Remove the card from the current column's cardOrderIds
    await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(currentColumnId) },
      { $pull: { cardOrderIds: new ObjectId(cardId) } }
    )

    // Add the card to the new column's cardOrderIds at the specified position
    const newColumn = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(newColumnId) })
    if (!newColumn) {
      throw new Error('New column not found')
    }

    const updatedCardOrderIds = [...newColumn.cardOrderIds]
    updatedCardOrderIds.splice(newPosition, 0, new ObjectId(cardId))

    await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(newColumnId) },
      { $set: { cardOrderIds: updatedCardOrderIds } }
    )

    // Update the card's boardId, columnId, position, memberIds, and checklists
    const updatedCard = {
      ...card,
      boardId: new ObjectId(newBoardId),
      columnId: new ObjectId(newColumnId),
      memberIds: updatedMemberIds,
      checklists: updatedChecklists,
      labelIds: updatedLabelIds,
      updatedAt: new Date()
    }

    // Save the updated card to the database
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: updatedCard },
      { returnDocument: 'after' }
    )

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'moveCardToDifferentBoard',
      cardId: cardId,
      boardId: currentBoardId,
      data: {
        cardTitle: card.title,
        destinationBoardId: newBoardId,
        destinationBoardTitle: newBoard.title,
        sourceColumnTitle: currentColumn.title,
        destinationColumnTitle: newColumn.title
      }
    })

    await activityService.createActivity({
      userId,
      type: 'cardMovedFromDifferentBoard',
      cardId: cardId,
      boardId: newBoardId,
      data: {
        cardTitle: card.title,
        sourceBoardId: currentBoardId,
        sourceBoardTitle: currentBoard.title,
        sourceColumnTitle: currentColumn.title,
        destinationColumnTitle: newColumn.title
      }
    })

    return result.value
  } catch (error) {
    throw new Error(error)
  }
}

const copyCard = async (userId, cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition, title, keepingItems) => {
  try {

    // Fetch the original card details
    const originalCard = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    const originalColumn = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(currentColumnId) })
    const originalBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(currentBoardId) })
    const destinationBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(newBoardId) })

    if (!originalCard) {
      throw new Error('Card not found')
    }

    // Create a new card object
    let newCard = {
      boardId: new ObjectId(newBoardId),
      columnId: new ObjectId(newColumnId),
      title: title,
      description: originalCard.description,
      cover: originalCard.cover,
      memberIds: [],
      dueDate: {},
      attachments: [],
      comments: [],
      checklists: [],
      location: {},
      isClosed: false,
      createdAt: new Date(),
      updatedAt: null,
      _destroy: false
    }

    // Copy specified items
    keepingItems.forEach(item => {
      if (originalCard[item]) {
        newCard[item] = originalCard[item]
      }
    })

    // Trường hợp nếu currentBoardId != newBoardId thì tạo mới label cho board mới và copy các dữ liệu từ label từ board cũ trừ labelid
    if (keepingItems.includes('labels')) {
      // Kiểm tra xem originalCard có labelIds và labelIds là mảng không rỗng
      if (originalCard.labelIds && Array.isArray(originalCard.labelIds) && originalCard.labelIds.length > 0) {
        if (currentBoardId !== newBoardId) {
          const newLabels = await Promise.all(originalCard.labelIds.map(async labelId => {
            const label = await labelModel.findOneById(labelId)
            if (label) {
              const newLabelId = await labelModel.createNew({
                boardId: newBoardId,
                title: label.title,
                color: label.color
              })
              return newLabelId // labelModel.createNew trả về insertedId
            }
            return null
          }))
          // Lọc bỏ các giá trị null và gán vào newCard.labelIds
          newCard.labelIds = newLabels.filter(labelId => labelId !== null)
        } else {
          newCard.labelIds = originalCard.labelIds
        }
      } else {
        // Nếu không có labelIds hoặc labelIds rỗng, gán mảng rỗng
        newCard.labelIds = []
      }
    }
    // If keepingItems includes memberIds, update memberIds to include ownerIds from the new board and only include members that are also in the new board's memberIds
    if (keepingItems.includes('memberIds')) {
      const newBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(newBoardId) })
      if (!newBoard) {
        throw new Error('New board not found')
      }

      newCard.memberIds = [
        ...new Set([
          ...newBoard.ownerIds,
          ...originalCard.memberIds.filter(memberId => newBoard.memberIds.map(id => id.toString()).includes(memberId.toString()))
        ])
      ]
    }

    // Remove members from checklist items that are not in the new card's memberIds
    if (keepingItems.includes('checklists')) {
      newCard.checklists = originalCard.checklists.map(checklist => {
        checklist.items = checklist.items.map(item => {
          item.assignedTo = item.assignedTo.filter(memberId => newCard.memberIds.includes(memberId))
          return item
        })
        return checklist
      })
    }

    // Save the new card
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).insertOne(newCard)

    // Update the new column's cardOrderIds
    const newColumnData = await GET_DB().collection(COLUMN_COLLECTION_NAME).findOne({ _id: new ObjectId(newColumnId) })
    if (!newColumnData) {
      throw new Error('New column not found')
    }

    const updatedCardOrderIds = [...newColumnData.cardOrderIds]
    updatedCardOrderIds.splice(newPosition, 0, result.insertedId)

    await GET_DB().collection(COLUMN_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(newColumnId) },
      { $set: { cardOrderIds: updatedCardOrderIds } }
    )

    // Tạo activity
    if (currentBoardId === newBoardId) {
      await activityService.createActivity({
        userId,
        type: 'copyCardToSameBoard',
        cardId: cardId.toString(),
        boardId: currentBoardId.toString(),
        data: {
          oldCardTitle: originalCard.title,
          newCardTitle: title,
          sourceColumnTitle: originalColumn.title,
          destinationColumnTitle: newColumnData.title
        }
      })
    } else {
      await activityService.createActivity({
        userId,
        type: 'copyCardToAnotherBoard',
        cardId: cardId.toString(),
        boardId: currentBoardId.toString(),
        data: {
          destinationBoardId: newBoardId.toString(),
          destinationBoardTitle: destinationBoard.title,
          sourceColumnTitle: originalColumn.title,
          destinationColumnTitle: newColumnData.title,
          oldCardTitle: originalCard.title,
          newCardTitle: title
        }
      })

      await activityService.createActivity({
        userId,
        type: 'copyCardFromAnotherBoard',
        cardId: cardId.toString(),
        boardId: newBoardId.toString(),
        data: {
          sourceBoardId: currentBoardId.toString(),
          sourceBoardTitle: originalBoard.title,
          sourceColumnTitle: originalColumn.title,
          destinationColumnTitle: newColumnData.title,
          oldCardTitle: originalCard.title,
          newCardTitle: title
        }
      })
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteCardById = async (cardId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteOne({ _id: new ObjectId(cardId) })
    // Xóa flag due date
    await cardDueDateFlagModel.deleteCardDueDateFlag(cardId)
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteCardsByBoardId = async (boardId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteMany({ boardId: new ObjectId(boardId) })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateLabel = async (userId, cardId, labelIds) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: { labelIds: labelIds.map(id => new ObjectId(id)) } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const cardModel = {
  CARD_COLLECTION_NAME,
  CARD_COLLECTION_SCHEMA,
  createNew, getDetails, findOneByTitle,
  findOneById, update, removeMemberFromCard, deleteAllCardByColumnId,
  unshiftNewComment, updateComment, deleteComment, updateMember, updateChecklist, updateChecklistItem,
  addAttachment, editAttachment, moveCardToDifferentBoard,
  copyCard, deleteCardById, deleteCardsByBoardId, updateLabel
}