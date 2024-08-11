import mongoose from 'mongoose'

const requestSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  recipient: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
})

export const FriendRequest = new mongoose.model('FriendReequest', requestSchema)
