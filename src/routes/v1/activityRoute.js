import express from 'express'
import { activityController } from '~/controllers/activityController'

const Router = express.Router()

Router.route('/board/:boardId')
  .get(activityController.getActivitiesByBoardId)

export const activityRoutes = Router
