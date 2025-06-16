import express from 'express'
import { userValidation } from '~/validations/userValidation'
import { userController } from '~/controllers/userController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'

const Router = express.Router()

Router.route('/')
  .get(authMiddleware.isAuthorized, userController.getUsers)

Router.route('/register')
  .post(userValidation.createNew, userController.createNew)

Router.route('/login')
  .post(userValidation.login, userController.login)

Router.route('/verify')
  .put(userValidation.verifyAccount, userController.verifyAccount)

Router.route('/logout')
  .delete(authMiddleware.isAuthorized, userController.logout)

Router.route('/forgot_password')
  .post(authMiddleware.isAuthorized, userValidation.forgotPassword, userController.forgotPassword)

Router.route('/refresh_token')
  .get(userController.refreshToken)

Router.route('/update')
  .put(
    authMiddleware.isAuthorized,
    // vì FE gửi lên là reqData.append('avatar', file) nên phải sử dụng .single('avatar')
    multerUploadMiddleware.upload.single('avatar'), // sau upload có những method khác như: .array, .fields
    userValidation.update,
    userController.update
  )

Router.route('/get_2fa_qr_code')
  .get(authMiddleware.isAuthorized, userController.get2FAQRCode)

Router.route('/setup_2fa')
  .post(authMiddleware.isAuthorized, userController.setup2FA)

Router.route('/verify_2fa')
  .put(authMiddleware.isAuthorized, userController.verify2FA)

Router.route('/disable_2fa')
  .put(authMiddleware.isAuthorized, userController.disable2FA)

Router.route('/send_2fa_email_otp')
  .post(authMiddleware.isAuthorized, userController.send2FAEmailOTP)

Router.route('/verify_2fa_email')
  .put(authMiddleware.isAuthorized, userValidation.verify2FAEmail, userController.verify2FAEmail)

export const userRoutes = Router
