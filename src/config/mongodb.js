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

export const CONNECT_DB = async () => {
  // Gọi kết nối tới MongoDB Atlas với ỦI đã khai báo trong thân của mongoClientInstance
  await mongoClientInstance.connect()

  //Kết nói thành công thì lấy ra Database theo tên và Gán giá trị của DB đã kết nối tới trelloDBInstance
  trelloDBInstance = mongoClientInstance.db(env.DATABASE_NAME)
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