const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const CheckIn = require("../models/CheckIn");

// @route POST /api/checkin
router.post("/", protect, async (req, res) => {
  try {
    const { mood, note } = req.body;
    if (!mood) return res.status(400).json({ message: "Mood is required" });

    const today = new Date().toISOString().split("T")[0];

    const existing = await CheckIn.findOne({ user: req.user._id, date: today });
    if (existing) {
      return res.status(400).json({
        message: "You have already checked in today 💜",
        checkIn: existing,
        alreadyDone: true,
      });
    }

    const checkIn = await CheckIn.create({
      user: req.user._id,
      mood,
      note: note || "",
      date: today,
    });

    return res.status(201).json({ message: "Check-in saved 💜", checkIn });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// @route GET /api/checkin/today
router.get("/today", protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const checkIn = await CheckIn.findOne({ user: req.user._id, date: today });
    return res.json({ checkIn: checkIn || null, today });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// @route GET /api/checkin/history
router.get("/history", protect, async (req, res) => {
  try {
    const history = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .limit(30);
    return res.json({ history });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;