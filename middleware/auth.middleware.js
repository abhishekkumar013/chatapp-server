import jwt from 'jsonwebtoken'
import { promisify } from 'util'
import { User } from '../models/user.model.js'

const Protected = async (req, res, next) => {
  let token

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1]
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt
  } else {
    return res.status(401).json({
      success: 'error',
      message: 'Unauthorized Access',
    })
  }

  try {
    if (!token) {
      return res.status(401).json({
        message: 'You are not logged in! Please log in to get access.',
      })
    }
    const decode = await promisify(jwt.verify)(token, process.env.JWT_SECRET)

    const this_user = await User.findById(decode._id)
    if (!this_user) {
      return res.status(404).json({
        success: 'error',
        message: 'User does not exist',
      })
    }

    if (
      this_user.passwordChangedAt &&
      this_user.changedPasswordAfter(decode.iat)
    ) {
      return res.status(401).json({
        success: 'error',
        message: 'User recently updated password! Please log in again',
      })
    }

    req.user = this_user
    next()
  } catch (err) {
    return res.status(401).json({
      success: 'error',
      message: 'Unauthorized Access',
      error: err.message,
    })
  }
}

export default Protected
