const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const DEFAULT_GROUPS = [
  { name: "Anxiety Support", topic: "Anxiety", description: "A safe space for those dealing with anxiety, panic attacks, and worry. You are not alone.", icon: "😮‍💨" },
  { name: "Heartbreak Heals", topic: "Heartbreak", description: "Share your pain, find comfort. Breakups and heartbreak are valid and healing takes time.", icon: "💔" },
  { name: "Overcoming Depression", topic: "Depression", description: "For those navigating the darkness of depression. This space holds no judgment — only support.", icon: "🌑" },
  { name: "Grief & Loss", topic: "Grief", description: "Processing the loss of a loved one, a relationship, or a dream. You don't have to grieve alone.", icon: "🕊️" },
  { name: "Self-Love Journey", topic: "Self-love", description: "Building self-worth, confidence and compassion for yourself. Small steps count.", icon: "🌸" },
  { name: "Trauma Survivors", topic: "Trauma", description: "A circle for those healing from past trauma. Speak when you're ready — we'll listen.", icon: "🛡️" },
  { name: "Finding Hope", topic: "Hope", description: "For those searching for a reason to keep going. Stories of resilience and small victories.", icon: "🌿" },
  { name: "Addiction Recovery", topic: "Addiction", description: "Recovery is not linear. Share your journey, your setbacks and your wins without judgment.", icon: "🔗" },
];

mongoose.connect(process.env.MONGO_URI, { family: 4 }).then(async () => {
  const Group = require("../models/Group");
  const User = require("../models/User");

  const admin = await User.findOne({ role: "admin" });
  if (!admin) { console.log("No admin found"); process.exit(1); }

  for (const g of DEFAULT_GROUPS) {
    const exists = await Group.findOne({ name: g.name });
    if (!exists) {
      await Group.create({
        ...g,
        creator: admin._id,
        creatorPseudonym: admin.pseudonym,
        members: [admin._id],
      });
      console.log(`✅ Created: ${g.name}`);
    } else {
      console.log(`⏭️ Already exists: ${g.name}`);
    }
  }

  console.log("✅ Done seeding groups");
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });