import { userModel } from '~/models/userModel'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import bcryptjs from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { pickUser } from '~/utils/formatter'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { env } from '~/config/environment'
import { JwtProvider } from '~/providers/JwtProvider'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import { GET_DB } from '~/config/mongodb'
import { CARD_COLLECTION_NAME } from '~/models/cardModel'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'

const SERVICE_NAME = 'TRELLO-BY-KIUU'

const createNew = async (reqBody) => {
  try {
    // Kieerm tra truoc khi tao
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (existUser) {
      throw new ApiError(StatusCodes.CONFLICT, 'Email already exists')
    }

    const nameFromEmail = reqBody.email.split('@')[0]
    const newUser = {
      ...reqBody,
      username: nameFromEmail,
      displayName: nameFromEmail,
      password: await bcryptjs.hash(reqBody.password, 10),
      verifyToken: uuidv4()
    }

    const createdUser = await userModel.createNew(newUser)
    const getNewUser = await userModel.findOneById(createdUser.insertedId) // Convert to ObjectId

    const verifycationLink = `${WEBSITE_DOMAIN}/account/verification?email=${getNewUser.email}&token=${getNewUser.verifyToken}`
    const customSubject = 'Please verify your email before using our services'
    const htmlContent = `
      <h1>Here is your verification link: </h1>
      <h3>${verifycationLink}</h3>
    `
    // Gọi tới Provider để gửi email
    await BrevoProvider.sendEmail(getNewUser.email, customSubject, htmlContent)

    return pickUser(getNewUser)

  } catch (error) {
    throw new Error(error)
  }
}

const verifyAccount = async (reqBody) => {
  try {
    const user = await userModel.findOneByEmail(reqBody.email)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Email not found')
    }

    if (user.isActive) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Account is already active')
    }

    if (user.verifyToken !== reqBody.token) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Token is incorrect')
    }

    const updatedUser = await userModel.update(user._id, { isActive: true, verifyToken: null })
    return pickUser(updatedUser)

  } catch (error) {
    throw new Error(error)
  }
}

const login = async (reqBody, device_id) => {
  try {
    const user = await userModel.findOneByEmail(reqBody.email)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Email not found')
    }

    if (!user.isActive) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Your account is not active')
    }

    const isPasswordMatch = await bcryptjs.compare(reqBody.password, user.password)
    if (!isPasswordMatch) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Password is incorrect')
    }

    const userInfo = { _id: user._id, email: user.email }
    const accessToken = JwtProvider.generateToken(userInfo, env.ACCESS_TOKEN_SECRET_SIGNATURE, env.ACCESS_TOKEN_LIFE)
    const refreshToken = JwtProvider.generateToken(userInfo, env.REFRESH_TOKEN_SECRET_SIGNATURE, env.REFRESH_TOKEN_LIFE)
    // Lấy starred boards và recent boards
    const starredBoards = await userModel.getStarredBoards(user._id)
    // console.log('starredBoards', starredBoards)
    const recentBoards = await userModel.getRecentBoards(user._id)
    // console.log('starredBoards', starredBoards)

    let resUser = pickUser(user)

    let currentUserSession = await userModel.findSessionByDeviceId(user._id, device_id)

    if (!currentUserSession) {
      currentUserSession = await userModel.insertSession(user._id, device_id)
    }

    resUser = {
      ...resUser,
      is_2fa_verified: currentUserSession.is_2fa_verified,
      last_login: currentUserSession.last_login
    }

    return { accessToken, refreshToken, ...pickUser(resUser), starredBoards, recentBoards }

  } catch (error) {
    throw new Error(error)
  }
}

const logout = async (userId, device_id) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }
    const session = await userModel.findSessionByDeviceId(userId, device_id)
    if (session) {
      await userModel.updateSession(userId, device_id, { is_2fa_verified: false })
    }
  } catch (error) {
    throw new Error(error)
  }
}


const refreshToken = async (refreshToken) => {
  try {
    const decoded = JwtProvider.verifyToken(refreshToken, env.REFRESH_TOKEN_SECRET_SIGNATURE)
    const userInfo = { _id: decoded._id, email: decoded.email }
    const accessToken = JwtProvider.generateToken(userInfo, env.ACCESS_TOKEN_SECRET_SIGNATURE, env.ACCESS_TOKEN_LIFE)

    return { accessToken }

  } catch (error) {
    throw new Error(error)
  }
}

const update = async (userId, reqBody, userAvatarFile) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }
    if (!user.isActive) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Your account is not active')
    }

    let updatedUser = {}
    const bulkOperations = []

    // Truong hợp change pass
    if (reqBody.current_password && reqBody.new_password) {
      const isPasswordMatch = await bcryptjs.compare(reqBody.current_password, user.password)
      if (!isPasswordMatch) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Current password is incorrect')
      }
      updatedUser = await userModel.update(userId, { password: await bcryptjs.hash(reqBody.new_password, 10) })
    } else if (userAvatarFile) {
      // Truong hop update avatar
      const uploadResult = await CloudinaryProvider.streamUpload(userAvatarFile.buffer, 'avatar')
      updatedUser = await userModel.update(userId, { avatar: uploadResult.secure_url })

      // Cập nhật thông tin người dùng trong tất cả các comment mà họ đã tạo
      bulkOperations.push({
        updateMany: {
          filter: { 'comments.userId': userId },
          update: { $set: { 'comments.$[elem].userAvatar': uploadResult.secure_url } },
          arrayFilters: [{ 'elem.userId': userId }]
        }
      })
    } else if (reqBody.boardId && reqBody.forStarred !== undefined) {
      // Truong hop starred/unstarred board
      const updatedStarredBoardIds = reqBody.forStarred
        ? [...user.starredBoardIds, reqBody.boardId]
        : user.starredBoardIds.filter(id => id !== reqBody.boardId)
      updatedUser = await userModel.update(userId, { starredBoardIds: updatedStarredBoardIds })
    } else if (reqBody.boardId && reqBody.forRecent) {
      // Truong hop recent board va chi cho chua 5 recent boards
      const updatedRecentBoardIds = [reqBody.boardId, ...user.recentBoardIds].slice(0, 5)
      updatedUser = await userModel.update(userId, { recentBoardIds: updatedRecentBoardIds })
    } else {
      updatedUser = await userModel.update(userId, reqBody)
      if (reqBody.displayName) {
        // Cập nhật thông tin người dùng trong tất cả các comment mà họ đã tạo
        bulkOperations.push({
          updateMany: {
            filter: { 'comments.userId': userId },
            update: { $set: { 'comments.$[elem].userDisplayName': reqBody.displayName } },
            arrayFilters: [{ 'elem.userId': userId }]
          }
        })
      }
    }

    // Execute bulk operations if there are any
    if (bulkOperations.length > 0) {
      await GET_DB().collection(CARD_COLLECTION_NAME).bulkWrite(bulkOperations)
    }

    return pickUser(updatedUser)
  } catch (error) {
    throw new Error(error)
  }
}

const forgotPassword = async (reqBody) => {
  try {
    const user = await userModel.findOneByEmail(reqBody.email)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Email not found')
    }

    const newPassword = uuidv4().slice(0, 8)
    const updatedUser = await userModel.update(user._id, { password: await bcryptjs.hash(newPassword, 10) })

    const customSubject = 'Your new password'
    const htmlContent = `
      <h1>Here is your new password: </h1>
      <h3>${newPassword}</h3>
    `
    // Gọi tới Provider để gửi email
    await BrevoProvider.sendEmail(user.email, customSubject, htmlContent)

    return pickUser(updatedUser)

  } catch (error) {
    throw new Error(error)
  }
}

const get2FAQRCode = async (userId) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }
    // Biến lưu trữ 2fa sercet key của user
    let twoFactorSercretKey = null
    // Lấy 2fa secret key từ Database
    const twoFASecretKey = await userModel.findTwoFAKeyByUserId(userId)
    if (!twoFASecretKey) {
      // Nếu chưa có 2fa secret key thì tạo mới
      twoFactorSercretKey = await userModel.generateTwoFAKey(userId)
    } else {
      twoFactorSercretKey = twoFASecretKey
    }

    //Tạo OTP token
    const otpAuthToken = authenticator.keyuri(
      user.username,
      SERVICE_NAME,
      twoFactorSercretKey
    )
    // Tao QR Code
    const QRCodeImgUrl = await QRCode.toDataURL(otpAuthToken)

    return { QRCodeImgUrl }
  } catch (error) {
    throw new Error(error)
  }
}

const setup2FA = async (userId, token, device_id) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }
    // Lấy 2fa secret key từ Database
    const twoFASecretKey = await userModel.findTwoFAKeyByUserId(userId)
    if (!twoFASecretKey) {
      throw new ApiError(StatusCodes.BAD_REQUEST, '2FA is not enabled')
    }
    // Verify OTP token
    const isValid = authenticator.verify({
      token: token,
      secret: twoFASecretKey
    })

    if (!isValid) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid OTP token')
    }

    // cập nhật user đã enable 2fa
    let updatedUser = await userModel.update(userId, { isRequire2fa: true })
    updatedUser = pickUser(updatedUser)
    updatedUser = { ...updatedUser, is_2fa_verified: true }

    // Cập nhật session
    await userModel.updateSession(userId, device_id, { is_2fa_verified: true })
    return updatedUser
  }
  catch (error) {
    throw new Error(error)
  }
}

const verify2FA = async (userId, token, device_id) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    // Lấy 2fa secret key từ Database
    const twoFASecretKey = await userModel.findTwoFAKeyByUserId(userId)
    if (!twoFASecretKey) {
      throw new ApiError(StatusCodes.BAD_REQUEST, '2FA is not enabled')
    }

    // Verify OTP token
    const isValid = authenticator.verify({
      token: token,
      secret: twoFASecretKey
    })

    if (!isValid) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid OTP token')
    }

    // cập nhật user đã enable 2fa
    let updatedUser = pickUser(user)
    updatedUser = { ...updatedUser, is_2fa_verified: true }

    // Cập nhật session
    await userModel.updateSession(userId, device_id, { is_2fa_verified: true })
    return updatedUser
  }
  catch (error) {
    throw new Error(error)
  }
}

const disable2FA = async (userId, token) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    // Lấy 2fa secret key từ Database
    const twoFASecretKey = await userModel.findTwoFAKeyByUserId(userId)
    if (!twoFASecretKey) {
      throw new ApiError(StatusCodes.BAD_REQUEST, '2FA is not enabled')
    }

    // Verify OTP token
    const isValid = authenticator.verify({
      token: token,
      secret: twoFASecretKey
    })

    if (!isValid) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid OTP token')
    }

    const updatedUser = await userModel.update(userId, { isRequire2fa: false, twoFA_secret_key:'' })
    return pickUser(updatedUser)

  } catch (error) {
    throw new Error(error)
  }
}

const getUsers = async (queryFilter) => {
  try {
    const users = await userModel.getUsers(queryFilter)
    return users
  } catch (error) {
    throw new Error(error)
  }
}

const send2FAEmailOTP = async (userId) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!user.isRequire2fa) {
      throw new ApiError(StatusCodes.BAD_REQUEST, '2FA is not enabled')
    }

    // Generate email OTP
    const otpCode = await userModel.generateEmailOTP(userId)

    // Send email
    const customSubject = 'Your 2FA verification code'
    const htmlContent = `
      <h1>2FA Verification Code</h1>
      <p>Your OTP is: <strong>${otpCode}</strong></p>
      <p>This code will expire in 5 minutes.</p>
      <p>If you did not request this code, please disregard this email.</p>
    `

    await BrevoProvider.sendEmail(user.email, customSubject, htmlContent)

    return { message: 'A verification code has been sent to your email' }
  } catch (error) {
    throw new Error(error)
  }
}

const verify2FAEmail = async (userId, otpCode, device_id) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!user.isRequire2fa) {
      throw new ApiError(StatusCodes.BAD_REQUEST, '2FA is not enabled')
    }

    // Verify OTP email
    await userModel.verifyEmailOTP(userId, otpCode)

    // Cập nhật user
    let updatedUser = pickUser(user)
    updatedUser = { ...updatedUser, is_2fa_verified: true }

    // Cập nhật session
    await userModel.updateSession(userId, device_id, { is_2fa_verified: true })
    return updatedUser
  } catch (error) {
    if (error.message === 'Too many attempts') {
      throw new ApiError(StatusCodes.TOO_MANY_REQUESTS, 'Too many attempts. Please request a new OTP.')
    }
    if (error.message === 'OTP expired') {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'OTP has expired. Please request a new OTP.')
    }
    if (error.message === 'Invalid OTP') {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid OTP. Please request a new OTP.')
    }
    if (error.message === 'No OTP found') {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'No OTP found. Please request a new OTP.')
    }
    throw new Error(error)
  }
}

export const userService = {
  createNew, verifyAccount, login,
  logout, refreshToken, update, forgotPassword,
  get2FAQRCode, setup2FA, verify2FA, disable2FA, getUsers,
  send2FAEmailOTP, verify2FAEmail
}
