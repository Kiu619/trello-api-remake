import { StatusCodes } from 'http-status-codes'
import { boardModel } from '~/models/boardModel'
import { invitationModel } from '~/models/invitationModel'
import { userModel } from '~/models/userModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import ApiError from '~/utils/ApiError'
import { BOARD_INVITATION_STATUS, INVITATION_TYPES, WEBSITE_DOMAIN } from '~/utils/constants'
import { pickUser } from '~/utils/formatter'

const createNewBoardInvitation = async (reqBody, inviterId) => {
  try {
    const inviter = await userModel.findOneById(inviterId)
    const invitee = await userModel.findOneByEmail(reqBody.inviteeEmail)
    const board = await boardModel.findOneById(reqBody.boardId)

    if (!invitee) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!board) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    // Sau có thể làm thêm check xem user đã có trong board chưa

    const newInvitationData = {
      inviterId: inviterId,
      inviteeId: invitee._id.toString(),
      type: INVITATION_TYPES.BOARD_INVITATION,
      boardInvitation: {
        boardId: board._id.toString(),
        status: BOARD_INVITATION_STATUS.PENDING
      }
    }

    const createdInvitation = await invitationModel.createNewBoardInvitation(newInvitationData)
    const getInvitation = await invitationModel.findOneById(createdInvitation.insertedId)

    const resInvitation = {
      ...getInvitation,
      board,
      inviter: pickUser(inviter),
      invitee: pickUser(invitee)
    }

    //Gửi email thông báo
    const customSubject = 'You have a new board invitation'
    const htmlContent = `
      <h1>You have a new board invitation</h1>
      <h3>Inviter: ${inviter.email}</h3>
      <h3>Board: ${board.title}</h3>
      <h3>Login to your account to accept or reject this invitation</h3>
      <h3>>${WEBSITE_DOMAIN}</h3>
    `
    await BrevoProvider.sendEmail(invitee.email, customSubject, htmlContent)

    return resInvitation

  } catch (error) {
    throw new Error(error)
  }
}

const getInvitations = async (userId) => {
  try {
    const getInvitations = await invitationModel.findByUser(userId)

    // Format result
    getInvitations.forEach(invitation => {
      invitation.inviter = pickUser(invitation.inviter[0])
      invitation.invitee = pickUser(invitation.invitee[0])
      invitation.board = invitation.board[0]
    })

    return getInvitations
  } catch (error) {
    throw new Error(error)
  }
}

const updateBoardInvitation = async (userId, invitationId, status) => {
  try {
    const getInvitation = await invitationModel.findOneById(invitationId)
    if (!getInvitation) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invitation not found')
    }

    const boardId = getInvitation.boardInvitation.boardId
    const getBoard = await boardModel.findOneById(boardId)
    if (!getBoard) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    const boardOnwerAndMemberIds = [...getBoard.ownerIds, ...getBoard.memberIds].toString()
    // chuyển obid sang string để check
    if (status === BOARD_INVITATION_STATUS.ACCEPTED && boardOnwerAndMemberIds.includes(userId)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'You are already in board')
    }

    const updateData = {
      boardInvitation: {
        ...getInvitation.boardInvitation,
        status: status
      }
    }

    const updatedInvitation = await invitationModel.update(invitationId, updateData)

    if (updatedInvitation.boardInvitation.status === BOARD_INVITATION_STATUS.ACCEPTED) {
      await boardModel.pushMemberIds(boardId, userId)
    }

    return updatedInvitation
  } catch (error) {
    throw new Error(error)
  }
}


export const invitationService = {
  createNewBoardInvitation, getInvitations, updateBoardInvitation
}