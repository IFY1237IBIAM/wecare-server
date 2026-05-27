const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const CheckIn = require("../models/CheckIn");
const NotificationToken = require("../models/NotificationToken"); // multi-device token store
const { Expo } = require("expo-server-sdk");

const expo = new Expo();

// ─── Milestone config ────────────────────────────────────────────────────────
const MILESTONES = [3, 7, 14, 30, 60, 100];

const MILESTONE_MESSAGES = {
  3: {
    title: "3-Day Streak 🌱",
    body: "You've checked in 3 days in a row. Small steps matter — keep going 💜",
  },
  7: {
    title: "One Week Strong 🔥",
    body: "7 days of showing up for yourself. That's a whole week of courage. You're doing amazing 💜",
  },
  14: {
    title: "Two Weeks! 💪",
    body: "14 days straight. You've made checking in a real habit. HushCircle is proud of you 💜",
  },
  30: {
    title: "30-Day Milestone 🌟",
    body: "A full month of daily check-ins. That's extraordinary self-care. You should feel proud 💜",
  },
  60: {
    title: "60 Days — You're Unstoppable 🚀",
    body: "Two months of showing up for yourself every single day. This community is so lucky to have you 💜",
  },
  100: {
    title: "100 Days! 👑 Legendary",
    body: "ONE HUNDRED days. You are an inspiration. Thank you for being part of HushCircle 💜",
  },
};

// ─── Send push notification helper ──────────────────────────────────────────

async function sendStreakPushNotification(userId, milestone) {
  try {
    const msg = MILESTONE_MESSAGES[milestone];
    if (!msg) return;

    // Fetch ALL tokens registered for this user (multi-device support)
    const tokenDocs = await NotificationToken.find({ user: userId }).select("expoPushToken");
    if (!tokenDocs.length) return;

    // Filter to valid Expo tokens only
    const validTokens = tokenDocs
      .map((t) => t.expoPushToken)
      .filter((token) => Expo.isExpoPushToken(token));

    if (!validTokens.length) return;

    // Build one message per device
    const messages = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: msg.title,
      body: msg.body,
      data: { type: "streak_milestone", milestone, screen: "CheckIn" },
      priority: "high",
    }));

    await expo.sendPushNotificationsAsync(messages);

    console.log(`✅ Streak milestone (${milestone} days) sent to ${validTokens.length} device(s) for user ${userId}`);
  } catch (err) {
    // Non-fatal — never block a check-in over a notification failure
    console.error("Streak push notification error:", err.message);
  }
}

// ─── Calculate streak from sorted date array ─────────────────────────────────

function calcStreaks(dates) {
  if (!dates.length) return { currentStreak: 0, longestStreak: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Current streak
  let currentStreak = 0;
  let checkDate = dates[0] === today || dates[0] === yesterday ? dates[0] : null;
  if (checkDate) {
    currentStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(checkDate);
      prev.setDate(prev.getDate() - 1);
      const prevStr = prev.toISOString().slice(0, 10);
      if (dates[i] === prevStr) { currentStreak++; checkDate = prevStr; }
      else break;
    }
  }

  // Longest streak
  let longestStreak = dates.length ? 1 : 0;
  let running = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    prev.setDate(prev.getDate() - 1);
    if (dates[i] === prev.toISOString().slice(0, 10)) {
      running++;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 1;
    }
  }

  return { currentStreak, longestStreak };
}

// ─── POST /api/checkin ────────────────────────────────────────────────────────

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

    // ── Calculate new streak after this check-in ──────────────────────────
    const allCheckIns = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .select("date");

    const dates = allCheckIns.map((c) => c.date);
    const { currentStreak, longestStreak } = calcStreaks(dates);

    // ── Fire push notification if this hit a milestone ────────────────────
    // Only notify if TODAY's streak exactly equals a milestone (not on re-fetch)
    const hitMilestone = MILESTONES.includes(currentStreak);
    if (hitMilestone) {
      // Fire and forget — don't await so check-in response is instant
      sendStreakPushNotification(req.user._id, currentStreak);
    }

    return res.status(201).json({
      message: "Check-in saved 💜",
      checkIn,
      streak: {
        currentStreak,
        longestStreak,
        totalDays: dates.length,
        hitMilestone: hitMilestone ? currentStreak : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/checkin/today ───────────────────────────────────────────────────

router.get("/today", protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const checkIn = await CheckIn.findOne({ user: req.user._id, date: today });
    return res.json({ checkIn: checkIn || null, today });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/checkin/history ─────────────────────────────────────────────────

router.get("/history", protect, async (req, res) => {
  try {
    const history = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .limit(30);
    // Note: frontend expects `checkIns` key
    return res.json({ checkIns: history });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/checkin/streak ──────────────────────────────────────────────────

router.get("/streak", protect, async (req, res) => {
  try {
    const checkIns = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .select("date mood");

    if (!checkIns.length) {
      return res.json({ currentStreak: 0, longestStreak: 0, totalDays: 0 });
    }

    const dates = checkIns.map((c) => c.date);
    const { currentStreak, longestStreak } = calcStreaks(dates);

    return res.json({ currentStreak, longestStreak, totalDays: checkIns.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;