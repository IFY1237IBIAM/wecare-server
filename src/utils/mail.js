import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const SERVER_URL = process.env.SERVER_URL;

export const sendMail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({ from: `"WeCare" <${process.env.EMAIL_USER}>`, to, subject, html });
    console.log(`Email sent to ${to}`);
  } catch (err) {
    console.error("Error sending email:", err);
    throw err;
  }
};

export const getVerifyUrl = (token, email) => {
  return `${SERVER_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
};
