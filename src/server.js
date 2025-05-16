// eslint-disable-no-console
import exitHook from 'async-exit-hook'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from '~/config/environment'
import { CLOSE_DB, CONNECT_DB } from '~/config/mongodb'
import { errorHandlingMiddleware } from '~/middlewares/errorHandlingMiddleware'
import { APIs_V1 } from '~/routes/v1'
import { corsOptions } from './config/cors'

import http from 'http'
import socketIo from 'socket.io'
import { activeCardUpdatedSocket } from './sockets/activeCardUpdatedSocket'
import { batchSocket } from './sockets/batchSocket'
import { copyCardInSameBoardSocket } from './sockets/copyCardInSameBoardSocket'
import { fetchNotificationsSocket } from './sockets/fetchNotificationsSocket'
import { setupSocketIo } from './services/chatBotService'


const START_SERVER = () => {
  const app = express()

  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.use(cookieParser())

  app.use(helmet())

  // Enable CORS
  app.use(cors(corsOptions))
  // Enable req.body json data
  app.use(express.json())

  app.use('/v1', APIs_V1)

  // Middleware to handle error
  app.use(errorHandlingMiddleware)

  // Create server (socket.io)
  const server = http.createServer(app)
  // Khởi tạo biến io với cors
  const io = socketIo(server, {
    cors: { corsOptions }
  })

  // Truyền instance socket.io vào chatBotService
  setupSocketIo(io)

  io.on('connection', (socket) => {
    fetchNotificationsSocket(socket)
    batchSocket(socket)
    activeCardUpdatedSocket(socket)
    copyCardInSameBoardSocket(socket)
  })

  if (env.BUILD_MODE === 'production') {
    server.listen(process.env.PORT || 8210, () => {
      // eslint-disable-next-line no-console
      console.log(`${env.AUTHOR} Server running at port ${process.env.PORT}`)
    })
  }
  else {
    server.listen(env.LOCAL_DEV_APP_PORT, env.LOCAL_DEV_APP_HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`${env.AUTHOR} Server running at http://${env.LOCAL_DEV_APP_HOST}:${env.LOCAL_DEV_APP_PORT}/`)
    })
  }

  //
  exitHook(() => {
    CLOSE_DB()
  })
}

CONNECT_DB()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB successfully')
    // Set up the TTL index after connecting to the database
  })
  .then(() => START_SERVER())
  .catch((error) => {
    process.exit(0)
  })


// IIFE (Immediately Invoked Function Expression) to start the server
// (async () => {
//   try {
//     await CONNECT_DB()
//     console.log('Connected to MongoDB successfully')
//     START_SERVER()
//   }
//   catch (error) {
//     console.error(error)
//     process.exit(0)
//   }
// })