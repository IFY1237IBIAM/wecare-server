// WeCare Smart Content Moderator
// No external API needed — works instantly, never goes down

const CRISIS_KEYWORDS = [
  "suicide", "kill myself", "end my life", "want to die", "rather be dead",
  "self harm", "self-harm", "cut myself", "hurt myself", "overdose",
  "no reason to live", "can't go on", "give up on life", "better off dead",
  "don't want to exist", "end it all", "take my own life", "not worth living",
  "goodbye forever", "final goodbye", "can't take it anymore", "disappear forever",
  "wrists", "pills to sleep", "jump off", "hang myself",
];

const BULLYING_PHRASES = [
  "kill yourself", "kys", "go die", "go kill yourself", "end yourself",
  "nobody likes you", "everyone hates you", "you're worthless", "you are worthless",
  "no one cares about you", "you're ugly", "you are ugly", "you're disgusting",
  "you are disgusting", "go away forever", "the world is better without you",
  "you're a waste", "you are a waste", "you don't deserve", "you deserved it",
  "pathetic loser", "stupid idiot", "fat pig", "you're nothing", "you are nothing",
];

const HATE_SPEECH = [
  "all [group] should die", "i hate [group]", "[slur]s should",
  "ethnic cleansing", "genocide", "white supremacy", "racial slur",
  // Common slurs omitted here but should be added in your actual implementation
];

const SEVERE_TOXICITY = [
  "i will kill you", "i will hurt you", "i know where you live",
  "you will pay for this", "i will find you", "watch your back",
  "i will make you suffer", "you are dead", "say your prayers",
];

const SPAM_PATTERNS = [
  /https?:\/\//gi,
  /www\.[a-z]+\.[a-z]+/gi,
  /\b(buy now|click here|free money|make money fast|earn \$|whatsapp me|telegram me|dm me|follow me|check my bio)\b/gi,
  /(.)\1{6,}/g,
  /\b\d{10,}\b/g,
  /[A-Z]{10,}/g,
];

const SELF_HARM_METHODS = [
  "how to cut", "how to overdose", "best way to die", "painless way to die",
  "how many pills", "lethal dose", "how to hang", "methods of suicide",
];

const PROFANITY = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt",
  "motherfucker", "fucker", "damn", "hell", "piss", "cock",
  "dick", "ass ", " ass", "wtf", "stfu",
];

const containsAny = (text, list) => {
  const lower = text.toLowerCase();
  return list.some((phrase) => lower.includes(phrase.toLowerCase()));
};

const matchesPattern = (text, patterns) => {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
};

exports.analyzeContent = async (text) => {
  const result = {
    approved: true,
    flags: [],
    crisisDetected: false,
    bullyingDetected: false,
    spamDetected: false,
    profanityDetected: false,
    severeThreatDetected: false,
    selfHarmMethodDetected: false,
    autoReject: false,
    toxicityScore: 0,
  };

  if (!text || text.trim().length === 0) return result;

  const lower = text.toLowerCase();

  // ── Crisis detection (allow but show resources) ──
  const crisisMatches = CRISIS_KEYWORDS.filter((k) => lower.includes(k.toLowerCase()));
  if (crisisMatches.length > 0) {
    result.crisisDetected = true;
    result.flags.push({ type: "crisis", keywords: crisisMatches });
  }

  // ── Self harm methods (auto reject) ──
  if (containsAny(text, SELF_HARM_METHODS)) {
    result.selfHarmMethodDetected = true;
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "self_harm_method" });
  }

  // ── Severe threats (auto reject) ──
  if (containsAny(text, SEVERE_TOXICITY)) {
    result.severeThreatDetected = true;
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "threat" });
  }

  // ── Bullying (auto reject) ──
  if (containsAny(text, BULLYING_PHRASES)) {
    result.bullyingDetected = true;
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "bullying" });
  }

  // ── Hate speech (auto reject) ──
  if (containsAny(text, HATE_SPEECH)) {
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "hate_speech" });
  }

  // ── Spam (auto reject) ──
  if (matchesPattern(text, SPAM_PATTERNS)) {
    result.spamDetected = true;
    result.autoReject = true;
    result.approved = false;
    result.flags.push({ type: "spam" });
  }

  // ── Profanity (flag only, don't reject — people in pain use strong language) ──
  if (containsAny(text, PROFANITY)) {
    result.profanityDetected = true;
    result.flags.push({ type: "profanity" });
  }

  // ── Toxicity score (rough estimate based on flags) ──
  let score = 0;
  if (result.crisisDetected) score += 20;
  if (result.profanityDetected) score += 20;
  if (result.bullyingDetected) score += 60;
  if (result.severeThreatDetected) score += 80;
  if (result.selfHarmMethodDetected) score += 70;
  if (result.spamDetected) score += 40;
  result.toxicityScore = Math.min(score, 100);

  // Log for monitoring
  if (result.flags.length > 0) {
    console.log(`🛡️ Content flagged — Types: ${result.flags.map(f => f.type).join(", ")} | Score: ${result.toxicityScore}% | AutoReject: ${result.autoReject}`);
  }

  return result;
};