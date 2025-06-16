import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { GET_DB } from '~/config/mongodb'
import { CARD_COLLECTION_NAME } from '~/models/cardModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { env } from '~/config/environment'
import { activityService } from '~/services/activityService'
import { notificationService } from '~/services/notificationService'
import { cardDueDateFlagModel } from './cardDueDateFlag'

export const CHECKLIST_ITEM_SCHEMA = Joi.object({
  _id: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required(),
  isChecked: Joi.boolean().default(false),
  assignedTo: Joi.array().items(Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)).default([]),
  dueDate: Joi.date().allow(null),
  dueDateTime: Joi.string().allow('', null)
})

export const CHECKLIST_SCHEMA = Joi.object({
  _id: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required(),
  items: Joi.array().items(CHECKLIST_ITEM_SCHEMA).default([])
})

const getChecklistById = (card, checklistId) => {
  return card.checklists.find(checklist =>
    checklist._id.toString() === checklistId.toString()
  )
}

const getChecklistItemById = (checklist, itemId) => {
  return checklist.items.find(item =>
    item._id.toString() === itemId.toString()
  )
}

const addChecklistInCard = async (userId, cardId, checklist) => {
  try {
    const checklistId = new ObjectId()
    const title = checklist.title
    const checklistWithId = { title, _id: checklistId, items: [] }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { checklists: checklistWithId } },
      { returnDocument: 'after' }
    )

    await activityService.createActivity({
      userId,
      type: 'createChecklist',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        checklistTitle: title
      }
    })

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateChecklistInCard = async (userId, cardId, updatedChecklist) => {
  try {
    const _id = updatedChecklist.checklistId
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    const oldChecklist = getChecklistById(card, _id)
    const items = updatedChecklist.items.map(item => ({
      ...item,
      _id: new ObjectId(item._id)
    }))
    const title = updatedChecklist.title

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'checklists._id': new ObjectId(_id) },
      { $set: { 'checklists.$': { items, title, _id: new ObjectId(_id) } } },
      { returnDocument: 'after' }
    )

    await activityService.createActivity({
      userId,
      type: 'updateChecklist',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        newChecklistTitle: title,
        oldChecklistTitle: oldChecklist.title
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteChecklistInCard = async (userId, cardId, checklistId) => {
  try {
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    const checklist = getChecklistById(card, checklistId)
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $pull: { checklists: { _id: new ObjectId(checklistId) } } },
      { returnDocument: 'after' }
    )

    await activityService.createActivity({
      userId,
      type: 'deleteChecklist',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        checklistTitle: checklist.title
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const addChecklistItem = async (userId, cardId, item) => {
  try {
    const itemId = new ObjectId()
    const title = item.title
    const checklistId = item.checklistId
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    const checklist = getChecklistById(card, checklistId)
    const itemWithId = { title, _id: itemId, isChecked: false, assignedTo: [], dueDate: null, dueDateTime: null }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'checklists._id': new ObjectId(checklistId) },
      { $push: { 'checklists.$.items': itemWithId } },
      { returnDocument: 'after' }
    )

    await activityService.createActivity({
      userId,
      type: 'addChecklistItem',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        checklistTitle: checklist.title,
        checklistItemTitle: title
      }
    })

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateChecklistItem = async (userId, cardId, item) => {
  try {
    const checklistId = item.checklistId
    const itemId = item.itemId
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    const checklist = getChecklistById(card, checklistId)
    const oldChecklistItem = getChecklistItemById(checklist, itemId)
    const title = item.title
    const isChecked = item.isChecked
    const assignedTo = item.assignedTo
    const dueDate = item.dueDate
    const dueDateTime = item.dueDateTime
    const updatedItem = { title, _id: new ObjectId(itemId), isChecked, assignedTo, dueDate, dueDateTime }

    // // Nếu có trường assignMember = true thì gửi email thông báo (viết code chán thật sự, thật ra phải viết ở service)
    if (item.assignMember) {
      const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
      // Gửi email thông báo
      const customSubject = `You were assigned to a checklist item (${title}) in Card: ${card.title}`
      const htmlContent = `
        <p>You were assigned to a checklist item: <strong>${title}</strong> in checklist: <strong>${item.cardChecklist.title}</strong> in Card: <strong>${card.title}</strong></p>
        <p>Click <a href="${env.WEBSITE_DOMAIN_DEV}/board/${item.board._id}/card/${cardId}">here</a> to view the card</p>
      `
      await BrevoProvider.sendEmail(item.assignMember.email, customSubject, htmlContent)
    }

    if (item.dueDate) {
      await cardDueDateFlagModel.createCardDueDateFlag(cardId, 'checklistItem')
    }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'checklists._id': new ObjectId(checklistId), 'checklists.items._id': new ObjectId(itemId) },
      { $set: { 'checklists.$[checklist].items.$[item]': updatedItem } },
      {
        arrayFilters: [
          { 'checklist._id': new ObjectId(checklistId) },
          { 'item._id': new ObjectId(itemId) }
        ],
        returnDocument: 'after'
      }
    )



    // Tạo activity cho due date nếu có thay đổi
    // if (item.dueDate !== undefined) {
    //   if (!item.dueDate || item.dueDate === null) {
    //     await activityService.createActivity({
    //       userId,
    //       type: 'removeChecklistItemDueDate',
    //       cardId: cardId,
    //       boardId: result.boardId.toString(),
    //       data: {
    //         cardTitle: result.title,
    //         checklistTitle: checklist.title,
    //         checklistItemTitle: title
    //       }
    //     })
    //   } else {
    //     await activityService.createActivity({
    //       userId,
    //       type: 'setChecklistItemDueDate',
    //       cardId: cardId,
    //       boardId: result.boardId.toString(),
    //       data: {
    //         cardTitle: result.title,
    //         checklistTitle: checklist.title,
    //         checklistItemTitle: title,
    //         dueDate: item.dueDate,
    //         dueDateTime: item.dueDateTime || '',
    //         dueDateTitle: item.dueDateTitle || ''
    //       }
    //     })
    //   }
    // }

    await activityService.createActivity({
      userId,
      type: 'updateChecklistItem',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        checklistTitle: checklist.title,
        oldChecklistItemTitle: oldChecklistItem.title,
        newChecklistItemTitle: title
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteChecklistItem = async (userId, cardId, item) => {
  try {
    const checklistId = item.checklistId
    const itemId = item.itemId
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId) })
    const checklist = getChecklistById(card, checklistId)
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'checklists._id': new ObjectId(checklistId) },
      { $pull: { 'checklists.$.items': { _id: new ObjectId(itemId) } } },
      { returnDocument: 'after' }
    )

    await activityService.createActivity({
      userId,
      type: 'deleteChecklistItem',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        checklistTitle: checklist.title,
        checklistItemTitle: item.title
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const checkListInCardModel = {
  addChecklistInCard,
  updateChecklistInCard,
  deleteChecklistInCard,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem
}