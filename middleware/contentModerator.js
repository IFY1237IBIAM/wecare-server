const https = require("https");

const CRISIS_KEYWORDS = [
  "suicide", "kill myself", "end my life", "want to die", "rather be dead",
  "self harm", "self-harm", "cut myself", "hurt myself", "overdose",
  "no reason to live", "can't go on", "give up on life",
  "nobody cares", "better off dead", "don't want to exist",
];

const callPerspective = (text) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.PERSPECTIVE_API_KEY;
    if (!apiKey) {
      return resolve(null);
    }

    const body = JSON.stringify({
      comment: { text },
      languages: ["en"],
      requestedAttributes: {
        TOXICITY: {},
        SEVERE_TOXICITY: {},
        THREAT: {},
        INSULT: {},
        IDENTITY_ATTACK: {},
        SPAM: {},
      },
    });

    const url = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
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
    toxicityScore: 0,
    autoReject: false,
  };

  // Crisis keywords — always checked locally
  const lower = text.toLowerCase();
  const crisisMatches = CRISIS_KEYWORDS.filter((k) => lower.includes(k));
  if (crisisMatches.length > 0) {
    result.crisisDetected = true;
    result.flags.push({ type: "crisis", keywords: crisisMatches });
  }

  // Perspective API check
  try {
    const response = await callPerspective(text);
    if (!response || !response.attributeScores) {
      console.log("Perspective API unavailable — skipping AI check");
      return result;
    }

    const scores = response.attributeScores;
    const toxicity = scores.TOXICITY?.summaryScore?.value || 0;
    const severeToxicity = scores.SEVERE_TOXICITY?.summaryScore?.value || 0;
    const threat = scores.THREAT?.summaryScore?.value || 0;
    const insult = scores.INSULT?.summaryScore?.value || 0;
    const identityAttack = scores.IDENTITY_ATTACK?.summaryScore?.value || 0;
    const spam = scores.SPAM?.summaryScore?.value || 0;

    result.toxicityScore = Math.round(toxicity * 100);

    console.log(`AI Scores — Toxicity: ${Math.round(toxicity * 100)}% | Threat: ${Math.round(threat * 100)}% | Spam: ${Math.round(spam * 100)}%`);

    if (severeToxicity > 0.7 || threat > 0.7) {
      result.autoReject = true;
      result.approved = false;
      result.bullyingDetected = true;
      result.flags.push({ type: "bullying", score: Math.round(severeToxicity * 100) });
    }

    if (toxicity > 0.85) {
      result.autoReject = true;
      result.approved = false;
      result.flags.push({ type: "toxic", score: Math.round(toxicity * 100) });
    }

    if (spam > 0.75) {
      result.autoReject = true;
      result.approved = false;
      result.spamDetected = true;
      result.flags.push({ type: "spam", score: Math.round(spam * 100) });
    }

    if (toxicity > 0.6 && !result.autoReject) {
      result.profanityDetected = true;
      result.flags.push({ type: "profanity", score: Math.round(toxicity * 100) });
    }

    if (identityAttack > 0.7) {
      result.autoReject = true;
      result.approved = false;
      result.flags.push({ type: "identity_attack", score: Math.round(identityAttack * 100) });
    }

  } catch (error) {
    console.error("Perspective API error:", error.message);
  }

  return result;
};