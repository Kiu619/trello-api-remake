import express from 'express'
import { templateController } from '~/controllers/templateController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

Router.route('/')
  .get(authMiddleware.isAuthorized, templateController.getTemplates)


export const templateRoutes = Router