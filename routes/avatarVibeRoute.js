// ─── GET /api/users/avatar-vibe/:pseudonym ────────────────────────────────────
//
// Returns the animated emoji that floats on a user's avatar.
// Priority: milestone emoji > mood emoji > nothing (null)
//
// Response shape:
// {
//   emoji:     string | null,   // the emoji to show, or null if nothing to show
//   type:      "milestone" | "mood" | null,
//   mood:      string | null,   // raw mood key if type === "mood"
//   milestone: number | null,   // streak day count if type === "milestone"
// }
//
// Rules:
//  - Only shows an emoji if the user checked in TODAY (localDate param)
//  - Milestone takes priority: if today's streak is a milestone day, show
//    the milestone emoji regardless of mood
//  - Falls back to mood emoji otherwise
//  - Returns { emoji: null } if the user hasn't checked in today
//
// Privacy: only the emoji is returned — no mood note, no streak history,
// no personal data beyond what the emoji itself conveys.

const express  = require("express");
const router   = express.Router();
const { protect } = require("../middleware/authMiddleware");
const CheckIn  = require("../models/CheckIn");
const User     = require("../models/User");

// ── Config ────────────────────────────────────────────────────────────────────

const MOOD_EMOJI = {
  heartbreak: "💔",
  fear:       "😰",
  sadness:    "😔",
  struggle:   "😤",
  hope:       "🌿",
  joy:        "✨",
  calm:       "🕊️",
};

const MILESTONE_DAYS  = [3, 7, 14, 30, 60, 100];
const MILESTONE_EMOJI = {
  3:   "🌱",
  7:   "🔥",
  14:  "💪",
  30:  "🌟",
  60:  "🚀",
  100: "👑",
};

// ── Date helpers (same pattern as checkin.js) ─────────────────────────────────

function isValidDateString(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function serverUTCDateFallback() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split("T")[0];
}

// ── Streak calculator (mirrors checkin.js exactly) ────────────────────────────

function calcCurrentStreak(dates, referenceToday) {
  if (!dates.length) return 0;
  const yesterday = addDays(referenceToday, -1);
  const startDate = dates[0];

  // Streak is only alive if the most recent check-in is today or yesterday
  if (startDate !== referenceToday && startDate !== yesterday) return 0;

  let streak    = 1;
  let checkDate = startDate;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === addDays(checkDate, -1)) {
      streak++;
      checkDate = dates[i];
    } else {
      break;
    }
  }
  return streak;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/avatar-vibe/:pseudonym", protect, async (req, res) => {
  try {
    const { pseudonym } = req.params;
    const { localDate }  = req.query;
    const today = isValidDateString(localDate) ? localDate : serverUTCDateFallback();

    // Look up the target user
    const targetUser = await User.findOne({ pseudonym }).select("_id").lean();
    if (!targetUser) {
      return res.json({ emoji: null, type: null, mood: null, milestone: null });
    }

    // Did they check in today?
    const todayCheckIn = await CheckIn.findOne({
      user: targetUser._id,
      date: today,
    }).select("mood").lean();

    if (!todayCheckIn) {
      // No check-in today — no emoji to show
      return res.json({ emoji: null, type: null, mood: null, milestone: null });
    }

    // Calculate current streak to detect milestone
    const allCheckIns = await CheckIn.find({ user: targetUser._id })
      .sort({ date: -1 })
      .select("date")
      .lean();

    const dates         = allCheckIns.map((c) => c.date);
    const currentStreak = calcCurrentStreak(dates, today);
    const isMilestone   = MILESTONE_DAYS.includes(currentStreak);

    if (isMilestone) {
      return res.json({
        emoji:     MILESTONE_EMOJI[currentStreak],
        type:      "milestone",
        mood:      null,
        milestone: currentStreak,
      });
    }

    // Default: mood emoji
    const moodEmoji = MOOD_EMOJI[todayCheckIn.mood] || null;
    return res.json({
      emoji:     moodEmoji,
      type:      moodEmoji ? "mood" : null,
      mood:      moodEmoji ? todayCheckIn.mood : null,
      milestone: null,
    });
  } catch (error) {
    console.error("Avatar vibe error:", error.message);
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;