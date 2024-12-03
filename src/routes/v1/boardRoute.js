import express from 'express'
import { boardValidation } from '~/validations/boardValidation'
import { boardController } from '~/controllers/boardController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

Router.route('/')
  .get(authMiddleware.isAuthorized, boardController.getBoards)
  .post(authMiddleware.isAuthorized, boardValidation.createNew, boardController.createNew)


Router.route('/:id')
  .get(authMiddleware.isAuthorized, boardController.getDetails)
  .put(authMiddleware.isAuthorized, boardValidation.update, boardController.update)
  .delete(authMiddleware.isAuthorized, boardController.deleteBoard)

Router.route('/supports/moving_card')
  .put(authMiddleware.isAuthorized, boardValidation.moveCardToDifferentColumn, boardController.moveCardToDifferentColumn)

Router.route('/:id/addBoardAdmin')
  .put(authMiddleware.isAuthorized, boardValidation.addBoardAdmin, boardController.addBoardAdmin)

Router.route('/:id/openClosed')
  .put(authMiddleware.isAuthorized, boardController.openClosedBoard)

Router.route('/:id/leaveBoard')
  .put(authMiddleware.isAuthorized, boardController.leaveBoard)

Router.route('/copy/:id')
  .post(authMiddleware.isAuthorized, boardController.copyBoard)

  Router.route('/:id/removeBoardAdmin')
  .put(authMiddleware.isAuthorized, boardValidation.addBoardAdmin, boardController.removeBoardAdmin)

  Router.route('/:id/removeMembers')
  .put(authMiddleware.isAuthorized, boardController.removeMembers)

export const boardRoutes = Router
