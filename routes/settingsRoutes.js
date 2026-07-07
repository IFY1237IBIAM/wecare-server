const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const settingsController = require("../controllers/settingsController");

router.use(protect);

router.get("/", settingsController.getSettings);
router.put("/", settingsController.updateSettings);
router.put("/change-password", settingsController.changePassword);
router.put("/change-email", settingsController.changeEmail);
router.delete("/delete-account", settingsController.deleteAccount);
router.post("/muted-keywords", settingsController.addMutedKeyword);
router.delete("/muted-keywords/:keyword", settingsController.removeMutedKeyword);
router.post("/block/:userId", settingsController.blockUser);
router.delete("/block/:userId", settingsController.unblockUser);
router.get("/blocked-users", settingsController.getBlockedUsers);
router.get("/report-history", settingsController.getReportHistory);

// ── Avatar Vibe Emoji privacy toggle ─────────────────────────────────────────
// PATCH /api/settings/vibe-emoji
// Toggles whether the requesting user's mood/milestone emoji is visible
// on their avatar to other users. No request body needed.
router.patch("/vibe-emoji", settingsController.toggleVibeEmoji);

module.exports = router;