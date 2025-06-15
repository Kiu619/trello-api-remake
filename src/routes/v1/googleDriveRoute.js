import express from 'express'
import { googleDriveController } from '~/controllers/googleDriveController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()


Router.route('/auth')
  .get(authMiddleware.isAuthorized, googleDriveController.getAuthUrl)

Router.route('/callback')
  .get(authMiddleware.isAuthorized, googleDriveController.handleCallback)

Router.route('/status')
  .get(authMiddleware.isAuthorized, googleDriveController.getConnectionStatus)

Router.route('/disconnect')
  .post(authMiddleware.isAuthorized, googleDriveController.disconnect)

Router.route('/files')
  .get(authMiddleware.isAuthorized, googleDriveController.listFiles)

Router.route('/attach/:cardId')
  .post(authMiddleware.isAuthorized, googleDriveController.attachFileToCard)

export const googleDriveRoute = Router
