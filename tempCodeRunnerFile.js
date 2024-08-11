import { app } from './app.js'
import http from 'http'
import dotenv from 'dotenv'
import { Server } from 'socket.io'
import path from 'path'

import connectDB from './db/index.js'
import { User } from './models/user.model.js'
import { FriendRequest } from './models/friendRequest.model.js'
import { OneToOneMessage } from './models/OneToOneMessage.js'
import { AudioCall } from './models/audioCall.js'
import { VideoCall } from './models/videoCall.js'

dotenv.config({ path: './.env' })

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...')
  console.error(err)
  process.exit(1)
})

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...')
  console.error(err)
  server.close(() => {
    process.exit(1)
  })
})

const PORT = process.env.PORT || 8080
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server started at ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('MONGO ERROR:', err)
  })

io.on('connection', async (socket) => {
  console.log(JSON.stringify(socket.handshake.query))
  const user_id = socket.handshake.query['user_id']
  const socket_id = socket.id
  console.log(`User connected ${socket_id}`)

  if (user_id != null && Boolean(user_id)) {
    try {
      User.findByIdAndUpdate(user_id, {
        socket_id: socket.id,
        status: 'Online',
      })
    } catch (e) {
      console.log(e)
    }
  }

  socket.on('friend_request', async (data) => {
    console.log('Friend request received:', data)
    try {
      const to = await User.findById(data.to).select('socket_id')
      const from = await User.findById(data.from).select('socket_id')
      console.log(to, from)

      await FriendRequest.create({ sender: data.from, recipient: data.to })

      if (to?.socket_id) {
        io.to(to.socket_id).emit('new_friend_request', {
          message: 'New friend request received',
        })
      }

      if (from?.socket_id) {
        io.to(from.socket_id).emit('request_sent', {
          message: 'Request sent successfully!',
        })
      }
    } catch (error) {
      console.error('Error handling friend_request event:', error)
    }
  })

  socket.on('accept_request', async (data, callback) => {
    console.log('Accept request received:', data)
    try {
      const request_doc = await FriendRequest.findById(data.request_id)

      const sender = await User.findById(request_doc.sender)
      const receiver = await User.findById(request_doc.recipient)

      sender.friends.push(request_doc.recipient)
      receiver.friends.push(request_doc.sender)

      await receiver.save({ new: true, validateModifiedOnly: true })
      await sender.save({ new: true, validateModifiedOnly: true })

      await FriendRequest.findByIdAndDelete(data.request_id)

      io.to(sender.socket_id).emit('request_accepted', {
        message: 'Friend request accepted',
      })
      io.to(receiver.socket_id).emit('request_accepted', {
        message: 'Friend request accepted',
      })
    } catch (error) {
      console.error('Error handling accept_request event:', error)
    }
  })

  socket.on('get_direct_conversation', async ({ user_id }, callback) => {
    try {
      const existing_conversation = await OneToOneMessage.find({
        participants: { $all: [user_id] },
      }).populate('participants', 'firstName lastName _id email status')

      console.log(existing_conversation)
      callback(existing_conversation)
    } catch (error) {
      console.error('Error getting direct conversation:', error)
    }
  })
  socket.on('start_conversation', async (data) => {
    try {
      const { to, from } = data

      // check if there is any existing conversation

      const existing_conversations = await OneToOneMessage.find({
        participants: { $size: 2, $all: [to, from] },
      }).populate('participants', 'firstName lastName _id email status')

      console.log(existing_conversations[0], 'Existing Conversation')

      // if no => create a new OneToOneMessage doc & emit event "start_chat" & send conversation details as payload
      if (existing_conversations.length === 0) {
        let new_chat = await OneToOneMessage.create({
          participants: [to, from],
        })

        new_chat = await OneToOneMessage.findById(new_chat._id).populate(
          'participants',
          'firstName lastName _id email status',
        )

        console.log(new_chat)

        socket.emit('start_chat', new_chat)
      }
      // if yes => just emit event "start_chat" & send conversation details as payload
      else {
        socket.emit('start_chat', existing_conversations[0])
      }
    } catch (error) {
      console.log(error)
    }
  })

  socket.on('get_messages', async (data, callback) => {
    const { messages } = await OneToOneMessage.findById(
      data.conversation_id,
    ).select('message')

    callback(messages)
  })

  socket.on('text_message', async (data) => {
    try {
      console.log('Received message:', data)
      // Implement logic to handle text messages
      const { message, conversation_id, from, to, type } = data

      const to_user = await User.findById(to)
      const from_user = await User.findById(from)

      // message => {to, from, type, created_at, text, file}

      const new_message = {
        to: to,
        from: from,
        type: type,
        text: message,
        created_at: Date.now(),
      }
      // create  new conversation if not exists
      const chat = await OneToOneMessage.findById(conversation_id)
      chat.message.push(new_message)
      await chat.save({})

      // emit new_message->to user
      io.to(to_user.socket_id).emit('new_message', {
        conversation_id,
        message: new_message,
      })

      // emit new_message->from_user
      io.to(from_user.socket_id).emit('new_message', {
        conversation_id,
        message: new_message,
      })
    } catch (error) {
      console.error('Error handling text_message event:', error)
    }
  })

  socket.on('file_message', async (data, callback) => {
    try {
      console.log('Received message:', data)
      const fileExtension = path.extname(data.file.name)
      const filename = `${Date.now()}_${Math.floor(
        Math.random() * 10000,
      )}${fileExtension}`

      // Implement logic to handle file uploads and messages

      callback({ status: 'success', message: 'File message sent' })
    } catch (error) {
      console.error('Error handling file_message event:', error)
      callback({ status: 'error', message: 'Failed to send file message' })
    }
  })

  // handle start_audio_call event
  socket.on('start_audio_call', async (data) => {
    const { from, to, roomID } = data

    const to_user = await User.findById(to)
    const from_user = await User.findById(from)

    console.log('to_user', to_user)

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit('audio_call_notification', {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    })
  })

  // handle audio_call_not_picked
  socket.on('audio_call_not_picked', async (data) => {
    console.log(data)
    // find and update call record
    const { to, from } = data

    const to_user = await User.findById(to)

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Missed', status: 'Ended', endedAt: Date.now() },
    )

    // TODO => emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit('audio_call_missed', {
      from,
      to,
    })
  })

  // handle audio_call_accepted
  socket.on('audio_call_accepted', async (data) => {
    const { to, from } = data

    const from_user = await User.findById(from)

    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Accepted' },
    )

    // TODO => emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit('audio_call_accepted', {
      from,
      to,
    })
  })

  // handle audio_call_denied
  socket.on('audio_call_denied', async (data) => {
    // find and update call record
    const { to, from } = data

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Denied', status: 'Ended', endedAt: Date.now() },
    )

    const from_user = await User.findById(from)
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit('audio_call_denied', {
      from,
      to,
    })
  })

  // handle user_is_busy_audio_call
  socket.on('user_is_busy_audio_call', async (data) => {
    const { to, from } = data
    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Busy', status: 'Ended', endedAt: Date.now() },
    )

    const from_user = await User.findById(from)
    // TODO => emit on_another_audio_call to sender of call
    io.to(from_user?.socket_id).emit('on_another_audio_call', {
      from,
      to,
    })
  })

  // --------------------- HANDLE VIDEO CALL SOCKET EVENTS ---------------------- //

  // handle start_video_call event
  socket.on('start_video_call', async (data) => {
    const { from, to, roomID } = data

    console.log(data)

    const to_user = await User.findById(to)
    const from_user = await User.findById(from)

    console.log('to_user', to_user)

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit('video_call_notification', {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    })
  })

  // handle video_call_not_picked
  socket.on('video_call_not_picked', async (data) => {
    console.log(data)
    // find and update call record
    const { to, from } = data

    const to_user = await User.findById(to)

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Missed', status: 'Ended', endedAt: Date.now() },
    )

    // TODO => emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit('video_call_missed', {
      from,
      to,
    })
  })

  // handle video_call_accepted
  socket.on('video_call_accepted', async (data) => {
    const { to, from } = data

    const from_user = await User.findById(from)

    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Accepted' },
    )

    // TODO => emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit('video_call_accepted', {
      from,
      to,
    })
  })

  // handle video_call_denied
  socket.on('video_call_denied', async (data) => {
    // find and update call record
    const { to, from } = data

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Denied', status: 'Ended', endedAt: Date.now() },
    )

    const from_user = await User.findById(from)
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit('video_call_denied', {
      from,
      to,
    })
  })

  // handle user_is_busy_video_call
  socket.on('user_is_busy_video_call', async (data) => {
    const { to, from } = data
    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Busy', status: 'Ended', endedAt: Date.now() },
    )

    const from_user = await User.findById(from)
    // TODO => emit on_another_video_call to sender of call
    io.to(from_user?.socket_id).emit('on_another_video_call', {
      from,
      to,
    })
  })

  socket.on('end', async (data) => {
    try {
      if (data.user_id) {
        await User.findByIdAndUpdate(data.user_id, { status: 'Offline' })
      }
      console.log('Closing connection')
      socket.disconnect(0)
    } catch (error) {
      console.error('Error handling end event:', error)
    }
  })
})
