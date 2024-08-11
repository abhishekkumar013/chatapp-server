import express from 'express'
import morgan from 'morgan' //track endpoint,time taken
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import mongosanitize from 'express-mongo-sanitize'
import bodyParser from 'body-parser'
import xss from 'xss' //senatize untrusted html
import cors from 'cors'
import cookieParser from 'cookie-parser'

const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(mongosanitize())
// app.use(xss())

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'PATCH', 'POST', 'DELETE', 'PUT'],
    credentials: true,
  }),
)
app.use(express.json({ limit: '10kb' }))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(helmet())
app.use(cookieParser())

if (process.env.NODE_ENV === 'dev') {
  app.use(morgan('dev'))
}
const limiter = rateLimit({
  max: 3000,
  windowMs: 60 * 60 * 1000,
  message: 'Too many request from this Ip,Please try again in an hour',
})
app.use('/tawk', limiter)

//
import AuthRoutes from './routes/auth.routes.js'
import Userroutes from './routes/user.routes.js'

app.use('/api/v1/auth', AuthRoutes)
app.use('/api/v1/user', Userroutes)

export { app }
