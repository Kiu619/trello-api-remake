/* eslint-disable no-useless-catch */
import { env } from '~/config/environment'
import { boardModel } from '~/models/boardModel'
import { cardModel } from '~/models/cardModel'
import { columnModel } from '~/models/columnModel'
import { userModel } from '~/models/userModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import { slugify } from '~/utils/formatter'

const createNew = async (reqBody) => {
  try {
    const newCard = {
      ...reqBody,
      slug: slugify(reqBody.title),
    }
    const createCard = await cardModel.createNew(newCard)
    const getNewCard = await cardModel.findOneById(createCard.insertedId)

    if (getNewCard) {
      // Cập nhật mảng columnOrderIds của board
      await columnModel.pushCardOrderIds(getNewCard)
    }

    return getNewCard
  } catch (error) {
    throw new Error(error)
  }
}

const getDetails = async (userId, cardId) => {
  try {
    const card = await cardModel.findOneById(cardId)
    if (!card) {
      throw new Error('Card not found')
    }
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const getDetailsByTitle = async (userId, boardId, cardTitle) => {
  try {
    const card = await cardModel.findOneByTitle(cardTitle)
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const getPositionInColumn = async (cardId, columnId) => {
  try {
    const card = await cardModel.getPositionInColumn(cardId, columnId)
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const moveCardToDifferentBoard = async (cardId, reqBody) => {
  try {
    const { currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition } = reqBody
    const card = await cardModel.moveCardToDifferentBoard(cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition)
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const copyCard = async (cardId, reqBody) => {
  try {
    const { currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition, title, keepingItems } = reqBody
    const card = await cardModel.copyCard(cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition, title, keepingItems)
    if (!card) {
      throw new Error('Card not found')
    }
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const deleteCard = async (cardId) => {
  try {
    const card = await cardModel.findOneById(cardId)
    if (!card) {
      throw new Error('Card not found')
    }
    // Xoá card
    await cardModel.deleteCardById(cardId)
    // Xoá cardId trong column
    await columnModel.pullCardOrderIds(card)
    return { deleteResult: 'Card deleted succesfully' }
  } catch (error) {
    throw new Error(error)
  }
}


const update = async (cardId, reqBody, cardCoverFile, attachmentFile, userInfo) => {
  try {
    const card = await cardModel.findOneById(cardId)

    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }

    let updatedCard = null

    if (cardCoverFile) {
      updatedCard = await updateCardCover(cardId, cardCoverFile)
    }
    else if (attachmentFile) {
      updatedCard = await addAttachment(cardId, attachmentFile)
    }
    else if (updateData.attachmentToEdit) {
      updatedCard = await editAttachment(cardId, updateData.attachmentToEdit)
    }
    else if (updateData.commentToAdd) {
      updatedCard = await addNewComment(card, cardId, updateData, userInfo)
    }
    else if (updateData.commentToUpdate) {
      updatedCard = await updateComment(card, cardId, updateData.commentToUpdate, userInfo)
    }
    else if (updateData.incomingMemberInfo) {
      updatedCard = await updateCardMembers(cardId, updateData.incomingMemberInfo)
    }
    else if (updateData.incomingChecklistInfo) {
      updatedCard = await updateChecklist(cardId, updateData.incomingChecklistInfo)
    }
    else if (updateData.incomingChecklistItemInfo) {
      updatedCard = await updateChecklistItem(cardId, updateData.incomingChecklistItemInfo)
    }
    else {
      updatedCard = await updateCard(cardId, updateData)
    }

    return updatedCard
  } catch (error) {
    throw new Error(error)
  }
}

const updateCardCover = async (cardId, cardCoverFile) => {
  const uploadResult = await CloudinaryProvider.streamUpload(cardCoverFile.buffer, 'cardCover')
  return await cardModel.update(cardId, { cover: uploadResult.secure_url })
}

const addNewComment = async (card, cardId, updateData, userInfo) => {
  const { boardId, ...commentData } = updateData.commentToAdd // Destructure to remove boardId
  const board = await boardModel.findOneById(boardId)

  const newComment = {
    ...commentData,
    userId: userInfo._id,
    userEmail: userInfo.email,
    isEdited: false,
    commentedAt: Date.now()
  }

  // Nếu có user được tag trong comment thì gửi email thông báo
  if (newComment.taggedUserIds.length > 0) {
    newComment.taggedUserIds.forEach(async (taggedUserId) => {
      const taggedUserInfo = await userModel.findOneById(taggedUserId)
      if (taggedUserInfo) {
        // Gửi email thông báo
        const customSubject = `You were tagged in a comment in Card: ${card.title} in Board: ${boardId}`
        const htmlContent = `
          <h2>You were tagged by ${userInfo.email} in a comment in Card: ${card.title} in Board: ${board.title}</h2>
          <p>Comment: ${newComment.content}</p>
          <p>Click <a href="${env.WEBSITE_DOMAIN_DEV}/board/${boardId}/card/${cardId}">here</a> to view</p>
        `
        await BrevoProvider.sendEmail(taggedUserInfo.email, customSubject, htmlContent)
      }
    })
  }

  // unshiftNewComment: thêm mới comment vào mảng comments của card (thêm vào đầu mảng cho đỡ phải sắp xếp)
  return await cardModel.unshiftNewComment(cardId, newComment)
}

const updateComment = async (card, cardId, commentToUpdate, userInfo) => {
  if (commentToUpdate.action === 'EDIT') {
    const { action, boardId, ...commentData } = commentToUpdate
    const board = await boardModel.findOneById(boardId)

    const updateCommentData = {
      ...commentData,
      userId: userInfo._id,
      userEmail: userInfo.email,
      isEdited: true,
      edittedAt: Date.now()
    }

    // Nếu có user được tag trong comment thì gửi email thông báo
    if (updateCommentData.taggedUserIds.length > 0) {
      updateCommentData.taggedUserIds.forEach(async (taggedUserId) => {
        const taggedUserInfo = await userModel.findOneById(taggedUserId)
        if (taggedUserInfo) {
          // Gửi email thông báo
          const customSubject = `You were tagged in a comment in Card: ${card.title} in Board: ${boardId}`
          const htmlContent = `
        <h2>You were tagged by ${userInfo.email} in a comment in Card: ${card.title} in Board: ${board.title}</h2>
        <p>Comment: ${updateCommentData.content}</p>
        <p>Click <a href="${env.WEBSITE_DOMAIN_DEV}/board/${boardId}/card/${cardId}">here</a> to view</p>
      `
          await BrevoProvider.sendEmail(taggedUserInfo.email, customSubject, htmlContent)
        }
      })
    }

    return await cardModel.updateComment(cardId, updateCommentData)
  } else if (commentToUpdate.action === 'DELETE') {
    return await cardModel.deleteComment(cardId, commentToUpdate._id)
  }
}

const updateCardMembers = async (cardId, incomingMemberInfo) => {
  return await cardModel.updateMember(cardId, incomingMemberInfo)
}

const updateCard = async (cardId, updateData) => {
  return await cardModel.update(cardId, updateData)
}

const updateChecklist = async (cardId, incomingChecklistInfo) => {
  return await cardModel.updateChecklist(cardId, incomingChecklistInfo)
}

const updateChecklistItem = async (cardId, incomingChecklistItemInfo) => {
  return await cardModel.updateChecklistItem(cardId, incomingChecklistItemInfo)
}

const addAttachment = async (cardId, attachmentFile) => {
  return await cardModel.addAttachment(cardId, attachmentFile)
}

const editAttachment = async (cardId, attachmentData) => {
  return await cardModel.editAttachment(cardId, attachmentData)
}

export const cardService = {
  createNew,
  update,
  getDetails,
  getDetailsByTitle,
  getPositionInColumn,
  moveCardToDifferentBoard,
  copyCard,
  deleteCard
}