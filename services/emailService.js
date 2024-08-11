// emailService.js
import emailjs from 'emailjs-com'
import dotenv from 'dotenv'

dotenv.config({ path: '../.env' })

const sendEmail = async ({ recipient, sender, subject, text, html }) => {
  const templateParams = {
    to_email: recipient,
    from_name: sender || 'YourAppName',
    subject: subject,
    message: text || html,
  }

  try {
    if (process.env.NODE_ENV === 'dev') {
      return Promise.resolve()
    } else {
      return emailjs.send(
        process.env.EMAILJS_SERVICE_ID,
        process.env.EMAILJS_TEMPLATE_ID,
        templateParams,
        process.env.EMAILJS_USER_ID,
      )
    }
  } catch (error) {
    console.error(error)
    throw new Error('Email sending failed')
  }
}

export default sendEmail
