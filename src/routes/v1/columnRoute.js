import express from 'express'
import { columnValidation } from '~/validations/columnValidation'
import { columnController } from '~/controllers/columnController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

Router.route('/')
  .post(authMiddleware.isAuthorized, columnValidation.createNew, columnController.createNew)

Router.route('/:id')
  .put(authMiddleware.isAuthorized, columnValidation.update, columnController.update)
  .delete(authMiddleware.isAuthorized, columnValidation.deleteColumn, columnController.deleteColumn)

Router.route('/move_column_to_different_board/:id')
  .put(authMiddleware.isAuthorized, columnValidation.moveColumnToDifferentBoardAndCopy, columnController.moveColumnToDifferentBoard)

Router.route('/copy_column/:id')
  .post(authMiddleware.isAuthorized, columnValidation.moveColumnToDifferentBoardAndCopy, columnController.copyColumn)

Router.route('/move_all_cards_to_another_column/:id')
  .put(authMiddleware.isAuthorized, columnValidation.moveAllCardsToAnotherColumn, columnController.moveAllCardsToAnotherColumn)
export const columnRoutes = Router
