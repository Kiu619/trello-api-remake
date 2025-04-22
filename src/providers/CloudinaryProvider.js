import cloudinary from 'cloudinary'
import { env } from '~/config/environment'
import streamifier from 'streamifier'

const cloudinaryV2 = cloudinary.v2
cloudinaryV2.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
})

const streamUpload = (fileBuffer, folderName) => {
  return new Promise((resolve, reject) => {
    // Tạo một stream upload lên Cloudinary
    const stream = cloudinaryV2.uploader.upload_stream({ folder: folderName }, (error, result) => {
      if (error) {
        console.log('streamUpload', error)
        reject(error)
      }
      resolve(result)
    })
    // Thực hiện upload cái luồng trên bằng lib streamifier
    streamifier.createReadStream(fileBuffer).pipe(stream)
  })
}

const streamUploadAttachment = (fileBuffer, folderName, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    // Tạo một stream upload lên Cloudinary
    const stream = cloudinaryV2.uploader.upload_stream({ folder: folderName, resource_type: resourceType }, (error, result) => {
      if (error) {
        console.log('streamUpload', error)
        reject(error)
      }
      resolve(result)
    })
    // Thực hiện upload cái luồng trên bằng lib streamifier
    streamifier.createReadStream(fileBuffer).pipe(stream)
  })
}

export const CloudinaryProvider = {
  streamUpload, streamUploadAttachment
}
