import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { GET_DB } from '~/config/mongodb'
import { CARD_COLLECTION_NAME } from '~/models/cardModel'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import { activityService } from '~/services/activityService'

export const ATTACHMENT_SCHEMA = Joi.object({
  _id: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  url: Joi.string().uri().required(),
  filename: Joi.string().required(),
  fileType: Joi.string().required(), // New field for file type
  uploadedAt: Joi.date().timestamp()
})

const getAttachmentById = (card, attachmentId) => {
  return card.attachments.find(attachment =>
    attachment._id.toString() === attachmentId.toString()
  )
}

const addAttachment = async (userId, cardId, attachmentFile) => {
  try {
    const resourceType = attachmentFile.mimetype.startsWith('image/') ? 'image' : 'raw'
    const uploadResult = await CloudinaryProvider.streamUploadAttachment(attachmentFile.buffer, 'attachment', resourceType)
    const attachmentId = new ObjectId()
    const fileType = attachmentFile.originalname.split('.').pop().toLowerCase()

    const attachment = {
      _id: attachmentId,
      url: uploadResult.secure_url,
      filename: attachmentFile.originalname,
      fileType: fileType,
      uploadedAt: Date.now()
    }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { attachments: { $each: [attachment], $position: 0 } } },
      { returnDocument: 'after' }
    )

    activityService.createActivity({
      userId,
      type: 'addAttachment',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        attachmentName: attachment.filename
      }
    })

    return result
  } catch (error) {
    throw new Error(error)
  }
}

const editAttachment = async (userId, cardId, attachmentData) => {
  try {
    const _id = new ObjectId(attachmentData._id)
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId), 'attachments._id': new ObjectId(_id) })
    const oldAttachment = getAttachmentById(card, _id)
    const url = attachmentData.url
    const filename = attachmentData.filename
    const fileType = attachmentData.fileType
    const uploadedAt = attachmentData.uploadedAt
    const updateData = { _id, url, filename, fileType, uploadedAt }
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId), 'attachments._id': _id },
      { $set: { 'attachments.$': updateData } },
      { returnDocument: 'after' }
    )

    activityService.createActivity({
      userId,
      type: 'editAttachment',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        attachmentName: oldAttachment.filename,
        newAttachmentName: updateData.filename
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteAttachment = async (userId, cardId, attachmentId) => {
  try {
    const card = await GET_DB().collection(CARD_COLLECTION_NAME).findOne({ _id: new ObjectId(cardId), 'attachments._id': new ObjectId(attachmentId) })
    const attachment = getAttachmentById(card, attachmentId)
    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $pull: { attachments: { _id: new ObjectId(attachmentId) } } },
      { returnDocument: 'after' }
    )

    activityService.createActivity({
      userId,
      type: 'deleteAttachment',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        attachmentName: attachment.filename
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const attachmantInCardModel = {
  addAttachment, editAttachment, deleteAttachment
}
