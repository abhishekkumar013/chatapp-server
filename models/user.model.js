import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'firstName is required'],
    },
    lastName: {
      type: String,
      required: [true, 'LastName is required'],
    },
    avatar: {
      type: String,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      validate: {
        validator: function (email) {
          return String(email)
            .toLowerCase()
            .match(
              /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
            )
        },
        message: (props) => `Email (${props.value}) is invalid!`,
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    passwordConfirm: {
      type: String,
    },
    passwordChangedAt: {
      type: Date,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetExpires: {
      type: Date,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otp_expiry_time: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
    },
    friends: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },
    ],
    socket_id: {
      type: String,
    },
    status: {
      type: String,
      enum: ['Online', 'Offline'],
      default: 'Offline',
    },
  },
  { timestamps: true },
)
userSchema.pre('save', async function (next) {
  if (!this.isModified('otp') || !this.otp) return next()
  this.otp = await bcrypt.hash(this.otp, 12)
  next()
})
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordConfirm')) return next()

  this.passwordConfirm = await bcrypt.hash(this.passwordConfirm, 12)

  next()
})
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  this.password = await bcrypt.hash(this.password, 12)
  this.passwordChangedAt = Date.now() - 1000
  next()
})

userSchema.methods.isCorrectPassword = async function (password) {
  return await bcrypt.compare(password, this.password)
}
userSchema.methods.isCorrectOTP = async function (otp) {
  return await bcrypt.compare(otp, this.otp)
}

userSchema.methods.generateAccessToken = function () {
  return jwt.sign({ _id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  })
}
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex')

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex')

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000
  return resetToken
}

userSchema.methods.changedPasswordAfter = function (JWTTimeStamp) {
  if (this.passwordChangedAt) {
    const changedTimeStamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    )
    return JWTTimeStamp < changedTimeStamp
  }

  // FALSE MEANS NOT CHANGED
  return false
}

export const User = mongoose.model('User', userSchema)
