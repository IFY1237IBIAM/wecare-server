const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const CheckIn = require("../models/CheckIn");
const NotificationToken = require("../models/NotificationToken");
const { Expo } = require("expo-server-sdk");

const expo = new Expo();

// ─── Milestone config ────────────────────────────────────────────────────────
const MILESTONES = [3, 7, 14, 30, 60, 100];

const MILESTONE_MESSAGES = {
  3:   { title: "3-Day Streak 🌱",            body: "You've checked in 3 days in a row. Small steps matter — keep going 💜" },
  7:   { title: "One Week Strong 🔥",          body: "7 days of showing up for yourself. That's a whole week of courage. You're doing amazing 💜" },
  14:  { title: "Two Weeks! 💪",                body: "14 days straight. You've made checking in a real habit. HushCircle is proud of you 💜" },
  30:  { title: "30-Day Milestone 🌟",          body: "A full month of daily check-ins. That's extraordinary self-care. You should feel proud 💜" },
  60:  { title: "60 Days — You're Unstoppable 🚀", body: "Two months of showing up for yourself every single day. This community is so lucky to have you 💜" },
  100: { title: "100 Days! 👑 Legendary",       body: "ONE HUNDRED days. You are an inspiration. Thank you for being part of HushCircle 💜" },
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
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

// ─── Push notification helper ────────────────────────────────────────────────

async function sendStreakPushNotification(userId, milestone) {
  try {
    const msg = MILESTONE_MESSAGES[milestone];
    if (!msg) return;

    const tokenDocs = await NotificationToken.find({ user: userId }).select("expoPushToken");
    if (!tokenDocs.length) return;

    const validTokens = tokenDocs
      .map((t) => t.expoPushToken)
      .filter((token) => Expo.isExpoPushToken(token));

    if (!validTokens.length) return;

    const messages = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: msg.title,
      body: msg.body,
      data: { type: "streak_milestone", milestone, screen: "CheckIn" },
      priority: "high",
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try { await expo.sendPushNotificationsAsync(chunk); }
      catch (e) { console.log("Streak push chunk error:", e.message); }
    }

    console.log(`✅ Streak milestone (${milestone} days) sent to ${validTokens.length} device(s) for user ${userId}`);
  } catch (err) {
    console.error("Streak push notification error:", err.message);
  }
}

// ─── Streak calculation ───────────────────────────────────────────────────────

function calcStreaks(dates, referenceToday) {
  if (!dates.length) return { currentStreak: 0, longestStreak: 0 };

  const today     = referenceToday;
  const yesterday = addDays(referenceToday, -1);

  let currentStreak = 0;
  let checkDate = (dates[0] === today || dates[0] === yesterday) ? dates[0] : null;

  if (checkDate) {
    currentStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const expectedPrev = addDays(checkDate, -1);
      if (dates[i] === expectedPrev) {
        currentStreak++;
        checkDate = expectedPrev;
      } else {
        break;
      }
    }
  }

  let longestStreak = dates.length ? 1 : 0;
  let running = 1;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === addDays(dates[i - 1], -1)) {
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
    const { mood, note, localDate } = req.body;
    if (!mood) return res.status(400).json({ message: "Mood is required" });

    const today = isValidDateString(localDate) ? localDate : serverUTCDateFallback();

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

    const allCheckIns = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .select("date");

    const dates = allCheckIns.map((c) => c.date);
    const { currentStreak, longestStreak } = calcStreaks(dates, today);

    const hitMilestone = MILESTONES.includes(currentStreak);
    if (hitMilestone) {
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
    const { localDate } = req.query;
    const today = isValidDateString(localDate) ? localDate : serverUTCDateFallback();

    const checkIn = await CheckIn.findOne({ user: req.user._id, date: today });
    return res.json({ checkIn: checkIn || null, today });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/checkin/history ─────────────────────────────────────────────────

router.get("/history", protect, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip  = (page - 1) * limit;

    const [history, total] = await Promise.all([
      CheckIn.find({ user: req.user._id })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      CheckIn.countDocuments({ user: req.user._id }),
    ]);

    return res.json({
      checkIns: history,
      page,
      limit,
      total,
      hasMore: skip + history.length < total,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/checkin/streak ──────────────────────────────────────────────────

router.get("/streak", protect, async (req, res) => {
  try {
    const { localDate } = req.query;
    const today = isValidDateString(localDate) ? localDate : serverUTCDateFallback();

    const checkIns = await CheckIn.find({ user: req.user._id })
      .sort({ date: -1 })
      .select("date mood");

    if (!checkIns.length) {
      return res.json({ currentStreak: 0, longestStreak: 0, totalDays: 0 });
    }

    const dates = checkIns.map((c) => c.date);
    const { currentStreak, longestStreak } = calcStreaks(dates, today);

    return res.json({ currentStreak, longestStreak, totalDays: checkIns.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/checkin/circle-pulse ───────────────────────────────────────────
// Query: ?localDate=YYYY-MM-DD
//
// For each circle (Group) the requesting user belongs to, aggregates today's
// anonymous check-in moods from all members who checked in.
// Returns an array of pulse cards — one per circle that has at least one
// check-in today — sorted by totalCheckIns descending.
//
// Response shape:
// {
//   pulses: [
//     {
//       groupId:        string,
//       groupName:      string,
//       groupIcon:      string,
//       totalCheckIns:  number,
//       dominantMood:   string,   // mood key with highest count
//       moodCounts: {             // only moods with count > 0
//         hope: 3, calm: 1, ...
//       }
//     },
//     ...
//   ]
// }
//
// Privacy: no user IDs, pseudonyms, or notes are ever returned — only
// aggregate counts per mood per group.

router.get("/circle-pulse", protect, async (req, res) => {
  try {
    const { localDate } = req.query;
    const today = isValidDateString(localDate) ? localDate : serverUTCDateFallback();

    // Lazy-require Group here to avoid a circular-dependency risk if this
    // router is loaded before the Group model is registered.
    const Group = require("../models/Group");

    // Find every group this user is a member of.
    // Group.members is an array of ObjectIds (or embedded docs with a user field —
    // we handle both shapes below).
    const groups = await Group.find({ members: req.user._id })
      .select("_id name icon members")
      .lean();

    if (!groups.length) {
      return res.json({ pulses: [] });
    }

    // Build a map: groupId → { groupName, groupIcon, memberIds[] }
    const groupMap = {};
    for (const g of groups) {
      // members[] can be an array of ObjectIds OR embedded objects with a
      // `user` field (e.g. { user: ObjectId, role: "..." }).
      // Normalise to a flat array of ObjectId strings.
      const memberIds = (g.members || []).map((m) =>
        m && typeof m === "object" && m.user ? m.user : m
      );
      groupMap[g._id.toString()] = {
        groupName: g.name,
        groupIcon: g.icon || "💜",
        memberIds,
      };
    }

    // Collect the complete flat set of member IDs across all groups so we can
    // fetch all relevant check-ins in a single DB query instead of N queries.
    const allMemberIdSet = new Set();
    for (const { memberIds } of Object.values(groupMap)) {
      memberIds.forEach((id) => allMemberIdSet.add(id.toString()));
    }
    const allMemberIds = [...allMemberIdSet];

    // Single query: all check-ins for today across every relevant member.
    const todayCheckIns = await CheckIn.find({
      user: { $in: allMemberIds },
      date: today,
    })
      .select("user mood")
      .lean();

    // Index by userId → mood for O(1) lookup.
    const userMoodMap = {};
    for (const ci of todayCheckIns) {
      userMoodMap[ci.user.toString()] = ci.mood;
    }

    const MOOD_KEYS = ["heartbreak", "fear", "sadness", "struggle", "hope", "joy", "calm"];

    // Build a pulse card for each group.
    const pulses = [];

    for (const [groupId, { groupName, groupIcon, memberIds }] of Object.entries(groupMap)) {
      const moodCounts = {};
      let totalCheckIns = 0;

      for (const memberId of memberIds) {
        const mood = userMoodMap[memberId.toString()];
        if (mood) {
          totalCheckIns++;
          moodCounts[mood] = (moodCounts[mood] || 0) + 1;
        }
      }

      // Skip circles with no check-ins today — nothing to show.
      if (totalCheckIns === 0) continue;

      // Dominant mood = highest count; tie-break by MOOD_KEYS order.
      let dominantMood = null;
      let dominantCount = 0;
      for (const key of MOOD_KEYS) {
        if ((moodCounts[key] || 0) > dominantCount) {
          dominantCount = moodCounts[key];
          dominantMood = key;
        }
      }

      pulses.push({
        groupId,
        groupName,
        groupIcon,
        totalCheckIns,
        dominantMood,
        moodCounts,
      });
    }

    // Sort: most active circles first.
    pulses.sort((a, b) => b.totalCheckIns - a.totalCheckIns);

    return res.json({ pulses });
  } catch (error) {
    console.error("Circle pulse error:", error.message);
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;