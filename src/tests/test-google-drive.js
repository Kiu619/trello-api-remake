// const { google } = require('googleapis')
// const dotenv = require('dotenv')
// const path = require('path')

// // Chỉ định đường dẫn chính xác đến file .env ở thư mục gốc
// dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// console.log('Current directory:', __dirname)
// console.log('Looking for .env at:', path.resolve(__dirname, '../../.env'))
// console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID)
// console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI)

// const oauth2Client = new google.auth.OAuth2(
//   process.env.GOOGLE_CLIENT_ID,
//   process.env.GOOGLE_CLIENT_SECRET,
//   process.env.GOOGLE_REDIRECT_URI
// )

// // Test tạo auth URL
// const authUrl = oauth2Client.generateAuthUrl({
//   access_type: 'offline',
//   scope: ['https://www.googleapis.com/auth/drive.readonly']
// })

// console.log('Auth URL:', authUrl)
// console.log('Nếu thấy URL này thì cấu hình đã đúng!')