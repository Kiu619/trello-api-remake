import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { EMAIL_RULE, EMAIL_RULE_MESSAGE, OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { boardModel } from './boardModel'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { pickUser } from '~/utils/formatter'

const USER_ROLES = {
  CLIENT: 'client',
  ADMIN: 'admin'
}

const SESSIONS_SCHEMA = Joi.object({
  device_id: Joi.string().required(),
  is_2fa_verified: Joi.boolean().default(false),
  last_login: Joi.date().timestamp('javascript').default(Date.now)
})


// Define Collection (name & schema)
export const USER_COLLECTION_NAME = 'users'
const USER_COLLECTION_SCHEMA = Joi.object({
  email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE), // unique
  password: Joi.string().required(),
  // username cắt ra từ email sẽ có khả năng không unique bởi vì sẽ có những tên email trùng nhau nhưng từ các nhà cung cấp khác nhau
  username: Joi.string().required().trim().strict(),
  displayName: Joi.string().required().trim().strict(),
  avatar: Joi.string().default(null),
  role: Joi.string().valid(...Object.values(USER_ROLES)).default(USER_ROLES.CLIENT),

  isActive: Joi.boolean().default(false),
  verifyToken: Joi.string(),
  isRequire2fa: Joi.boolean().default(false),

  starredBoardIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),

  recentBoardIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),
  twoFA_secret_key: Joi.string().trim(),
  sessions: Joi.array().items(SESSIONS_SCHEMA).default([]),

  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const INVALID_UPDATE_FIELDS = ['_id', 'email', 'createdAt']

const validateBeforeCreate = async (data) => {
  return USER_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const createdUser = await GET_DB().collection(USER_COLLECTION_NAME).insertOne(validData)
    return createdUser
  }
  catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (userId) => {
  try {
    const user = await GET_DB().collection(USER_COLLECTION_NAME).findOne({ _id: new ObjectId(userId) })
    return user
  }
  catch (error) {
    throw new Error(error)
  }
}

const findOneByEmail = async (email) => {
  try {
    const user = await GET_DB().collection(USER_COLLECTION_NAME).findOne({ email })
    return user
  }
  catch (error) {
    throw new Error(error)
  }
}

const update = async (userId, data) => {
  try {
    Object.keys(data).forEach((key) => {
      if (INVALID_UPDATE_FIELDS.includes(key)) {
        delete data[key]
      }
    })

    const result = await GET_DB().collection(USER_COLLECTION_NAME).findOneAndUpdate({ _id: new ObjectId(userId) }, { $set: data }, { returnDocument: 'after' })
    return result
  }
  catch (error) {
    throw new Error(error)
  }
}

const getStarredBoards = async (userId) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const boardIds = user.starredBoardIds.map(id => new ObjectId(id))
    const boards = await GET_DB().collection(boardModel.BOARD_COLLECTION_NAME).find({ _id: { $in: boardIds } }).toArray()
    return boards
  } catch (error) {
    throw new Error(error)
  }
}

const getRecentBoards = async (userId) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const boardIds = user.recentBoardIds.map(id => new ObjectId(id))
    const boards = await GET_DB().collection(boardModel.BOARD_COLLECTION_NAME).find({ _id: { $in: boardIds } }).toArray()
    return boards
  }
  catch (error) {
    throw new Error(error)
  }
}

const generateTwoFAKey = async (userId) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }
    const key = authenticator.generateSecret()

    await update(userId, { twoFA_secret_key: key })
    return key
  }
  catch (error) {
    throw new Error(error)
  }
}

const findTwoFAKeyByUserId = async (userId) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }
    const key = user.twoFA_secret_key
    return key
  }
  catch (error) {
    throw new Error(error)
  }
}

const findSessionByDeviceId = async (userId, device_id) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const session = user?.sessions?.find(s => s.device_id === device_id)
    return session
  }
  catch (error) {
    throw new Error(error)
  }
}

const insertSession = async (userId, device_id) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const session = {
      device_id: device_id,
      is_2fa_verified: false,
      last_login: Date.now()
    }

    user.sessions.push(session)
    await update(userId, { sessions: user.sessions })
    return session
  } catch (error) {
    throw new Error(error)
  }
}

const updateSession = async (userId, device_id, data) => {
  try {
    const user = await findOneById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const sessionIndex = user.sessions.findIndex(s => s.device_id === device_id)
    if (sessionIndex === -1) {
      throw new Error('Session not found')
    }

    user.sessions[sessionIndex] = { ...user.sessions[sessionIndex], ...data }
    await update(userId, { sessions: user.sessions })
  }
  catch (error) {
    throw new Error(error)
  }
}

const getUsers = async (queryFilter) => {
  try {
    const queryConditions = [
      { _destroy: false }
    ]
    Object.keys(queryFilter).forEach(key => {
      queryConditions.push({ [key]: { $regex: new RegExp(queryFilter[key], 'i') } })
    })
    const users = await GET_DB().collection(USER_COLLECTION_NAME).aggregate([
      { $match: { $and: queryConditions } },
      { $project: { email: 1, displayName: 1, avatar: 1 } } // Include only email, displayName, and avatar
    ],
    { collation: { locale: 'en' } }).toArray()

    return users
  } catch (error) {
    throw new Error(error)
  }
}

// Thêm function để lưu Google Drive tokens
const saveGoogleDriveTokens = async (userId, tokens) => {
  try {
    const updateData = {
      'googleDrive.isConnected': true,
      'googleDrive.accessToken': tokens.access_token,
      'googleDrive.refreshToken': tokens.refresh_token,
      'googleDrive.tokenExpiry': tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      'googleDrive.connectedAt': new Date()
    }

    const result = await GET_DB().collection(USER_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    return result
  } catch (error) {
    throw new Error(error)
  }
}

// Function để lấy Google Drive tokens
const getGoogleDriveTokens = async (userId) => {
  try {
    const user = await GET_DB().collection(USER_COLLECTION_NAME).findOne(
      { _id: new ObjectId(userId) },
      { projection: { googleDrive: 1 } }
    )

    return user?.googleDrive || null
  } catch (error) {
    throw new Error(error)
  }
}

// Function để xóa Google Drive connection
const disconnectGoogleDrive = async (userId) => {
  try {
    const updateData = {
      'googleDrive.isConnected': false,
      'googleDrive.accessToken': null,
      'googleDrive.refreshToken': null,
      'googleDrive.tokenExpiry': null,
      'googleDrive.connectedAt': null
    }

    const result = await GET_DB().collection(USER_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )

    return result
  } catch (error) {
    throw new Error(error)
  }
}


export const userModel = {
  USER_ROLES,
  USER_COLLECTION_NAME,
  createNew,
  findOneById,
  findOneByEmail,
  update, getStarredBoards, getRecentBoards,
  findTwoFAKeyByUserId, generateTwoFAKey, findSessionByDeviceId,
  insertSession, updateSession, getUsers,
  saveGoogleDriveTokens,
  getGoogleDriveTokens,
  disconnectGoogleDrive
}