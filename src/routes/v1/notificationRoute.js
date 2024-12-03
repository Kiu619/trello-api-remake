import express from 'express'
import { notificationController } from '~/controllers/notificationController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

Router.route('/')
  .get(authMiddleware.isAuthorized, notificationController.getNotifications)
  .post(authMiddleware.isAuthorized, notificationController.createNew)


Router.route('/requestToJoinBoardStatus/:boardId')
  .get(authMiddleware.isAuthorized, notificationController.requestToJoinBoardStatus)

Router.route('/markAsReadAll')
  .put(authMiddleware.isAuthorized, notificationController.markAsReadAll)

Router.route('/updateBoardInvitation/:id')
  .put(authMiddleware.isAuthorized, notificationController.updateBoardInvitation)

Router.route('/updateBoardRequest/:id')
  .put(authMiddleware.isAuthorized, notificationController.updateBoardRequest)

export const notificationRoutes = Router
