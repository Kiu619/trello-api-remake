import Joi from 'joi'
import { EMAIL_RULE, EMAIL_RULE_MESSAGE, OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { CARD_MEMBER_ACTIONS } from '~/utils/constants'
import { CHECKLIST_SCHEMA, checkListInCardModel } from './checkListInCardModel'
import { addChecklistInCard, updateChecklistInCard, deleteChecklistInCard } from './checkListInCardModel'
import { attachmantInCardModel, ATTACHMENT_SCHEMA } from './attachmentModel'
import { DUEDATE_SCHEMA } from './dueDateModel'
import { COLUMN_COLLECTION_NAME } from './columnModel'
import { BOARD_COLLECTION_NAME } from './boardModel'

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


  attachments: Joi.array().items(ATTACHMENT_SCHEMA).default([]),
  comments: Joi.array().items(COMMENT_SCHEMA).default([]),
  checklists: Joi.array().items(CHECKLIST_SCHEMA).default([]),
  location: Joi.object().default({}),

  isClosed: Joi.boolean().default(false),

  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const INVALID_UPDATE_FIELDS = ['_id', 'boardId', 'createAt']

const validateBeforeCreate = async (data) => {
  return await CARD_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newCardToAdd = {
      ...validData,
      boardId: new ObjectId(validData.boardId),
      columnId: new ObjectId(validData.columnId)
    }
    const newCard = await GET_DB().collection(CARD_COLLECTION_NAME).insertOne(newCardToAdd)
    return newCard
  } catch (error) {
    throw new Error(error)
  }
}

const getDetails = async (userId, cardId) => {
  try {
    const queryConditions = [
      { _id: new ObjectId(cardId), _destroy: false },
      {
        $or: [
          // { ownerIds: { $all: [new ObjectId(userId)] } },
          { memberIds: { $all: [new ObjectId(userId)] } }
        ]
      }
    ]

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).aggregate([
      { $match: { $and: queryConditions } }])
      .toArray()

    return result[0]

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

const update = async (cardId, updateData) => {
  try {
    // Loại bỏ các trường không được phép update
    Object.keys(updateData).forEach(key => {
      if (INVALID_UPDATE_FIELDS.includes(key)) {
        delete updateData[key]
      }
    })

    if (updateData.columnId) updateData.columnId = new ObjectId(updateData.columnId)

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )
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
    const commentId = new ObjectId()
    const commentWithId = { ...newComment, _id: commentId }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { comments: { $each: [commentWithId], $position: 0 } } },
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

const updateMember = async (cardId, incomingMemberInfo) => {
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
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const addAttachment = async (cardId, attachmentFile) => {
  try {
    const result = await attachmantInCardModel.addAttachment(cardId, attachmentFile)
    return result
  }
  catch (error) {
    throw new Error(error)
  }
}

const editAttachment = async (cardId, attachmentData) => {
  try {
    let result = null
    if (attachmentData.action === 'EDIT') {
      result = attachmantInCardModel.editAttachment(cardId, attachmentData)
    }
    else if (attachmentData.action === 'DELETE') {
      result = attachmantInCardModel.deleteAttachment(cardId, attachmentData._id)
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

const updateChecklist = async (cardId, incomingChecklistInfo) => {
  try {
    let result = null
    if (incomingChecklistInfo.action === 'ADD') {
      result = checkListInCardModel.addChecklistInCard(cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'UPDATE') {
      result = checkListInCardModel.updateChecklistInCard(cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'DELETE') {
      result = checkListInCardModel.deleteChecklistInCard(cardId, incomingChecklistInfo.checklistId)
    }
    else {
      throw new Error('Invalid action')
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateChecklistItem = async (cardId, incomingChecklistInfo) => {
  try {
    let result = null
    if (incomingChecklistInfo.action === 'ADD') {
      result = checkListInCardModel.addChecklistItem(cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'UPDATE') {
      result = checkListInCardModel.updateChecklistItem(cardId, incomingChecklistInfo)
    }
    else if (incomingChecklistInfo.action === 'DELETE') {
      result = checkListInCardModel.deleteChecklistItem(cardId, incomingChecklistInfo)
    }
    else {
      throw new Error('Invalid action')
    }

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateLocation = async (cardId, locationInfo) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: { location: locationInfo } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const moveCardToDifferentBoard = async (cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition) => {
  try {
    // Validate input data
    if (!ObjectId.isValid(cardId) || !ObjectId.isValid(currentBoardId) || !ObjectId.isValid(currentColumnId) || !ObjectId.isValid(newBoardId) || !ObjectId.isValid(newColumnId)) {
      throw new Error('Invalid input data')
    }

    // Fetch the card
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    if (!card) {
      throw new Error('Card not found')
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
      updatedAt: new Date()
    }

    // Save the updated card to the database
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $set: updatedCard },
      { returnDocument: 'after' }
    )
    return result.value
  } catch (error) {
    throw new Error(error)
  }
}

const copyCard = async (cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition, title, keepingItems) => {
  try {

    // Fetch the original card details
    const originalCard = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
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

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteCardById = async (cardId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).deleteOne({ _id: new ObjectId(cardId) })
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


export const cardModel = {
  CARD_COLLECTION_NAME,
  CARD_COLLECTION_SCHEMA,
  createNew, getDetails,
  findOneById, update, removeMemberFromCard, deleteAllCardByColumnId,
  unshiftNewComment, updateComment, deleteComment, updateMember, updateChecklist, updateChecklistItem,
  addAttachment, editAttachment, updateLocation, moveCardToDifferentBoard,
  copyCard, deleteCardById, deleteCardsByBoardId,
}