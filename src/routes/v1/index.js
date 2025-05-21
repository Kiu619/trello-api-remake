import express from 'express'
import { boardRoutes } from './boardRoute'
import { columnRoutes } from './columnRoute'
import { cardRoutes } from './cardRoute'
import { userRoutes } from './userRoute'
import { invitationRoute } from './invitationRoute'
import { notificationRoutes } from './notificationRoute'
import { templateRoutes } from './templateRoute'
import { chatBotRoute } from './chatBotRoute'
import { activityRoutes } from './activityRoute'

const Router = express.Router()

Router.get('/status', (req, res) => {
  res.status(200).json({ message: 'OK' })
})
// Board API
Router.use('/board', boardRoutes)
// Column API
Router.use('/column', columnRoutes)
// Card API
Router.use('/card', cardRoutes)
// Template API
Router.use('/template', templateRoutes)

// User API
Router.use('/user', userRoutes)
// Invitation API
Router.use('/invitation', invitationRoute)
// Notification API
Router.use('/notification', notificationRoutes)

// AI API
Router.use('/chatbot', chatBotRoute)

// Activity API
Router.use('/activity', activityRoutes)

export const APIs_V1 = Router
