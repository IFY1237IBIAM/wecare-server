import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { sendEmail } from "../utils/sendEmail.js";
import crypto from "crypto";
import Joi from "joi";

// Helper to create JWT
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
};

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// @desc Register User
// @route POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const user = new User({ name, email, password });
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Send verification email
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    const message = `Click here to verify your email: ${verifyUrl}`;
    await sendEmail({ to: email, subject: "WeCare Email Verification", text: message });

    res.status(201).json({ success: true, message: "User registered. Verification email sent." });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc Verify Email
// @route GET /api/auth/verify-email/:token
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.status(200).json({ success: true, message: "Email verified. You can now log in." });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc Login User
// @route POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (!user.isVerified) return res.status(401).json({ message: "Please verify your email" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = createToken(user._id);
    res.status(200).json({ token, user: { id: user._id, name: user.name, email: user.email } });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc Forgot Password
// @route POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Please provide email" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const message = `Click here to reset your password: ${resetUrl}`;
    await sendEmail({ to: email, subject: "WeCare Password Reset", text: message });

    res.status(200).json({ success: true, message: "Password reset email sent" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc Reset Password
// @route POST /api/auth/reset-password/:token
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Please provide new password" });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(200).json({ success: true, message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc Resend Verification Email
// @route POST /api/auth/resend-verification
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Email already verified" });

    const token = user.generateVerificationToken();
    await user.save();

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    const message = `Click here to verify your email: ${verifyUrl}`;
    await sendEmail({ to: email, subject: "WeCare Email Verification", text: message });

    res.status(200).json({ success: true, message: "Verification email resent" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
