import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Joi from "joi";

import User from "../models/User.js";
import generatePseudonym from "../utils/generatePseudonym.js";
import { sendMail, getVerifyUrl } from "../utils/mail.js";

const router = express.Router();

const createToken = (user) =>
  jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  displayName: Joi.string().max(50).allow("", null),
});

const signinSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// --- DEEP LINK SCHEME FOR APP LOGIN ---
const appLoginUrl = "wecare://login"; // <-- your app scheme

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, password, displayName } = value;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Account already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = new User({
      email,
      password: passwordHash,
      displayName: displayName || undefined,
      pseudonym: generatePseudonym(),
      verificationToken,
    });

    await user.save();

    // --- EMAIL VERIFICATION LINK USING YOUR SERVER ---
    const verifyUrl = getVerifyUrl(verificationToken, email);
    await sendMail({
      to: email,
      subject: "Verify your WeCare account",
      html: `
        <p>Click the button below to verify your email:</p>
        <a href="${verifyUrl}" style="padding:10px 20px; background-color:#1976D2; color:#fff; text-decoration:none; border-radius:5px;">Verify Email</a>
        <p>If successful, you will be redirected to your app login screen.</p>
        <p>Or copy this link: ${verifyUrl}</p>
      `,
    });
    const token = createToken(user);

    res.json({
      token,
      user: { id: user._id, email: user.email, displayName: user.displayName, pseudonym: user.pseudonym },
    });
  } catch (err) {
    console.error("Signup error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// EMAIL VERIFICATION
router.get("/verify-email", async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).send("Invalid verification link.");
    }

    const user = await User.findOne({ email, verificationToken: token });
    if (!user) return res.status(400).send("Invalid or expired verification token.");

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    // --- Redirect to app login via deep link ---
    res.redirect(appLoginUrl);
  } catch (err) {
    console.error("Email verification error", err);
    res.status(500).send("Server error.");
  }
});

export default router;
