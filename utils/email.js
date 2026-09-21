import nodemailer from 'nodemailer';

const hasGmailConfig = () => process.env.GMAIL_SMTP_USER && process.env.GMAIL_SMTP_APP_PASSWORD;

const getTransporter = () => {
  if (!hasGmailConfig()) return null;

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: process.env.GMAIL_SMTP_USER,
      pass: process.env.GMAIL_SMTP_APP_PASSWORD
    }
  });
};

const getOtpTemplate = ({ otp, purpose }) => {
  const title = purpose === 'password_reset'
    ? 'Passwort zurücksetzen'
    : 'E-Mail-Adresse bestätigen';

  return {
    subject: `n_krypted - ${title}`,
    text: `Ihr n_krypted OTP-Code lautet: ${otp}. Dieser Code ist nur kurze Zeit gültig.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>${title}</h2>
        <p>Ihr n_krypted OTP-Code lautet:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${otp}</p>
        <p>Dieser Code ist nur kurze Zeit gültig.</p>
      </div>
    `
  };
};

export const sendOtpEmail = async ({ to, otp, purpose }) => {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      sent: false,
      skipped: true,
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
    };
  }

  const template = getOtpTemplate({ otp, purpose });

  await transporter.sendMail({
    from: `"n_krypted" <${process.env.GMAIL_SMTP_USER}>`,
    to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });

  return { sent: true, skipped: false };
};
