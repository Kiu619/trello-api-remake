import { StatusCodes } from 'http-status-codes'
import { GET_DB } from '~/config/mongodb'

const getTemplates = async (req, res, next) => {
  try {
    const templates = await GET_DB().collection('templates').find().toArray()
    console.log(templates)
    res.status(StatusCodes.OK).json(templates)
  } catch (error) {
    next(error)
  }
}

export const templateController = {
  getTemplates
}