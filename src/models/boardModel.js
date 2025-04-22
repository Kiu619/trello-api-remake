import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validators'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { BOARD_TYPES } from '~/utils/constants'
import { columnModel } from './columnModel'
import { cardModel } from './cardModel'
import { userModel } from './userModel'

// Define Collection (name & schema)
export const BOARD_COLLECTION_NAME = 'boards'
const BOARD_COLLECTION_SCHEMA = Joi.object({
  title: Joi.string().required().min(3).max(50).trim().strict(),
  slug: Joi.string().required().min(3).trim().strict(),
  description: Joi.string().required().min(3).max(256).trim().strict(),
  type: Joi.string().valid(...Object.values(BOARD_TYPES)).required(),
  // Lưu ý các item trong mảng columnOrderIds là ObjectId nên cần thêm pattern cho chuẩn nhé
  columnOrderIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),

  creatorId: Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE),

  ownerIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),

  memberIds: Joi.array().items(
    Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
  ).default([]),

  isClosed: Joi.boolean().default(false),

  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

// Các trường không được phép update
const INVALID_UPDATE_FIELDS = ['_id', 'createdAt']

const validateBeforeCreate = async (data) => {
  return await BOARD_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (userId, data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const newBoardToInsert = {
      ...validData,
      creatorId: new ObjectId(userId),
      ownerIds: [new ObjectId(userId)]
    }
    const newBoard = await GET_DB().collection(BOARD_COLLECTION_NAME).insertOne(newBoardToInsert)
    return newBoard
  } catch (error) {
    throw new Error(error)
  }
}

// Query tổng hợp (aggregate) để lấy thông tin chi tiết của board (bao gồm các column, card, user, ...)
const getDetails = async (userId, boardId) => {
  try {

    const queryConditions = [
      { _id: new ObjectId(boardId), _destroy: false },
      // {
      //   $or: [
      //     { ownerIds: { $all: [new ObjectId(userId)] } },
      //     { memberIds: { $all: [new ObjectId(userId)] } }
      //   ]
      // }
    ]

    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).aggregate([
      { $match: { $and: queryConditions } },
      {
        $lookup: {
          from: columnModel.COLUMN_COLLECTION_NAME,
          localField: '_id',
          foreignField: 'boardId',
          as: 'columns'
        }
      },
      {
        $lookup: {
          from: cardModel.CARD_COLLECTION_NAME,
          localField: '_id',
          foreignField: 'boardId',
          as: 'cards'
        }
      },
      {
        $lookup: {
          from: userModel.USER_COLLECTION_NAME,
          localField: 'ownerIds',
          foreignField: '_id',
          as: 'owners',
          // pipeline trong lookup là để xử lý một hoặc nhiều luồng cần thiết
          // $project để chỉ định vài field không muốn lấy về bằng cách gán nó giá trị 0
          pipeline: [{ $project: { 'password': 0, 'verifyToken': 0 } }]
        }
      },
      {
        $lookup: {
          from: userModel.USER_COLLECTION_NAME,
          localField: 'memberIds',
          foreignField: '_id',
          as: 'members',
          pipeline: [{ $project: { 'password': 0, 'verifyToken': 0 } }]
        }
      }
    ]).toArray()
    return result[0] || null

  } catch (error) {
    throw new Error(error)
  }
}

// Cập nhật mảng columnOrderIds của board
const pushColumnOrderIds = async (column) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(column.boardId) },
      { $push: { columnOrderIds: column._id } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

// Xóa columnId trong mảng columnOrderIds của board
const pullColumnOrderIds = async (column) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(column.boardId) },
      { $pull: { columnOrderIds: column._id } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (boardId, updateData) => {
  try {
    // Loại bỏ các trường không được phép update
    Object.keys(updateData).forEach(key => {
      if (INVALID_UPDATE_FIELDS.includes(key)) {
        delete updateData[key]
      }
    })

    if (updateData.columnOrderIds) {
      updateData.columnOrderIds = updateData.columnOrderIds.map(_id => (new ObjectId(_id)))
    }

    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(boardId) },
      { $set: updateData },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const deleteBoardById = async (boardId) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).deleteOne({ _id: new ObjectId(boardId) })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const pushMemberIds = async (boardId, userId) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(boardId) },
      { $push: { memberIds: new ObjectId(userId) } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const pullMemberIds = async (boardId, userId) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(boardId) },
      { $pull: { memberIds: new ObjectId(userId) } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const pushOwnerIds = async (boardId, userId) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(boardId) },
      { $push: { ownerIds: new ObjectId(userId) } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const pullOwnerIds = async (boardId, userId) => {
  try {
    const result = await GET_DB().collection(BOARD_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(boardId) },
      { $pull: { ownerIds: new ObjectId(userId) } },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (id) => {
  try {
    const board = await GET_DB().collection(BOARD_COLLECTION_NAME).findOne({ _id: new ObjectId(id) })
    return board
  } catch (error) {
    throw new Error(error)
  }
}

// const getBoards = async (userId, page, itemsPerPage, queryFilter) => {
//   try {
//     const queryConditions = [
//       { _destroy: false },
//       {
//         $or: [
//           { ownerIds: { $all: [new ObjectId(userId)] } },
//           { memberIds: { $all: [new ObjectId(userId)] } }
//         ]
//       },
//     ]
//     // sử lý queryFilter cho từng trường hợp cần tìm kiếm (ví dụ search theo title)
//     if (queryFilter) {
//       Object.keys(queryFilter).forEach(key => {
//         //const searchPath = `?${createSearchParams({ 'q[title]': searchValue })}` (phía FE)
//         // queryFilter[key] ví dụ queryFilter[title] nếu phía FE đẩy lên q[title] 

//         //không phân biệt chữ hoa chữ thường
//         queryConditions.push({ [key]: { $regex: new RegExp(queryFilter[key], 'i') }})
//         //phân biệt chữ hoa chữ thường
//         // queryConditions.push({ [key]: { $regex: new RegExp(queryFilter[key]) } })
//       })
//     }


//     const query = await GET_DB().collection(BOARD_COLLECTION_NAME).aggregate(
//       [
//         { $match: { $and: queryConditions } },
//         { $sort: { title: 1 } },
//         {
//           $facet: {
//             // Luồng 01: Query Boards
//             'queryBoards': [
//               { $skip: (page - 1) * itemsPerPage },
//               { $limit: itemsPerPage }
//             ],
//             // Luồng 02: Query đến tổng tất cả số lượng bản ghi boards trong BD và trả về
//             'queryTotalBoards': [
//               { $count: 'totalBoards' }
//             ]
//           }
//         }
//       ],
//       { collation: { locale: 'en' } }
//     ).toArray()

//     const res = await query[0]

//     return {
//       boards: res.queryBoards || [],
//       totalBoards: (res.queryTotalBoards.length > 0) ? res.queryTotalBoards[0].totalBoards : 0
//     }
//   } catch (error) {
//     throw new Error(error)
//   }
// }


const getBoards = async (userId, page, itemsPerPage, queryFilter, sortConfig) => {
  try {
    const queryConditions = [
      { _destroy: false },
      {
        $or: [
          { ownerIds: { $all: [new ObjectId(userId)] } },
          { memberIds: { $all: [new ObjectId(userId)] } }
        ]
      },
    ]

    if (queryFilter) {
      Object.keys(queryFilter).forEach(key => {
        queryConditions.push({ [key]: { $regex: new RegExp(queryFilter[key], 'i') }})
      })
    }

    // Tạo sort configuration cho MongoDB
    const sortObj = {
      [sortConfig.field]: sortConfig.order === 'asc' ? 1 : -1
    }

    const query = await GET_DB().collection(BOARD_COLLECTION_NAME).aggregate(
      [
        { $match: { $and: queryConditions } },
        { $sort: sortObj },
        {
          $facet: {
            'queryBoards': [
              { $skip: (page - 1) * itemsPerPage },
              { $limit: itemsPerPage }
            ],
            'queryTotalBoards': [
              { $count: 'totalBoards' }
            ]
          }
        }
      ],
      { collation: { locale: 'en' } }
    ).toArray()

    const res = await query[0]
    return {
      boards: res.queryBoards || [],
      totalBoards: (res.queryTotalBoards.length > 0) ? res.queryTotalBoards[0].totalBoards : 0
    }
  } catch (error) {
    throw new Error(error)
  }
}

export const boardModel = {
  BOARD_COLLECTION_NAME,
  BOARD_COLLECTION_SCHEMA,
  createNew, findOneById, getDetails,
  pushColumnOrderIds, deleteBoardById,
  update, pullColumnOrderIds,
  getBoards, pushMemberIds, pullMemberIds,
  pushOwnerIds, pullOwnerIds
}