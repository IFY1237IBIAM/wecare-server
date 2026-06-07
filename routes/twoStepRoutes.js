/**
 * routes/twoStepRoutes.js
 * Mount: app.use("/api/two-step", require("./routes/twoStepRoutes"));
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const ctrl    = require("../controllers/twoStepController");

router.get ("/status",     protect, ctrl.getTwoStepStatus);
router.post("/enable",     protect, ctrl.enableTwoStep);
router.post("/disable",    protect, ctrl.disableTwoStep);
router.post("/change-pin", protect, ctrl.changePin);

// No protect — user is not fully authenticated yet
router.post("/verify",  ctrl.verifyTwoStep);
router.post("/recover", ctrl.recoverTwoStep);

module.exports = router;