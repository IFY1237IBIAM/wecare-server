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

const appLoginUrl = "wecare://login";

// --- SIGNUP ---
// --- SIGNUP ---
router.post("/signup", async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { email, password, displayName } = value;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Account already exists" });

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = new User({
      email,
      password, // store plain, pre-save hook hashes it
      displayName: displayName || undefined,
      pseudonym: generatePseudonym(),
      verificationToken,
      isVerified: false,
    });

    await user.save();

    // Send verification email
    const verifyUrl = getVerifyUrl(verificationToken, email);
    await sendMail({
      to: email,
      subject: "Verify your WeCare account",
      html: `
        <p>Click the button below to verify your email:</p>
        <a href="${verifyUrl}" style="padding:10px 20px; background-color:#1976D2; color:#fff; text-decoration:none; border-radius:5px;">Verify Email</a>
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


// --- SIGNIN ---
// --- SIGNIN ---
router.post("/signin", async (req, res) => {
  try {
    console.log("---- SIGNIN ATTEMPT ----");
    console.log("Incoming body:", req.body);

    const { error, value } = signinSchema.validate(req.body);
    if (error) {
      console.log("Validation error:", error.details[0].message);
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = value;
    console.log("Looking for user with email:", email);

    const user = await User.findOne({ email });
    console.log("User found:", user);

    if (!user) {
      console.log("ERROR: No user found with that email");
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log("User verified status:", user.isVerified);
    if (!user.isVerified) {
      console.log("ERROR: User email not verified");
      return res.status(400).json({ message: "Please verify your email before signing in" });
    }

    console.log("Comparing password...");
    const match = await bcrypt.compare(password, user.password);
    console.log("Password match result:", match);

    if (!match) {
      console.log("ERROR: Password mismatch");
      console.log("Entered password:", password);
      console.log("Stored hash:", user.password);
      return res.status(400).json({ message: "Invalid email or password" });
    }

    console.log("SUCCESS: User authenticated");

    const token = createToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        pseudonym: user.pseudonym
      },
    });

  } catch (err) {
    console.error("Signin error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- RESEND VERIFICATION ---
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "No account found with this email" });
    if (user.isVerified) return res.status(400).json({ message: "Email already verified" });

    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    await user.save();

    const verifyUrl = getVerifyUrl(verificationToken, email);
    await sendMail({
      to: email,
      subject: "Verify your WeCare account",
      html: `<p>Click to verify:</p><a href="${verifyUrl}">Verify Email</a><p>Or copy this link: ${verifyUrl}</p>`,
    });

    res.json({ message: "Verification email sent" });
  } catch (err) {
    console.error("Resend verification error", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
