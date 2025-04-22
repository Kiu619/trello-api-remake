import { StatusCodes } from 'http-status-codes'
import { invitationService } from '~/services/invitationService'

const createNewBoardInvitation = async (req, res, next) => {
  try {
    const inviterId = req.jwtDecoded._id
    const result = await invitationService.createNewBoardInvitation(req.body, inviterId)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) {
    next(error)
  }
}

const getInvitations = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const result = await invitationService.getInvitations(userId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const updateBoardInvitation = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const invitationId = req.params.invitationId
    const status = req.body.status
    const result = await invitationService.updateBoardInvitation(userId, invitationId, status)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}
export const invitationController = {
  createNewBoardInvitation, getInvitations, updateBoardInvitation
}