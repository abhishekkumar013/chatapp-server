import express from 'express'
import Protected from '../middleware/auth.middleware.js'
import {
  getAllVerifiedUsers,
  getCallLogs,
  GetFriendRequests,
  GetFriends,
  getMe,
  GetUsers,
  StartAudioCall,
  startVideoCall,
  UpdateMe,
} from '../controllers/user.js'

const router = express.Router()

router.use(Protected)
router.route('/update-me').patch(UpdateMe)
router.route('/get-users').get(GetUsers)
router.route('/get-friends').get(GetFriends)
router.route('/get-friend-requests').get(GetFriendRequests)
router.route('/get-call-log').get(getCallLogs)
router.route('/get-me').get(getMe)
router.route('/get-all-verified-users').get(getAllVerifiedUsers)
router.route('/start-audio-call').get(StartAudioCall)
router.route('/start-video-call').get(startVideoCall)

export default router
