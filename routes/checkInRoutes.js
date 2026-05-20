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
// @route GET /api/checkin/streak
router.get("/streak", protect, async (req, res) => {
  try {
    const checkIns = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .select("date mood");

    if (checkIns.length === 0) {
      return res.json({
        currentStreak: 0,
        longestStreak: 0,
        totalDays: 0,
      });
    }

    const dates = checkIns.map((c) => c.date);

    const today = new Date().toISOString().slice(0, 10);

    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);

    // Current streak
    let currentStreak = 0;

    let checkDate =
      dates[0] === today || dates[0] === yesterday
        ? dates[0]
        : null;

    if (checkDate) {
      currentStreak = 1;

      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(checkDate);

        prev.setDate(prev.getDate() - 1);

        const prevStr = prev.toISOString().slice(0, 10);

        if (dates[i] === prevStr) {
          currentStreak++;
          checkDate = prevStr;
        } else {
          break;
        }
      }
    }

    // Longest streak
    let longestStreak = 1;
    let runningStreak = 1;

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);

      prev.setDate(prev.getDate() - 1);

      if (dates[i] === prev.toISOString().slice(0, 10)) {
        runningStreak++;

        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 1;
      }
    }

    return res.json({
      currentStreak,
      longestStreak,
      totalDays: checkIns.length,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
});
module.exports = router;