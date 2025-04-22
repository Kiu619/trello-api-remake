import multer from 'multer'
import { LIMIT_COMMON_FILE_SIZE, ALLOW_COMMON_IMG_FILE_TYPES, ALLOW_ATTACHMENT_FILE_TYPES } from '~/utils/validators'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'

const customFileFilter = (req, file, callback) => {
  if (file.fieldname === 'cardCover') {
    if (!ALLOW_COMMON_IMG_FILE_TYPES.includes(file.mimetype)) {
      return callback(new ApiError(StatusCodes.UNSUPPORTED_MEDIA_TYPE, 'File type is not supported. Only accept jpg, jpeg, png'), null)
    }
  } else if (file.fieldname === 'attachmentFile') {
    if (!ALLOW_ATTACHMENT_FILE_TYPES.includes(file.mimetype)) {
      return callback(new ApiError(StatusCodes.UNSUPPORTED_MEDIA_TYPE, 'File type is not supported. Only accept pdf, docx, etc.'), null)
    }
  } else if (file.fieldname === 'avatar') {
    if (!ALLOW_COMMON_IMG_FILE_TYPES.includes(file.mimetype)) {
      return callback(new ApiError(StatusCodes.UNSUPPORTED_MEDIA_TYPE, 'File type is not supported. Only accept jpg, jpeg, png'), null)
    }
  }
  else {
    return callback(new ApiError(StatusCodes.BAD_REQUEST, 'Unknown field name'), null)
  }
  return callback(null, true)
}

const upload = multer({
  limits: { fileSize: LIMIT_COMMON_FILE_SIZE },
  fileFilter: customFileFilter
})

export const multerUploadMiddleware = { upload }