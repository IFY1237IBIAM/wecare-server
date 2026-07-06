// HushCircle Smart Content Moderator

const CRISIS_KEYWORDS = [
  "suicide", "kill myself", "end my life", "want to die", "rather be dead",
  "self harm", "self-harm", "cut myself", "hurt myself", "overdose",
  "no reason to live", "can't go on", "give up on life", "better off dead",
  "don't want to exist", "end it all", "take my own life", "not worth living",
  "goodbye forever", "final goodbye", "can't take it anymore", "disappear forever",
  "wrists", "pills to sleep", "jump off", "hang myself",
  "don't want to be here", "wish i was dead", "want it to stop",
  "tired of living", "life is not worth", "no point in living",
  "want to disappear", "wish i could disappear", "rather not exist",
  "ending it", "done with life", "can't do this anymore",
  "no way out", "there is no hope", "nothing left to live for",
  "want to sleep forever", "never wake up", "painless death",
];

const BULLYING_PHRASES = [
  "kill yourself", "kys", "go die", "go kill yourself", "end yourself",
  "nobody likes you", "everyone hates you", "you're worthless", "you are worthless",
  "no one cares about you", "you're ugly", "you are ugly", "you're disgusting",
  "you are disgusting", "go away forever", "the world is better without you",
  "you're a waste", "you are a waste", "you don't deserve", "you deserved it",
  "pathetic loser", "stupid idiot", "fat pig", "you're nothing", "you are nothing",
  "you should die", "i hate you so much", "everyone despises you",
  "you're pathetic", "you are pathetic", "such a loser", "what a loser",
  "ugly freak", "you're a freak", "you are a freak", "nobody wants you",
  "you make me sick", "you're repulsive", "you are repulsive",
];

const SEVERE_TOXICITY = [
  "i will kill you", "i will hurt you", "i know where you live",
  "you will pay for this", "i will find you", "watch your back",
  "i will make you suffer", "you are dead", "say your prayers",
  "i want to kill someone", "i want to kill", "going to kill",
  "gonna kill", "want to kill", "going to hurt someone",
  "gonna hurt", "i will shoot", "i will stab", "i will attack",
  "going to attack", "want to hurt someone", "i want to harm",
  "going to harm", "will destroy you", "make you pay",
  "you will suffer", "i will end you", "going to end you",
];

const SELF_HARM_METHODS = [
  "how to cut", "how to overdose", "best way to die", "painless way to die",
  "how many pills", "lethal dose", "how to hang", "methods of suicide",
  "how to kill myself", "ways to die", "easiest way to die",
  "quickest way to die", "how to end my life", "suicide methods",
  "how to hurt myself", "how to harm myself", "self harm methods",
  "where to cut", "how deep to cut", "how to slit",
];

const HATE_SPEECH = [
  "ethnic cleansing", "genocide is good", "white supremacy",
  "all [group] should die", "race war", "exterminate",
  "final solution", "master race", "fuck you"
];

const SPAM_PATTERNS = [
  /https?:\/\//gi,
  /www\.[a-z]+\.[a-z]+/gi,
  /\b(buy now|click here|free money|make money fast|earn \$|whatsapp me|telegram me|dm me|follow me|check my bio|join my|sign up now|limited offer|act now|cash out)\b/gi,
  /(.)\1{6,}/g,
  /\b\d{10,}\b/g,
  /[A-Z]{10,}/g,
];

const PROFANITY = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt",
  "motherfucker", "fucker", "piss", "cock",
  "dick", "wtf", "stfu",
];

const containsAny = (text, list) => {
  const lower = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return list.some((phrase) => {
    const normalizedPhrase = phrase
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return lower.includes(normalizedPhrase);
  });
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

  // ── Crisis detection (allow but show resources) ──
  const crisisMatches = CRISIS_KEYWORDS.filter((k) =>
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .includes(k.toLowerCase().replace(/[^a-z0-9\s]/g, " "))
  );
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

  // ── Profanity (flag only, don't reject) ──
  if (containsAny(text, PROFANITY)) {
    result.profanityDetected = true;
    result.flags.push({ type: "profanity" });
  }

  // ── Toxicity score ──
  let score = 0;
  if (result.crisisDetected) score += 20;
  if (result.profanityDetected) score += 20;
  if (result.bullyingDetected) score += 60;
  if (result.severeThreatDetected) score += 80;
  if (result.selfHarmMethodDetected) score += 70;
  if (result.spamDetected) score += 40;
  result.toxicityScore = Math.min(score, 100);

  if (result.flags.length > 0) {
    console.log(`🛡️ Flagged — Types: ${result.flags.map((f) => f.type).join(", ")} | Score: ${result.toxicityScore}% | AutoReject: ${result.autoReject}`);
  }

  return result;
};