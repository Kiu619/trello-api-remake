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
  fileName: Joi.string().required(),
  fileType: Joi.string().required(),
  uploadedAt: Joi.date().timestamp()
})

// Thêm schema cho Google Drive attachment
export const GOOGLE_DRIVE_ATTACHMENT_SCHEMA = Joi.object({
  _id: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),
  type: Joi.string().valid('google_drive').required(),
  fileId: Joi.string().required(), // Google Drive file ID
  fileName: Joi.string().required(),
  fileSize: Joi.number().optional(),
  mimeType: Joi.string().required(),
  webViewLink: Joi.string().uri().required(),
  webContentLink: Joi.string().uri().optional(),
  thumbnailLink: Joi.string().uri().optional(),
  iconLink: Joi.string().uri().optional(),
  createdAt: Joi.date().timestamp().default(Date.now),
  addedBy: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE).required()
})

// Cập nhật ATTACHMENT_SCHEMA để hỗ trợ cả file upload và Google Drive
export const UPDATED_ATTACHMENT_SCHEMA = Joi.alternatives().try(
  ATTACHMENT_SCHEMA, // Schema cũ cho file upload
  GOOGLE_DRIVE_ATTACHMENT_SCHEMA // Schema mới cho Google Drive
)

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
      fileName: attachmentFile.originalname,
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
        attachmentName: attachment.fileName
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
    const fileName = attachmentData.fileName
    const fileType = attachmentData.fileType
    const uploadedAt = attachmentData.uploadedAt
    const updateData = { _id, url, fileName, fileType, uploadedAt }
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
        attachmentName: oldAttachment.fileName,
        newAttachmentName: updateData.fileName
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
        attachmentName: attachment.fileName
      }
    })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

// Thêm function để attach Google Drive file
const attachGoogleDriveFile = async (userId, cardId, googleDriveFileData) => {
  try {
    const newAttachment = {
      _id: new ObjectId(),
      fileType: 'google_drive',
      fileId: googleDriveFileData.id,
      fileName: googleDriveFileData.name,
      fileSize: googleDriveFileData.size ? parseInt(googleDriveFileData.size) : null,
      mimeType: googleDriveFileData.mimeType,
      webViewLink: googleDriveFileData.webViewLink,
      webContentLink: googleDriveFileData.webContentLink,
      thumbnailLink: googleDriveFileData.thumbnailLink,
      iconLink: googleDriveFileData.iconLink,
      createdAt: new Date(),
      addedBy: new ObjectId(userId)
    }

    const result = await GET_DB().collection(CARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(cardId) },
      { $push: { attachments: newAttachment } },
      { returnDocument: 'after' }
    )

    // Tạo activity
    await activityService.createActivity({
      userId,
      type: 'attachGoogleDriveFile',
      cardId: cardId,
      boardId: result.boardId.toString(),
      data: {
        cardTitle: result.title,
        fileName: googleDriveFileData.name,
        fileType: 'Google Drive'
      }
    })

    return result
  } catch (error) {
    throw new Error(error)
  }
}

export const attachmantInCardModel = {
  addAttachment, editAttachment, deleteAttachment, attachGoogleDriveFile
}
