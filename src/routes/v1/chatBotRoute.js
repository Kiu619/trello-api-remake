// src/routes/v1/ai.route.js
import express from 'express'
import { chatBotController } from '~/controllers/chatBotController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

Router.route('/chat')
  .post(authMiddleware.isAuthorized, chatBotController.chat)

Router.route('/history/:boardId')
  .get(authMiddleware.isAuthorized, chatBotController.getChatHistory)

export const chatBotRoute = Router
