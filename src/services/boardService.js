/* eslint-disable no-useless-catch */
import { pickUser, slugify } from '~/utils/formatter'
import { boardModel } from '~/models/boardModel'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { cloneDeep } from 'lodash'
import { COLUMN_COLLECTION_NAME, columnModel } from '~/models/columnModel'
import { CARD_COLLECTION_NAME, cardModel } from '~/models/cardModel'
import { BOARD_INVITATION_STATUS, DEFAULT_ITEMS_PER_PAGE, DEFAULT_PAGE, INVITATION_TYPES } from '~/utils/constants'
import { userModel } from '~/models/userModel'
import { invitationModel } from '~/models/invitationModel'
import { notificationModel } from '~/models/notificationModel'
import { Socket } from 'socket.io'
import { GET_DB } from '~/config/mongodb'
import { ObjectId } from 'mongodb'

const createNew = async (userId, reqBody) => {
  try {
    // Xử lý logic dữ liệu
    const newBoard = {
      ...reqBody,
      slug: slugify(reqBody.title)
    }

    // // Gọi tới tầng Model để lưu vào Database
    const createBoard = await boardModel.createNew(userId, newBoard)

    // // Lấy bản ghi board sau khi họi (tùy mục đích, có thể không cần)
    const getNewBoard = await boardModel.findOneById(createBoard.insertedId)

    // Làm thêm các xử lý logic khác với các Controller tùy theo dự án
    // Bắn Email, notification cho admin khi có 1 board mới được tạo


    // Trả về dữ liệu mới tạo, trong Service luôn phải có return
    return getNewBoard
    // return newBoard
  } catch (error) {
    throw new Error(error)
  }
}

const getDetails = async (userId, boardId) => {
  try {
    const board = await boardModel.getDetails(userId, boardId)
    const boardById = await boardModel.findOneById(boardId)
    if (!board && !boardById) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }
    // Nếu là chủ sở hữu hoặc thành viên của board thì mới cho xem chi tiết
    if (board) {
      // // biến đổi  "_destroy": false,
      //     "columns": [
      //       {
      //           "_id": "666fe808de1d363b70bd6337",
      //           "title": "Column test",
      //           "boardId": "666fe46c90ec1a244591bd9c",
      //           "cardOrderIds": [
      //               "666fe8ebde1d363b70bd633b"
      //           ]
      //       }
      //   ],
      //   "cards": []
      // sang "columns": [...., "cards": []]
      const resBoard = cloneDeep(board)
      // resBoard.columns.forEach(column => {
      //   column.cards = []
      //   resBoard.cards.forEach(card => {
      //     if (card.columnId.toString() === column._id.toString()) {
      //       column.cards.push(card)
      //     }
      //   })
      // })

      resBoard.columns.forEach(column => {
        // vì trả về ojId nên phải chuyển sang String để có thể so sánh (hoặc có thể dùng equals của MongoDB)
        column.cards = resBoard.cards.filter(card => card.columnId.toString() === column._id.toString())
      })

      // xóa mảng cards ra khỏi board ban đầu
      delete resBoard.cards

      // console.log('resBoard', resBoard)

      if (!resBoard.ownerIds.toString().includes(userId) && !resBoard.memberIds.toString().includes(userId) && resBoard?.type === 'private') {
        resBoard.forShare = true
      }

      return resBoard
    }

    // // Nếu không phải chủ sở hữu hoặc thành viên thì chỉ trả về thông tin cơ bản
    // if (boardById && !board) {
    //   // Thêm trường forShare để xác định xem có phải là board được chia sẻ không
    //   const resBoard = {
    //     ...boardById,
    //     forShare: true
    //   }

    //   return resBoard
    // }

  } catch (error) {
    throw new Error(error)
  }
}

const update = async (boardId, reqBody) => {
  try {
    const updateData = {
      ...reqBody,
      updatedAt: Date.now()
    }
    const updatedBoard = await boardModel.update(boardId, updateData)
    return updatedBoard

  } catch (error) {
    throw new Error(error)
  }
}

const deleteBoard = async (boardId, userId) => {
  try {

    const isAdmin = await boardModel.isAdmin(userId, boardId)
    if (!isAdmin) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to delete this board')
    }
    const targetBoard = await boardModel.findOneById(boardId)
    if (!targetBoard) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }
    // xóa board
    await boardModel.deleteBoardById(boardId)
    // xóa column
    await columnModel.deleteColumnsByBoardId(boardId)
    // xóa card
    await cardModel.deleteCardsByBoardId(boardId)
    return { deleteResult: 'Board deleted succesfully' }
  } catch (error) {
    throw new Error(error)
  }
}

const moveCardToDifferentColumn = async (reqBody) => {
  try {
    /**
  * Khi di chuyển card sang Column khác:
  * B1: Cập nhật mảng cardOrderIds của Column ban đầu chứa nó (Hiểu bản chất là xóa cái _id của Card ra khỏi
  mång)
  * B2: cập nhật mảng cardOrderIds của Column tiếp theo (Hiểu bản chất là thêm _id của Card vào mảng)
  * B3: Cập nhật lại trường columnId mới của cái Card đã kéo
  * => Làm một API support riêng.
  */
    await columnModel.update(reqBody.prevColumnId, {
      cardOrderIds: reqBody.prevCardOrderIds,
      updatedAt: Date.now()
    })

    await columnModel.update(reqBody.nextColumnId, {
      cardOrderIds: reqBody.nextCardOrderIds,
      updatedAt: Date.now()
    })

    await cardModel.update(reqBody.currentCardId, {
      columnId: reqBody.nextColumnId
    })

    return { updateResult: 'Successfully' }
    // return newBoard
  } catch (error) {
    throw new Error(error)
  }
}

const getBoards = async (userId, page, itemsPerPage, queryFilter, sort) => {
  try {
    if (!page) {
      page = DEFAULT_PAGE
    }
    if (!itemsPerPage) {
      itemsPerPage = DEFAULT_ITEMS_PER_PAGE
    }

    // Xử lý sort parameter mặc định nếu không có
    if (!sort) {
      sort = 'title-asc'
    }

    // Parse sort parameter để xác định field và order
    const [sortField, sortOrder] = sort.split('-')

    // Validate sort parameters
    const validSortFields = ['title', 'createdAt']
    const validSortOrders = ['asc', 'desc']

    // Nếu parameters không hợp lệ thì dùng giá trị mặc định
    const finalSortField = validSortFields.includes(sortField) ? sortField : 'title'
    const finalSortOrder = validSortOrders.includes(sortOrder) ? sortOrder : 'asc'

    const boards = await boardModel.getBoards(
      userId,
      parseInt(page, 10),
      parseInt(itemsPerPage, 10),
      queryFilter,
      {
        field: finalSortField,
        order: finalSortOrder
      }
    )
    return boards
  } catch (error) {
    throw new Error(error)
  }
}

const inviteUser = async (reqBody, inviterId) => {
  try {
    const inviter = await userModel.findOneById(inviterId)
    const invitee = await userModel.findOneByEmail(reqBody.inviteeEmail)
    const board = await boardModel.findOneById(reqBody.boardId)

    if (!invitee) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!board) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    const newInvitationData = {
      inviterId: inviterId,
      inviteeId: invitee._id.toString(),
      type: INVITATION_TYPES.BOARD_INVITATION,
      boardInvitation: {
        boardId: board._id.toString(),
        status: BOARD_INVITATION_STATUS.PENDING
      }
    }

    const createdInvitation = await invitationModel.createNewBoardInvitation(newInvitationData)
    const getInvitation = await invitationModel.findOneById(createdInvitation.insertedId)

    const resInvitation = {
      ...getInvitation,
      board,
      inviter: pickUser(inviter),
      invitee: pickUser(invitee)
    }

    return resInvitation

  } catch (error) {
    throw new Error(error)
  }
}

const addBoardAdmin = async (boardId, userId) => {
  try {
    const isAdmin = await boardModel.isAdmin(userId, boardId)
    if (!isAdmin) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to add admin to this board')
    }

    const user = await userModel.findOneById(userId)

    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    let updatedBoard = await boardModel.pushOwnerIds(boardId, userId)
    updatedBoard = await boardModel.pullMemberIds(boardId, userId)

    return updatedBoard
  }
  catch (error) {
    throw new Error(error)
  }
}

const removeBoardAdmin = async (boardId, userId) => {
  try {
    const isAdmin = await boardModel.isAdmin(userId, boardId)
    if (!isAdmin) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to add admin to this board')
    }
    const user = await userModel.findOneById(userId)

    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    let updatedBoard = await boardModel.pullOwnerIds(boardId, userId)
    updatedBoard = await boardModel.pushMemberIds(boardId, userId)

    return updatedBoard
  }
  catch (error) {
    throw new Error(error)
  }
}

const removeMembers = async (boardId, userIds, userId) => {
  try {
    const isAdmin = await boardModel.isAdmin(userId, boardId)
    if (!isAdmin) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to add admin to this board')
    }
    // Remove each user from the board and the cards
    for (const userId of userIds) {
      // Remove user from the board
      await boardModel.pullMemberIds(boardId, userId)

      // Fetch all cards in the board
      const cards = await GET_DB().collection(CARD_COLLECTION_NAME).find({ boardId: new ObjectId(boardId) }).toArray();

      // Remove user from each card
      for (const card of cards) {
        await cardModel.removeMemberFromCard(card._id.toString(), userId);
      }
    }

    // Fetch the updated board after removing members
    const updatedBoard = await boardModel.findOneById(boardId);

    return updatedBoard;
  } catch (error) {
    throw new Error(error);
  }
}

const leaveBoard = async (boardId, userId) => {
  try {
    const user = await userModel.findOneById(userId)
    const board = await boardModel.findOneById(boardId)

    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!board) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    const updatedBoard = await boardModel.pullMemberIds(boardId, userId)

    return updatedBoard

  } catch (error) {
    throw new Error(error)
  }
}

const openCloseBoard = async (boardId, isClosed, userId) => {
  try {
    const isAdmin = await boardModel.isAdmin(userId, boardId)
    if (!isAdmin) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have permission to add admin to this board')
    }
    const updatedBoard = await boardModel.update(boardId, {
      isClosed: isClosed
    })

    await columnModel.openCloseAllColumn(boardId, isClosed)

    return updatedBoard
  } catch (error) {
    throw new Error(error)
  }
}

const copyBoard = async (userId, boardId, boardTitle) => {
  try {
    const user = await userModel.findOneById(userId)
    const board = await boardModel.findOneById(boardId)

    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!board) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board not found')
    }

    const newBoardData = {
      title: boardTitle,
      slug: slugify(boardTitle),
      description: board.description,
      type: board.type,
      creatorId: userId,
      ownerIds: [userId],
      memberIds: [],
      isClosed: false
    }

    const newBoard = await boardModel.createNew(userId, newBoardData)

    // Fetch columns based on columnOrderIds
    const columns = await GET_DB().collection(COLUMN_COLLECTION_NAME).find({
      _id: { $in: board.columnOrderIds.map(id => new ObjectId(id)) }
    }).toArray()

    // Sort columns based on columnOrderIds
    const sortedColumns = board.columnOrderIds.map(orderId =>
      columns.find(column => column._id.toString() === orderId.toString())
    )

    // Copy columns in the order specified by columnOrderIds
    let forBoardCopy = true
    await Promise.all(sortedColumns.map(async (column, index) => {
      await columnModel.copyColumn(column._id.toString(), boardId, newBoard.insertedId.toString(), index, column.title, forBoardCopy)
    }))

    return newBoard
  } catch (error) {
    throw new Error(error)
  }
}

export const boardService = {
  createNew, getDetails, update, deleteBoard, moveCardToDifferentColumn, getBoards, inviteUser, addBoardAdmin, leaveBoard, openCloseBoard, copyBoard, removeBoardAdmin, removeMembers
}