import express from "express";
import crypto from "crypto";
import Translation from "../models/Translation.js";

const router = express.Router();

router.post("/translate", async (req, res) => {
  const { text, sourceLang, targetLang, detectOnly } = req.body;
  if (!text || !targetLang) return res.status(400).json({ error: "Missing params" });

  // Handle detect-only request first
  if (detectOnly) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 100))}&langpair=autodetect|${targetLang}`;
      const r = await fetch(url);
      const data = await r.json();
      const detected = data.responseData?.detectedLanguage || "en";
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

  // 2. Call MyMemory if cache miss
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang || "autodetect"}|${targetLang}`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.responseStatus !== 200) return res.status(502).json({ error: "Translation failed" });

    const translated = data.responseData.translatedText;
    const detected = data.responseData.detectedLanguage || sourceLang;

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
    res.status(500).json({ error: "Server error" });
  }
});

export default router;