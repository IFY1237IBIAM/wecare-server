const Filter = require("bad-words");
const filter = new Filter();

const CRISIS_KEYWORDS = [
  "suicide", "kill myself", "end my life", "want to die", "rather be dead",
  "self harm", "self-harm", "cut myself", "hurt myself", "overdose",
  "no reason to live", "can't go on", "give up on life", "worthless",
  "nobody cares", "better off dead", "don't want to exist",
];

const BULLYING_KEYWORDS = [
  "you're worthless", "nobody likes you", "kill yourself", "kys",
  "you're ugly", "loser", "freak", "disgusting", "pathetic",
  "go die", "no one cares about you", "fuck you",
];

const SPAM_PATTERNS = [
  /https?:\/\//gi,
  /\b(buy now|click here|free money|make money fast|earn \$|whatsapp me)\b/gi,
  /(.)\1{5,}/g,
];

exports.analyzeContent = (text) => {
  const lower = text.toLowerCase();
  const result = {
    approved: true,
    flags: [],
    crisisDetected: false,
    bullyingDetected: false,
    spamDetected: false,
    profanityDetected: false,
    autoReject: false,
  };

  const crisisMatches = CRISIS_KEYWORDS.filter((k) => lower.includes(k));
  if (crisisMatches.length > 0) {
    result.crisisDetected = true;
    result.flags.push({ type: "crisis", keywords: crisisMatches });
  }

  const bullyingMatches = BULLYING_KEYWORDS.filter((k) => lower.includes(k));
  if (bullyingMatches.length > 0) {
    result.bullyingDetected = true;
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "bullying", keywords: bullyingMatches });
  }

  const spamMatches = SPAM_PATTERNS.filter((p) => p.test(text));
  if (spamMatches.length > 0) {
    result.spamDetected = true;
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "spam" });
  }

  try {
    if (filter.isProfane(text)) {
      result.profanityDetected = true;
      result.flags.push({ type: "profanity" });
    }
  } catch (e) {}

  return result;
};