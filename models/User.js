const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    pseudonym: {
      type: String,
      required: [true, "Pseudonym is required"],
      unique: true,
      trim: true,
      minlength: [3, "Pseudonym must be at least 3 characters"],
      maxlength: [20, "Pseudonym cannot exceed 20 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },

    avatar: {
      color: { type: String, default: () => getRandomColor() },
      shape: { type: String, default: () => getRandomShape() },
    },

    isVerified: { type: Boolean, default: false },

    bio: { type: String, maxlength: 100, default: "" },

    // Online status
    lastSeen: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    showOnlineStatus: { type: Boolean, default: true },
    // Saved posts
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  },
  { timestamps: true }
);

// Random avatar helpers
function getRandomColor() {
  const colors = [
    "#A78BFA",
    "#60A5FA",
    "#34D399",
    "#F472B6",
    "#FB923C",
    "#E879F9",
  ];

  return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomShape() {
  const shapes = ["circle", "square", "triangle", "diamond"];

  return shapes[Math.floor(Math.random() * shapes.length)];
}

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};
userSchema.index({ pseudonym: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);