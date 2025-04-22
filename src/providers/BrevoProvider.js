import { env } from '~/config/environment'
const brevo = require('@getbrevo/brevo')
let apiInstance = new brevo.TransactionalEmailsApi();

let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = env.BREVO_API_KEY


let sendSmtpEmail = new brevo.SendSmtpEmail();

const sendEmail = async (toEmail, customSubject, htmlContent) => {
  // Người gửi
  sendSmtpEmail.sender = { email: env.ADMIN_EMAIL_ADDRESS, name: env.ADMIN_EMAIL_NAME }
  // Người nhận
  sendSmtpEmail.to = [{ email: toEmail }]
  // Tiêu đề
  sendSmtpEmail.subject = customSubject
  // Nội dung
  sendSmtpEmail.htmlContent = htmlContent
  // Gửi
  return apiInstance.sendTransacEmail(sendSmtpEmail)

}

export const BrevoProvider = {
  sendEmail
}