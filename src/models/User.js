import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    displayName: { type: String },
    pseudonym: { type: String },

    isVerified: { type: Boolean, default: false },
    verificationToken: String,

    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Generate verification token
userSchema.methods.generateVerificationToken = function () {
  const token = crypto.randomBytes(20).toString("hex");
  this.verificationToken = token;
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(20).toString("hex");
  this.passwordResetToken = crypto.createHash("sha256")
    .update(token)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000;
  return token;
};

export default mongoose.model("User", userSchema);
