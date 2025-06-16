/* eslint-disable no-console */
import cron from 'node-cron'
import moment from 'moment-timezone'
import { notificationService } from '~/services/notificationService'

// Chạy mỗi giờ theo timezone Việt Nam
const startDueDateChecker = (testMode = false) => {
  // const cronPattern = testMode ? '* * * * *' : '0 * * * *' // mỗi phút vs mỗi giờ
  const cronPattern = testMode ? '* * * * *' : '* * * * *'
  cron.schedule(cronPattern, async () => {
    const timestampVN = moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY HH:mm:ss')
    console.log(`🔍 [${timestampVN} VN] Checking due dates...`)

    try {
      await notificationService.checkAllDueDates()
      console.log(`✅ [${timestampVN} VN] Due date check completed`)
    } catch (error) {
      console.error(`❌ [${timestampVN} VN] Error in due date checker:`, error)
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh' // Quan trọng: Chạy theo timezone VN
  })

  const interval = testMode ? 'every minute' : 'every hour'
  console.log(`📅 Due date checker started - running ${interval} (VN timezone)`)
}

export { startDueDateChecker }