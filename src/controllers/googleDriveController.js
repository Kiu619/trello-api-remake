import { StatusCodes } from 'http-status-codes'
import { googleDriveService } from '~/services/googleDriveService'
import { attachmantInCardModel } from '~/models/attachmentModel'
import { userModel } from '~/models/userModel'

const getAuthUrl = async (req, res, next) => {
  try {
    const authUrl = googleDriveService.getAuthUrl()
    res.status(StatusCodes.OK).json({ authUrl })
  } catch (error) {
    next(error)
  }
}

const handleCallback = async (req, res, next) => {
  try {
    const { code } = req.query
    const userId = req.jwtDecoded._id // Lấy từ JWT token

    const tokens = await googleDriveService.getAccessToken(code)

    // Lưu tokens vào database thay vì session
    await userModel.saveGoogleDriveTokens(userId, tokens)

    res.status(StatusCodes.OK).json({
      message: 'Google Drive connected successfully',
      connected: true
    })
  } catch (error) {
    next(error)
  }
}

// Kiểm tra trạng thái kết nối
const getConnectionStatus = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const connectionStatus = await googleDriveService.isUserConnected(userId)

    res.status(StatusCodes.OK).json({
      connected: connectionStatus.connected,
      tokens: connectionStatus.tokens || null
    })
  } catch (error) {
    next(error)
  }
}

// Ngắt kết nối Google Drive
const disconnect = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    await userModel.disconnectGoogleDrive(userId)

    res.status(StatusCodes.OK).json({
      message: 'Google Drive disconnected successfully',
      connected: false
    })
  } catch (error) {
    next(error)
  }
}

const listFiles = async (req, res, next) => {
  try {
    const { pageToken, query } = req.query
    const userId = req.jwtDecoded._id

    // Kiểm tra và set credentials
    await googleDriveService.setCredentialsForUser(userId)

    const files = await googleDriveService.listFiles(pageToken, query)
    res.status(StatusCodes.OK).json(files)
  } catch (error) {
    if (error.message.includes('Not connected') || error.message.includes('Token expired')) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        errors: 'Google Drive not connected or token expired',
        needsReconnection: true
      })
    }
    next(error)
  }
}

const attachFileToCard = async (req, res, next) => {
  try {
    const { cardId } = req.params
    const { fileId } = req.body
    const userId = req.jwtDecoded._id

    // Kiểm tra và set credentials
    await googleDriveService.setCredentialsForUser(userId)

    const fileDetails = await googleDriveService.getFileDetails(fileId)
    const result = await attachmantInCardModel.attachGoogleDriveFile(userId, cardId, fileDetails)

    res.status(StatusCodes.OK).json({
      message: 'File attached successfully',
      card: result
    })
  } catch (error) {
    if (error.message.includes('Not connected') || error.message.includes('Token expired')) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        errors: 'Google Drive not connected or token expired',
        needsReconnection: true
      })
    }
    next(error)
  }
}

export const googleDriveController = {
  getAuthUrl,
  handleCallback,
  getConnectionStatus,
  disconnect,
  listFiles,
  attachFileToCard
}
