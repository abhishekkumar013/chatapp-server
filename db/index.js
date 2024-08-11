import mongoose from 'mongoose'

const DB_NAME = 'Tawk'
const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URL}`,
    )
    console.log(`DATABASE CONNECTED ${connectionInstance.connection.name}`)
  } catch (error) {
    console.log(error)
    process.exit(1)
  }
}
export default connectDB
