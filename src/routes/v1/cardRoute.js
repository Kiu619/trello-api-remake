import express from 'express'
import { cardValidation } from '~/validations/cardValidation'
import { cardController } from '~/controllers/cardController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'

const Router = express.Router()

Router.route('/')
  .post(authMiddleware.isAuthorized, cardValidation.createNew, cardController.createNew)

Router.route('/:id')
  .get(authMiddleware.isAuthorized, cardController.getDetails)
  // .put(authMiddleware.isAuthorized, multerUploadMiddleware.upload.single('cardCover'), cardValidation.update, cardController.update)
  .put(
    authMiddleware.isAuthorized,
    multerUploadMiddleware.upload.fields([
      { name: 'cardCover', maxCount: 1 },
      { name: 'attachmentFile', maxCount: 1 }
    ]),
    cardValidation.update,
    cardController.update
  )

  .delete(authMiddleware.isAuthorized, cardValidation.deleteCard, cardController.deleteCard)

Router.route('/move_card_to_different_board/:id')
  .put(authMiddleware.isAuthorized, cardValidation.moveCardToDifferentBoardAndCopy, cardController.moveCardToDifferentBoard)

Router.route('/copy_card/:id')
  .post(authMiddleware.isAuthorized, cardValidation.moveCardToDifferentBoardAndCopy, cardController.copyCard)

export const cardRoutes = Router
