import { StatusCodes } from 'http-status-codes'
import ms from 'ms'
import { userService } from '~/services/userService'
import ApiError from '~/utils/ApiError'

const createNew = async (req, res, next) => {
  try {
    const createNewUser = await userService.createNew(req.body)
    res.status(StatusCodes.CREATED).json(createNewUser)
  } catch (error) {
    next(error)
  }
}

const login = async (req, res, next) => {
  try {
    const device_id = req.headers['user-agent']
    const loginData = await userService.login(req.body, device_id)

    res.cookie('accessToken', loginData.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })

    res.cookie('refreshToken', loginData.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('30 days')
    })
    res.status(StatusCodes.OK).json(loginData)
  } catch (error) {
    next(error)
  }
}

const verifyAccount = async (req, res, next) => {
  try {
    const verifyData = await userService.verifyAccount(req.body)
    res.status(StatusCodes.OK).json(verifyData)
  } catch (error) {
    next(error)
  }
}

const logout = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const device_id = req.headers['user-agent']
    await userService.logout(userId, device_id)
    res.clearCookie('accessToken')
    res.clearCookie('refreshToken')
    res.status(StatusCodes.OK).json({ loggedOut: true })
  } catch (error) {
    next(error)
  }
}

const refreshToken = async (req, res, next) => {
  try {
    const result = await userService.refreshToken(req.cookies?.refreshToken)

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })

    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(new ApiError(StatusCodes.FORBIDDEN, 'Please login again'))
  }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const userAvatarFile = req.file
    const updatedUser = await userService.update(userId, req.body, userAvatarFile)
    res.status(StatusCodes.OK).json(updatedUser)

  } catch (error) {
    next(error)
  }
}

const forgotPassword = async (req, res, next) => {
  try {
    const result = await userService.forgotPassword(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const get2FAQRCode = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const result = await userService.get2FAQRCode(userId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const setup2FA = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const token = req.body.otpToken
    const device_id = req.headers['user-agent']
    const result = await userService.setup2FA(userId, token, device_id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const verify2FA = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const token = req.body.otpToken
    const device_id = req.headers['user-agent']
    const result = await userService.verify2FA(userId, token, device_id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const disable2FA = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const token = req.body.otpToken
    const result = await userService.disable2FA(userId, token)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const getUsers = async (req, res, next) => {
  try {
    const { q } = req.query
    const queryFilter = q
    const users = await userService.getUsers(queryFilter)
    res.status(StatusCodes.OK).json(users)
  } catch (error) {
    next(error)
  }
}

export const userController = {
  createNew, login, verifyAccount,
  logout, refreshToken, update, forgotPassword,
  get2FAQRCode, setup2FA, verify2FA, disable2FA,
  getUsers
}
