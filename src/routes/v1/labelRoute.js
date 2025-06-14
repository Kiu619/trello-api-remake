import express from 'express'
import { labelController } from '~/controllers/labelController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

Router.route('/')
  .post(authMiddleware.isAuthorized, labelController.createNew)


Router.route('/:id')
  .put(authMiddleware.isAuthorized, labelController.update)
  .delete(authMiddleware.isAuthorized, labelController.deleteLabel)
  .get(authMiddleware.isAuthorized, labelController.getLabelsByBoardId)

Router.route('/card/:id')
  .get(authMiddleware.isAuthorized, labelController.getLabelsByCardId)

export const labelRoute = Router
