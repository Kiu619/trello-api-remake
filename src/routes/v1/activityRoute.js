import express from 'express'
import { activityController } from '~/controllers/activityController'

const Router = express.Router()

Router.route('/board/:boardId')
  .get(activityController.getActivitiesByBoardId)

Router.route('/user')
  .get(activityController.getActivitiesByUserId)

Router.route('/card/:cardId')
  .get(activityController.getActivitiesByCardId)

Router.route('/user/card')
  .get(activityController.getUserActivitiesInCard)

export const activityRoutes = Router
