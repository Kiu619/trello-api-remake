import cron from 'node-cron'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { notificationModel } from './notificationModel'
import { boardModel } from './boardModel'
import { userModel } from './userModel'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { io } from '~/server'

const FLAG_COLLECTION_NAME = 'flag_due_dates'
const CARD_COLLECTION_NAME = 'cards'

// Task 1: Check daily if today is the due date and create flags
const checkDueDatesDaily = async () => {
  const db = GET_DB()
  const currentDate = new Date()
  const localDate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0]

  const dueTodayCards = await db.collection(CARD_COLLECTION_NAME).find({
    'dueDate.dueDate': { $eq: localDate },
    'dueDate.isComplete': false,
    isClosed: false
  }).toArray()

  for (const card of dueTodayCards) {
    await db.collection(FLAG_COLLECTION_NAME).insertOne({
      cardId: card._id,
      dueDate: card.dueDate.dueDate,
      dueDateTime: card.dueDate.dueDateTime,
      isOverdueNotified: false
    })
  }
}

// Task 2: Check every minute if the due date is today and compare the time
const checkDueDatesEveryMinute = async () => {
  const db = GET_DB()
  const currentDate = new Date()
  const localDate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
  const currentTime = currentDate.toTimeString().split(' ')[0].slice(0, 5) // Get current time in HH:MM format

  const flaggedCards = await db.collection(FLAG_COLLECTION_NAME).find({
    dueDate: { $eq: localDate }
  }).toArray()

  if (flaggedCards.length === 0) return
  for (const card of flaggedCards) {
    if (currentTime >= card.dueDateTime && !card.isOverdueNotified) {
      // Fetch memberIds from the cards collection using cardId
      const cardDetails = await db.collection(CARD_COLLECTION_NAME).findOne({
        _id: card.cardId
      })

      const boardDetails = await boardModel.findOneById(cardDetails.boardId.toString())

      if (cardDetails && cardDetails.memberIds) {
        for (const memberId of cardDetails.memberIds) {
          const notificationData = {
            userId: memberId.toString(),
            type: 'overdueDueDateInCard',
            details: {
              boardId: cardDetails.boardId.toString(),
              boardTitle: boardDetails.title,
              cardId: card.cardId.toString(),
              cardTitle: cardDetails.title
            }
          }

          const res = await notificationModel.createNew(notificationData)
          if (res) {
            const member = await userModel.findOneById(memberId.toString())
            // Send email notification
            const customSubject = 'Due date is overdue'
            const htmlContent = `
              <h2>Due date is overdue</h2>
              <p>Due date for card: ${cardDetails.title} in board: ${boardDetails.title} is overdue</p>
              <p>Click <a href="${WEBSITE_DOMAIN}/board/${cardDetails.boardId}/card/${cardDetails._id}">here</a> to view</p>
            `
            await BrevoProvider.sendEmail(member.email, customSubject, htmlContent)

            // Send in-app notification
            io.emit('BE_FETCH_NOTI', { userId: memberId.toString() })
          }
        }

        await db.collection(FLAG_COLLECTION_NAME).updateOne(
          { _id: card._id },
          { $set: { isOverdueNotified: true } }
        )
      }
    }
  }

  // Cleanup expired flags
  await db.collection(FLAG_COLLECTION_NAME).deleteMany({
    isOverdueNotified: true
  })
} 

// Function to check if the new due date is today
const checkNewDueDate = async (cardId, dueDate) => {
  const db = GET_DB()
  // const currentDate = new Date().toISOString().split('T')[0]

  // Get the current date in local timezone
  const currentDate = new Date()
  const localDate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
  const dueDateOnly = new Date(dueDate?.dueDate).toISOString().split('T')[0]

  // Get the current time
  const currentTime = currentDate.toTimeString().split(' ')[0].slice(0, 5)

  if (dueDateOnly === '1970-01-01') return
  if (currentTime >= dueDate.dueDateTime) return
  if (dueDate.dueDateTime === null) return

  if (dueDateOnly === localDate) {
    await db.collection(FLAG_COLLECTION_NAME).insertOne({
      cardId: new ObjectId(cardId),
      dueDate: dueDateOnly,
      dueDateTime: dueDate.dueDateTime,
      isOverdueNotified: false
    })
    await checkDueDatesEveryMinute()
  }
}


// Schedule Task 1 to run daily at midnight
cron.schedule('0 0 * * *', checkDueDatesDaily)

// Schedule Task 2 to run every minute
cron.schedule('* * * * *', checkDueDatesEveryMinute)

export const flagDueDateModel = { checkDueDatesEveryMinute, checkDueDatesDaily, checkNewDueDate }
