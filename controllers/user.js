import { AudioCall } from '../models/audioCall.js'
import { FriendRequest } from '../models/friendRequest.model.js'
import { User } from '../models/user.model.js'
import { VideoCall } from '../models/videoCall.js'
import filterObj from '../utils/filterObject.js'

import { generateToken04 } from './zegoServerAssistant.js'

export const getMe = async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: req.user,
  })
}
export const UpdateMe = async (req, res) => {
  const { user } = req
  const filteredBody = filterObj(
    req.body,
    'firstName',
    'lastName',
    'about',
    'avatar',
  )
  const updated_user = await User.findByIdAndUpdate(user._id, filteredBody, {
    new: true,
  })
  return res.status(200).json({
    status: 'success',
    data: updated_user,
    message: 'Profile Updated  Successfullly',
  })
}

export const GetUsers = async (req, res, next) => {
  const all_users = await User.find({
    verified: true,
  }).select('firstName lastName _id')

  const this_user = req.user
  const remining_users = all_users.filter(
    (user) =>
      !this_user.friends.includes(user._id) &&
      user._id.toString() !== req.user._id.toString(),
  )
  res.status(200).json({
    status: 'success',
    data: remining_users,
    message: 'Users found successfully',
  })
}

export const GetFriends = async (req, res, next) => {
  const this_user = await User.findById(req.user._id).populate(
    'friends',
    '_id firstName lastName',
  )

  res.status(200).json({
    status: 'success',
    data: this_user.friends,
    message: 'Friends found successfully',
  })
}
export const getAllVerifiedUsers = async (req, res, next) => {
  const all_users = await User.find({
    verified: true,
  }).select('firstName lastName _id')

  const remaining_users = all_users.filter(
    (user) => user._id.toString() !== req.user._id.toString(),
  )

  res.status(200).json({
    status: 'success',
    data: remaining_users,
    message: 'Users found successfully!',
  })
}

export const GetFriendRequests = async (req, res, next) => {
  const requests = await FriendRequest.find({
    recipient: req.user._id,
  }).populate('sender', '_id firstName lastName')
  res.status(200).json({
    status: 'success',
    data: requests,
    message: 'Friends requests found successfully',
  })
}

export const generateZegoToken = async (req, res, next) => {
  try {
    const { userId, room_id } = req.body
    const effectiveTimeInSeconds = 3600 //type: number; unit: s; token expiration time, unit: second
    const payloadObject = {
      room_id, // Please modify to the user's roomID
      // The token generated allows loginRoom (login room) action
      // The token generated in this example allows publishStream (push stream) action
      privilege: {
        1: 1, // loginRoom: 1 pass , 0 not pass
        2: 1, // publishStream: 1 pass , 0 not pass
      },
      stream_id_list: null,
    } //
    const payload = JSON.stringify(payloadObject)
    const token = generateToken04(
      appID * 1, // APP ID NEEDS TO BE A NUMBER
      userId,
      serverSecret,
      effectiveTimeInSeconds,
      payload,
    )
    res.status(200).json({
      status: 'success',
      message: 'Token generated successfully',
      token,
    })
  } catch (error) {
    console.log(err)
  }
}

export const StartAudioCall = async (req, res, next) => {
  const from = req.user._id
  const to = req.body.id

  const from_user = await User.findById(from)
  const to_user = await User.findById(to)

  const new_audio_call = await AudioCall.create({
    participants: [from, to],
    from,
    to,
    status: 'Ongoing',
  })

  res.status(200).json({
    data: {
      from: to_user,
      roomID: new_audio_call._id,
      streamID: to,
      userID: from,
      userName: from,
    },
  })
}

export const startVideoCall = async (req, res, next) => {
  const from = req.user._id
  const to = req.body.id

  const from_user = await User.findById(from)
  const to_user = await User.findById(to)

  const new_Video_call = await VideoCall.create({
    participants: [from, to],
    from,
    to,
    status: 'Ongoing',
  })

  res.status(200).json({
    data: {
      from: to_user,
      roomID: new_Video_call._id,
      streamID: to,
      userID: from,
      userName: from,
    },
  })
}

export const getCallLogs = async (req, res, next) => {
  const user_id = req.user._id

  const call_logs = []

  const audio_calls = await AudioCall.find({
    participants: { $all: [user_id] },
  }).populate('from to')

  const video_calls = await VideoCall.find({
    participants: { $all: [user_id] },
  }).populate('from to')

  console.log(audio_calls, video_calls)

  for (let elm of audio_calls) {
    const missed = elm.verdict !== 'Accepted'
    if (elm.from._id.toString() === user_id.toString()) {
      const other_user = elm.to

      // outgoing
      call_logs.push({
        id: elm._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      })
    } else {
      // incoming
      const other_user = elm.from

      // outgoing
      call_logs.push({
        id: elm._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      })
    }
  }

  for (let element of video_calls) {
    const missed = element.verdict !== 'Accepted'
    if (element.from._id.toString() === user_id.toString()) {
      const other_user = element.to

      // outgoing
      call_logs.push({
        id: element._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      })
    } else {
      // incoming
      const other_user = element.from

      // outgoing
      call_logs.push({
        id: element._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      })
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Call Logs Found successfully!',
    data: call_logs,
  })
}
