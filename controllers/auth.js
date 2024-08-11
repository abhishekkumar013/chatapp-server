import jwt from 'jsonwebtoken'
import { User } from '../models/user.model.js'
import filterObj from '../utils/filterObject.js'
import otpGenerator from 'otp-generator'
import crypto from 'crypto'
import sendEmail from '../services/emailService.js'
// import { sendEmail } from '../services/mailer.js'

const signedToken = async (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET)
}
export const Login = async (req, res, next) => {
  const { email, password } = req.body

  try {
    // Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Both email and password are required',
      })
    }

    // Find user by email and exclude password field from selection
    const user = await User.findOne({ email }).select('+password')

    // Handle if user does not exist or password is incorrect
    if (!user || !(await user.isCorrectPassword(password))) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email or password',
      })
    }

    // Generate access token upon successful login
    const token = user.generateAccessToken()

    // Respond with success message and token
    return res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      token,
      user_id: user._id,
    })
  } catch (error) {
    // Handle any errors
    console.error('Error in login:', error)
    return res.status(500).json({
      status: 'error',
      message: 'Server error',
    })
  }
}

export const registerController = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body

  const filteredBody = filterObj(
    req.body,
    'firstName',
    'lastName',
    'password',
    'email',
  )

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'All Fields are required',
    })
  }

  const existing_user = await User.findOne({ email: email })
  if (existing_user && existing_user.verified) {
    return res.status(400).json({
      status: 'error',
      message: 'Email is already in use, please login.',
    })
  } else if (existing_user) {
    const updatedUser = await User.findOneAndUpdate(
      { email: email },
      filteredBody,
      { new: true, validateModifiedOnly: true },
    )
    req.userId = existing_user._id
    return next()
  } else {
    const user = await User.create(filteredBody)

    // generate otp
    req.userId = user._id
    return next()
  }
}
//TODO send grid code-----------------------------
// export const sendOTP = async (req, res, next) => {
//   const { userId } = req
//   const new_otp = otpGenerator.generate(6, {
//     upperCaseAlphabets: false,
//     lowerCaseAlphabets: false,
//     specialChars: false,
//   })
//   const otp_expiry_time = Date.now() + 10 * 60 * 1000 //10 min
//   await User.findByIdAndUpdate(userId, { otp: new_otp, otp_expiry_time })

//   //TODO send mail
//   mailservice
//     .sendEmai({
//       from: 'aryaritesh707@gmail.com',
//       to: 'exmaple@gmail.com',
//       subject: 'OTP for Tawk',
//       text: `Your OTP is ${new_otp}. This is valid for 10 min`,
//     })
//     .then(() => {
//       return res.status(200).json({
//         status: 'success',
//         message: 'OTP Sent Successfully',
//       })
//     })
//     .catch((err) => {
//       return res.status(500).json({
//         status: 'error',
//         message: 'server error',
//       })
//     })

//   return res.status(200).json({
//     status: 'success',
//     message: 'OTP Sent Successfully',
//   })
// }
// TODO email js code
export const sendOTP = async (req, res, next) => {
  try {
    const { userId } = req

    // Generate OTP
    const new_otp = otpGenerator
      .generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      })
      .toString() // Ensure OTP is converted to string

    const otp_expiry_time = new Date(Date.now() + 10 * 60 * 1000) // 10 min

    // Update user with OTP and expiry time
    let user = await User.findByIdAndUpdate(
      userId,
      {
        otp_expiry_time: otp_expiry_time,
      },
      { new: true },
    )
    user.otp = new_otp.toString()
    await user.save()

    // Check if user exists
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      })
    }

    // Send OTP via email
    console.log(user.email, new_otp)
    await sendEmail({
      recipient: user.email,
      sender: 'aryaritesh707@gmail.com',
      subject: 'OTP for Tawk',
      text: `Your OTP is ${new_otp}. This is valid for 10 min`,
    })

    return res.status(200).json({
      status: 'success',
      message: 'OTP Sent Successfully',
    })
  } catch (error) {
    console.error('Error in sendOTP:', error)
    return res.status(500).json({
      status: 'error',
      message: 'Server error',
    })
  }
}
export const verifyOTP = async (req, res, next) => {
  // verify otp
  const { email, otp } = req.body

  if (!email || !otp) {
    return res
      .status(404)
      .json({ success: 'error', message: 'OTP and Emailare Required' })
  }

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  })
  if (!user) {
    return res
      .status(400)
      .json({ success: 'error', message: 'Email is Invalid or Otp expired' })
  }
  if (!(await user.isCorrectOTP(otp))) {
    return res
      .status(400)
      .json({ success: 'error', message: 'OTP is incorrect' })
  }

  user.verified = true
  user.otp = undefined

  await user.save({ new: true, validateBeforeSave: true })
  const token = user.generateAccessToken()

  return res
    .status(200)
    .json({
      success: 'success',
      message: 'OTP Verified',
      token,
      user_id: user._id,
    })
}

//it send link tto user to reset password
export const forgetPassword = async (req, res, next) => {
  const { email } = req.body
  if (!email) {
    return res
      .status(400)
      .json({ success: 'error', message: 'Email is Required' })
  }
  const user = await User.findOne({ email: email })
  if (!user) {
    return res.status(400).json({ success: 'error', message: 'User not found' })
  }
  const resetToken = user.createPasswordResetToken()
  await user.save({ validateBeforeSave: false })

  const resetURL = `http://localhost:3000/auth/new-password?token=${resetToken}`

  try {
    console.log(resetToken)
    // TODO => send Emmail with reset link
    return res.status(200).json({
      success: 'success',
      message: 'Reset Password link send to Email',
    })
  } catch (error) {
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save({ validateBeforeSave: false })

    return res.status(500).json({
      success: 'error',
      message: 'Error in sending email, Please try  again later.',
    })
  }
}

// reset password link use this controoller
export const resetPassword = async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.body.token)
    .digest('hex')

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  })

  // 2) if token has expired or submission is out of window
  if (!user) {
    return res.status(400).json({
      success: 'error',
      message: 'Token is Invalid or Expired',
    })
  }

  // 3) update users password and set resetToekn & expiry undefined

  user.password = req.body.password
  user.passwordConfirm = req.body.confirmPassword
  user.passwordResetToken = undefined
  user.passwordResetExpires = undefined
  await user.save()

  // 4) Log in the user and send new JWT

  const token = user.generateAccessToken()
  console.log(user)

  // TODO => send and email to user informing about password reset

  return res.status(400).json({
    success: 'success',
    message: 'Password Reseted Successfully',
    token,
  })
}
