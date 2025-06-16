/* eslint-disable no-useless-catch */
import { env } from '~/config/environment'
import { boardModel } from '~/models/boardModel'
import { cardModel } from '~/models/cardModel'
import { columnModel } from '~/models/columnModel'
import { userModel } from '~/models/userModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import { slugify } from '~/utils/formatter'
import { activityService } from './activityService'
import { ObjectId } from 'mongodb'
import { WEBSITE_DOMAIN } from '~/utils/constants'

const createNew = async (userId, reqBody) => {
  try {
    const newCard = {
      ...reqBody,
      slug: slugify(reqBody.title)
    }

    const createCard = await cardModel.createNew(userId, newCard)
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
    const card = await cardModel.getDetails(userId, cardId)
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

const moveCardToDifferentBoard = async (userId, cardId, reqBody) => {
  try {
    const { currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition } = reqBody
    const card = await cardModel.moveCardToDifferentBoard(userId, cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition)
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const copyCard = async (userId, cardId, reqBody) => {
  try {
    const { currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition, title, keepingItems } = reqBody
    const card = await cardModel.copyCard(userId, cardId, currentBoardId, currentColumnId, newBoardId, newColumnId, newPosition, title, keepingItems)
    if (!card) {
      throw new Error('Card not found')
    }
    return card
  } catch (error) {
    throw new Error(error)
  }
}

const deleteCard = async (userId, cardId) => {
  try {
    const card = await cardModel.findOneById(cardId)
    if (!card) {
      throw new Error('Card not found')
    }
    // Xoá card
    await cardModel.deleteCardById(cardId)
    // Xoá cardId trong column
    await columnModel.pullCardOrderIds(card)

    await activityService.createActivity({
      userId,
      type: 'deleteCard',
      cardId: cardId,
      boardId: card.boardId.toString(),
      data: {
        cardTitle: card.title
      }
    })

    return { deleteResult: 'Card deleted succesfully' }
  } catch (error) {
    throw new Error(error)
  }
}


const update = async (userId, cardId, reqBody, cardCoverFile, attachmentFile, userInfo) => {
  try {
    const card = await cardModel.findOneById(cardId)

    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }

    let updatedCard = null

    if (cardCoverFile) {
      updatedCard = await updateCardCover(userId, cardId, cardCoverFile)
    }
    else if (attachmentFile) {
      updatedCard = await addAttachment(userId, cardId, attachmentFile)
    }
    else if (updateData.attachmentToEdit) {
      updatedCard = await editAttachment(userId, cardId, updateData.attachmentToEdit)
    }
    else if (updateData.commentToAdd) {
      updatedCard = await addNewComment(userId, card, cardId, updateData, userInfo)
    }
    else if (updateData.commentToUpdate) {
      updatedCard = await updateComment(userId, card, cardId, updateData.commentToUpdate, userInfo)
    }
    else if (updateData.incomingMemberInfo) {
      updatedCard = await updateCardMembers(userId, cardId, updateData.incomingMemberInfo)
    }
    else if (updateData.incomingChecklistInfo) {
      updatedCard = await updateChecklist(userId, cardId, updateData.incomingChecklistInfo)
    }
    else if (updateData.incomingChecklistItemInfo) {
      updatedCard = await updateChecklistItem(userId, cardId, updateData.incomingChecklistItemInfo)
    }
    else {
      updatedCard = await updateCard(userId, cardId, updateData)
    }

    return updatedCard
  } catch (error) {
    throw new Error(error)
  }
}

const updateCardCover = async (userId, cardId, cardCoverFile) => {
  const uploadResult = await CloudinaryProvider.streamUpload(cardCoverFile.buffer, 'cardCover')
  return await cardModel.update(userId, cardId, { cover: uploadResult.secure_url })
}

const addNewComment = async (userId, card, cardId, updateData, userInfo) => {
  const { boardId, ...commentData } = updateData.commentToAdd // Destructure to remove boardId
  const board = await boardModel.findOneById(boardId)
  const commentId = new ObjectId()
  const newComment = {
    ...commentData,
    _id: commentId,
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
        const customSubject = `You were tagged in a comment in Card: ${card.title} in Board: ${board.title}`
        const htmlContent = `
          <h2>You were tagged by ${userInfo.email} in a comment in Card: ${card.title} in Board: ${board.title}</h2>
          <p>Comment: ${newComment.content}</p>
          <p>Click <a href="${WEBSITE_DOMAIN}/board/${boardId}/card/${cardId}">here</a> to view</p>
        `
        await BrevoProvider.sendEmail(taggedUserInfo.email, customSubject, htmlContent)
      }
    })
  }

  const result = await cardModel.unshiftNewComment(cardId, newComment)

  await activityService.createActivity({
    userId,
    type: 'addEditComment',
    cardId: cardId,
    boardId: boardId,
    data: {
      commentId: newComment._id.toString(),
      cardTitle: card.title,
      commentText: newComment.content,
      commentType: 'add'
    }
  })

  // unshiftNewComment: thêm mới comment vào mảng comments của card (thêm vào đầu mảng cho đỡ phải sắp xếp)
  return result
}

const updateComment = async (userId, card, cardId, commentToUpdate, userInfo) => {
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
        <p>Click <a href="${WEBSITE_DOMAIN}/board/${boardId}/card/${cardId}">here</a> to view</p>
      `
          await BrevoProvider.sendEmail(taggedUserInfo.email, customSubject, htmlContent)
        }
      })
    }
    await activityService.deleteActivityByDeleteComment(cardId, commentToUpdate._id)
    await activityService.createActivity({
      userId,
      type: 'addEditComment',
      cardId: cardId,
      boardId: boardId,
      data: {
        commentId: commentToUpdate._id.toString(),
        cardTitle: card.title,
        commentText: updateCommentData.content,
        commentType: 'edit'
      }
    })

    return await cardModel.updateComment(cardId, updateCommentData)
  } else if (commentToUpdate.action === 'DELETE') {
    await activityService.deleteActivityByDeleteComment(cardId, commentToUpdate._id)
    return await cardModel.deleteComment(cardId, commentToUpdate._id)
  }
}

const updateCardMembers = async (userId, cardId, incomingMemberInfo) => {
  return await cardModel.updateMember(userId, cardId, incomingMemberInfo)
}

const updateCard = async (userId, cardId, updateData) => {
  return await cardModel.update(userId, cardId, updateData)
}

const updateChecklist = async (userId, cardId, incomingChecklistInfo) => {
  return await cardModel.updateChecklist(userId, cardId, incomingChecklistInfo)
}

const updateChecklistItem = async (userId, cardId, incomingChecklistItemInfo) => {
  return await cardModel.updateChecklistItem(userId, cardId, incomingChecklistItemInfo)
}

const addAttachment = async (userId, cardId, attachmentFile) => {
  return await cardModel.addAttachment(userId, cardId, attachmentFile)
}

const editAttachment = async (userId, cardId, attachmentData) => {
  return await cardModel.editAttachment(userId, cardId, attachmentData)
}

const updateLabel = async (userId, cardId, labelIds) => {
  return await cardModel.updateLabel(userId, cardId, labelIds)
}

export const cardService = {
  createNew,
  update,
  getDetails,
  getDetailsByTitle,
  getPositionInColumn,
  moveCardToDifferentBoard,
  copyCard,
  deleteCard,
  updateLabel
}