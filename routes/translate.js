import express from "express";
import crypto from "crypto";
import Translation from "../models/Translation.js";

const router = express.Router();

router.post("/translate", async (req, res) => {
  const { text, sourceLang, targetLang, detectOnly } = req.body;
  if (!text ||!targetLang) return res.status(400).json({ error: "Missing params" });

  const GOOGLE_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!GOOGLE_KEY) return res.status(500).json({ error: "Translation API key not set" });

  // Handle detect-only request using Google's detect API
  if (detectOnly) {
    try {
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2/detect?key=${GOOGLE_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text.substring(0, 100) })
      });
      const data = await r.json();
      const detected = data.data?.detections?.[0]?.[0]?.language || "en";
      return res.json({ sourceLang: detected });
    } catch {
      return res.json({ sourceLang: "en" });
    }
  }

  const hash = crypto.createHash("sha256").update(`${text}|${sourceLang}|${targetLang}`).digest("hex");

  // 1. Check cache
  let cached = await Translation.findOne({ hash });
  if (cached) return res.json({
    translatedText: cached.translated,
    sourceLang: cached.sourceLang,
    targetLang,
    skipped: true
  });

  // 2. Call Google Translate API if cache miss
  try {
    const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        ...(sourceLang && sourceLang !== "autodetect" ? { source: sourceLang } : {}),
        format: "text"
      })
    });

    const data = await r.json();

    if (data.error) {
      console.error("Google Translate error:", data.error);
      return res.status(502).json({ error: "Translation failed", detail: data.error.message });
    }

    const translated = data.data.translations[0].translatedText;
    const detected = data.data.translations[0].detectedSourceLanguage || sourceLang;

    // 3. Save to cache
    await Translation.create({
      hash,
      sourceLang: detected,
      targetLang,
      original: text,
      translated
    });

    res.json({
      translatedText: translated,
      sourceLang: detected,
      targetLang
    });
  } catch (e) {
    console.error("Server error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;