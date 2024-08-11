import sgMail from '@sendgrid/mail'
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

sgMail.setApiKey(process.env.SENDGRID_KEY)

const sendSGMail = async ({
  recipient,
  sender,
  subject,
  text,
  html,

  attachments,
}) => {
  try {
    const from = sender || 'aryaritesh707@gmail.com'
    const msg = {
      to: recipient,
      from: from,
      subject,
      html: html,
      text: text,
      attachments,
    }
    return sgMail.send(msg)
  } catch (error) {
    console.log(error)
  }
}

export const sendEmail = async (args) => {
  if (process.env.NODE_ENV === 'dev') {
    return new Promise.resolve()
  } else {
    return sendSGMail(args)
  }
}
