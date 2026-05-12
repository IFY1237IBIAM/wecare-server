const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return res.status(401).json({ message: "Not authorized, no token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User no longer exists" });

    // Remove this line - let routes handle banned users
    // if (user.isBanned) return res.status(403).json({ message: "Account suspended" });

    req.user = {
      _id: user._id,
      id: user._id.toString(),
      pseudonym: user.pseudonym,
      email: user.email,
      role: user.role,
      isBanned: user.isBanned // pass it through so routes can check
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role!== "admin" && req.user?.role!== "moderator") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};