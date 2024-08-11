import express from 'express'
import {
  forgetPassword,
  Login,
  registerController,
  resetPassword,
  sendOTP,
  verifyOTP,
} from '../controllers/auth.js'

const router = express.Router()

router.route('/test').get((req, res) => {
  return res.status(400).json({
    success: 'error',
    message: 'Token is Invalid or Expired',
  })
})
router.route('/login').post(Login)

router.post('/register', registerController, sendOTP)

router.route('/send-otp').post(sendOTP)

router.route('/verify-otp').post(verifyOTP)

router.route('/forgot-password').post(forgetPassword)

router.route('/reset-password').post(resetPassword)

export default router
