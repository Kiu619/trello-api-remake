import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { env } from '~/config/environment'
import { userModel } from '~/models/userModel'

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
)

// Tạo URL để user authorize
const getAuthUrl = () => {
  const scopes = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file'
  ]

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  })
}

// Lấy access token từ authorization code
const getAccessToken = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)
    return tokens
  } catch (error) {
    throw new Error(`Error getting access token: ${error.message}`)
  }
}

// Set credentials cho user
const setCredentials = (tokens) => {
  oauth2Client.setCredentials(tokens)
}

// Lấy danh sách files từ Google Drive
const listFiles = async (pageToken = null, query = null) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const params = {
      pageSize: 20,
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, thumbnailLink, iconLink)',
      orderBy: 'modifiedTime desc'
    }

    if (pageToken) params.pageToken = pageToken
    if (query) params.q = `name contains '${query}'`

    const response = await drive.files.list(params)
    return response.data
  } catch (error) {
    throw new Error(`Error listing files: ${error.message}`)
  }
}

// Lấy thông tin chi tiết của một file
const getFileDetails = async (fileId) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, iconLink, parents'
    })

    return response.data
  } catch (error) {
    throw new Error(`Error getting file details: ${error.message}`)
  }
}

// Tạo permission để share file (nếu cần)
const shareFile = async (fileId, email, role = 'reader') => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const response = await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: role,
        type: 'user',
        emailAddress: email
      }
    })

    return response.data
  } catch (error) {
    throw new Error(`Error sharing file: ${error.message}`)
  }
}

const isUserConnected = async (userId) => {
  try {
    const googleDriveData = await userModel.getGoogleDriveTokens(userId)

    if (!googleDriveData || !googleDriveData.isConnected) {
      return { connected: false, reason: 'Not connected' }
    }

    // Kiểm tra token có hết hạn không
    if (googleDriveData.tokenExpiry && new Date() > googleDriveData.tokenExpiry) {
      // Thử refresh token
      try {
        const newTokens = await refreshAccessToken(userId)
        return { connected: true, tokens: newTokens }
      } catch (error) {
        return { connected: false, reason: 'Token expired and refresh failed' }
      }
    }

    return {
      connected: true,
      tokens: {
        access_token: googleDriveData.accessToken,
        refresh_token: googleDriveData.refreshToken,
        expiry_date: googleDriveData.tokenExpiry
      }
    }
  } catch (error) {
    return { connected: false, reason: error.message }
  }
}

const refreshAccessToken = async (userId) => {
  try {
    const googleDriveData = await userModel.getGoogleDriveTokens(userId)

    if (!googleDriveData.refreshToken) {
      throw new Error('No refresh token available')
    }

    oauth2Client.setCredentials({
      refresh_token: googleDriveData.refreshToken
    })

    const { credentials } = await oauth2Client.refreshAccessToken()

    // Lưu tokens mới
    await userModel.saveGoogleDriveTokens(userId, credentials)

    return credentials
  } catch (error) {
    // Nếu refresh thất bại, disconnect user
    await userModel.disconnectGoogleDrive(userId)
    throw new Error(`Failed to refresh token: ${error.message}`)
  }
}

const setCredentialsForUser = async (userId) => {
  try {
    const connectionStatus = await isUserConnected(userId)

    if (!connectionStatus.connected) {
      throw new Error(connectionStatus.reason)
    }

    oauth2Client.setCredentials(connectionStatus.tokens)
    return true
  } catch (error) {
    throw new Error(`Failed to set credentials: ${error.message}`)
  }
}

export const googleDriveService = {
  getAuthUrl,
  getAccessToken,
  setCredentials,
  listFiles,
  getFileDetails,
  shareFile,
  isUserConnected,
  refreshAccessToken,
  setCredentialsForUser
}
