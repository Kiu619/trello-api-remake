import { NOTIFICATION_COLLECTION_NAME } from '~/models/notificationModel'
import { env } from './environment'
import { MongoClient, ServerApiVersion } from 'mongodb'

let trelloDBInstance = null

const mongoClientInstance = new MongoClient(env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
})

const createNotificationTTLIndex = async (db) => {
  try {
    await db.collection(NOTIFICATION_COLLECTION_NAME).createIndex(
      { 'createdAt': 1 },
      {
        expireAfterSeconds: 14 * 24 * 60 * 60, // 14 days
        name: 'TTL_notifications_14_days'
      }
    )
  } catch (error) {
    // Không throw error ở đây để không ảnh hưởng đến việc kết nối DB
  }
}

export const CONNECT_DB = async () => {
  // Gọi kết nối tới MongoDB Atlas với ỦI đã khai báo trong thân của mongoClientInstance
  await mongoClientInstance.connect()

  //Kết nói thành công thì lấy ra Database theo tên và Gán giá trị của DB đã kết nối tới trelloDBInstance
  trelloDBInstance = mongoClientInstance.db(env.DATABASE_NAME)

  // Tạo TTL index cho notifications sau khi kết nối thành công
  await createNotificationTTLIndex(trelloDBInstance)
}

//Hàm này có nhiệm vụ export ra TrelloDBInstance đã kết nối thành công tới MongoDB Atlas để sử dụng trong các file khác
export const GET_DB = () => {
  if (!trelloDBInstance) throw new Error('Must connect to Database first')
  return trelloDBInstance
}


// Dong ket noi
export const CLOSE_DB = async () => {
  await mongoClientInstance.close()
}