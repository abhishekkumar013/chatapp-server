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

  console.log(`User connected ${socket.id}`)

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

  // We can write our socket event listeners in here...
  socket.on('friend_request', async (data) => {
    const to = await User.findById(data.to).select('socket_id')
    const from = await User.findById(data.from).select('socket_id')

    // create a friend request
    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    })
    // emit event request received to recipient
    io.to(to?.socket_id).emit('new_friend_request', {
      message: 'New friend request received',
    })
    io.to(from?.socket_id).emit('request_sent', {
      message: 'Request Sent successfully!',
    })
  })

  socket.on('accept_request', async (data) => {
    // accept friend request => add ref of each other in friends array
    console.log(data)
    const request_doc = await FriendRequest.findById(data.request_id)

    console.log(request_doc)

    const sender = await User.findById(request_doc.sender)
    const receiver = await User.findById(request_doc.recipient)

    sender.friends.push(request_doc.recipient)
    receiver.friends.push(request_doc.sender)

    await receiver.save({ new: true, validateModifiedOnly: true })
    await sender.save({ new: true, validateModifiedOnly: true })

    await FriendRequest.findByIdAndDelete(data.request_id)

    // delete this request doc
    // emit event to both of them

    // emit event request accepted to both
    io.to(sender?.socket_id).emit('request_accepted', {
      message: 'Friend Request Accepted',
    })
    io.to(receiver?.socket_id).emit('request_accepted', {
      message: 'Friend Request Accepted',
    })
  })

  socket.on('get_direct_conversations', async ({ user_id }, callback) => {
    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate('participants', 'firstName lastName avatar _id email status')

    // db.books.find({ authors: { $elemMatch: { name: "John Smith" } } })

    console.log(existing_conversations)

    callback(existing_conversations)
  })

  socket.on('start_conversation', async (data) => {
    // data: {to: from:}

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

      new_chat = await OneToOneMessage.findById(new_chat).populate(
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
  })

  socket.on('get_messages', async (data, callback) => {
    try {
      const { messages } = await OneToOneMessage.findById(
        data.conversation_id,
      ).select('messages')
      callback(messages)
    } catch (error) {
      console.log(error)
    }
  })

  // Handle incoming text/link messages
  socket.on('text_message', async (data) => {
    console.log('Received message:', data)

    const { message, conversation_id, from, to, type } = data
    console.log(message)

    const to_user = await User.findById(to)
    const from_user = await User.findById(from)

    const new_message = {
      to: to,
      from: from,
      type: type,
      created_at: Date.now(),
      text: message,
    }

    // fetch OneToOneMessage Doc & push a new message to existing conversation
    let chat = await OneToOneMessage.findById(conversation_id)

    if (!chat) {
      // If no conversation found, create a new one
      chat = new OneToOneMessage({
        participants: [from, to],
        messages: [new_message],
      })
    } else {
      // If conversation found, push new message to messages array
      chat.messages.push(new_message)
    }

    // save to db
    await chat.save({ new: true, validateModifiedOnly: true })

    // emit incoming_message -> to user
    io.to(to_user?.socket_id).emit('new_message', {
      conversation_id: chat._id, // Use the new chat's id in case a new chat was created
      message: new_message,
    })

    // emit outgoing_message -> from user
    io.to(from_user?.socket_id).emit('new_message', {
      conversation_id: chat._id, // Use the new chat's id in case a new chat was created
      message: new_message,
    })
  })

  // handle Media/Document Message
  socket.on('file_message', (data) => {
    console.log('Received message:', data)

    // data: {to, from, text, file}

    // Get the file extension
    const fileExtension = path.extname(data.file.name)

    // Generate a unique filename
    const filename = `${Date.now()}_${Math.floor(
      Math.random() * 10000,
    )}${fileExtension}`

    // upload file to AWS s3

    // create a new conversation if its dosent exists yet or add a new message to existing conversation

    // save to db

    // emit incoming_message -> to user

    // emit outgoing_message -> from user
  })

  // -------------- HANDLE AUDIO CALL SOCKET EVENTS ----------------- //

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

  // -------------- HANDLE SOCKET DISCONNECTION ----------------- //

  socket.on('end', async (data) => {
    // Find user by ID and set status as offline

    if (data.user_id) {
      await User.findByIdAndUpdate(data.user_id, { status: 'Offline' })
    }

    // broadcast to all conversation rooms of this user that this user is offline (disconnected)

    console.log('closing connection')
    socket.disconnect(0)
  })
})
