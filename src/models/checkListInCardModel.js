import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { GET_DB } from '~/config/mongodb'
import { CARD_COLLECTION_NAME } from '~/models/cardModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { env } from '~/config/environment'

export const CHECKLIST_ITEM_SCHEMA = Joi.object({
  _id: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required(),
  isChecked: Joi.boolean().default(false),
  assignedTo: Joi.array().items(Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)).default([])
})

export const CHECKLIST_SCHEMA = Joi.object({
  _id: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  title: Joi.string().required(),
  items: Joi.array().items(CHECKLIST_ITEM_SCHEMA).default([])
})


const addChecklistInCard = async (cardId, checklist) => {
  try {
    const checklistId = new ObjectId()
    const title = checklist.title
    const checklistWithId = { title, _id: checklistId, items: [] }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { checklists: checklistWithId } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateChecklistInCard = async (cardId, updatedChecklist) => {
  try {
    const _id = updatedChecklist.checklistId
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
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteChecklistInCard = async (cardId, checklistId) => {
  try {
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $pull: { checklists: { _id: new ObjectId(checklistId) } } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const addChecklistItem = async (cardId, item) => {
  try {
    const itemId = new ObjectId()
    const title = item.title
    const checklistId = item.checklistId
    const itemWithId = { title, _id: itemId, isChecked: false, assignedTo: [] }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'checklists._id': new ObjectId(checklistId) },
      { $push: { 'checklists.$.items': itemWithId } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const updateChecklistItem = async (cardId, item) => {
  try {
    const checklistId = item.checklistId
    const itemId = item.itemId
    const title = item.title
    const isChecked = item.isChecked
    const assignedTo = item.assignedTo
    const updatedItem = { title, _id: new ObjectId(itemId), isChecked, assignedTo }

    // Nếu có trường assignMember = true thì gửi email thông báo (viết code chán thật sự, thật ra phải viết ở service)
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
    return result
  } catch (error) {
    throw new Error(error)
  }
}


const deleteChecklistItem = async (cardId, item) => {
  try {
    const checklistId = item.checklistId
    const itemId = item.itemId

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'checklists._id': new ObjectId(checklistId) },
      { $pull: { 'checklists.$.items': { _id: new ObjectId(itemId) } } },
      { returnDocument: 'after' }
    )
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