const BASE = "https://api.sarvam.ai";

// If a call fails with 4xx, check these against docs.sarvam.ai
export const CONFIG = {
  STT_MODEL: "saarika:v2.5",
  CHAT_MODEL: "sarvam-105b",
  TRANSLATE_MODEL: "mayura:v1",
  TTS_MODEL: "bulbul:v2",
  TTS_SPEAKER: "anushka",
};

function key() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY is missing in .env.local (restart the dev server after adding it)");
  return k;
}

async function call(path, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { "api-subscription-key": key(), ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Sarvam ${path} returned ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Sarvam ${path} timed out`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function stt(file) {
  const fd = new FormData();
  fd.append("file", file, "voice.wav");
  fd.append("model", CONFIG.STT_MODEL);
  fd.append("language_code", "unknown");
  return call("/speech-to-text", { method: "POST", body: fd });
}

async function chatOld(system, user, { max_tokens = 2000, temperature = 0.2 } = {}) {
  const data = await call("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      model: CONFIG.CHAT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens,
    }),
  });
  let t = data.choices?.[0]?.message?.content ?? "";
  t = t.replace(/<think>[\s\S]*?<\/think>/g, "");
  if (t.includes("</think>")) t = t.split("</think>").pop();
  return t.trim();
}

export async function translate(input, source, target) {
  const d = await call("/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input,
      source_language_code: source,
      target_language_code: target,
      model: CONFIG.TRANSLATE_MODEL,
    }),
  });
  if (!d.translated_text) throw new Error("Translate returned no text");
  return d.translated_text;
}

export async function tts(text, language) {
  const d = await call("/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_language_code: language,
      speaker: CONFIG.TTS_SPEAKER,
      model: CONFIG.TTS_MODEL,
    }),
  });
  const a = d.audios?.[0];
  if (!a) throw new Error("Text-to-speech returned no audio");
  return a;
}

export function parseJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no json");
  return JSON.parse(text.slice(s, e + 1));
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

// Splits text into API-sized chunks, remembering whether each chunk ends a paragraph
export function splitForApi(text, max = 450) {
  const out = [];
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  blocks.forEach((block, bi) => {
    const lastBlock = bi === blocks.length - 1;
    const push = (t, endOfBlock) => out.push({ t, sep: endOfBlock && !lastBlock ? "\n\n" : " " });
    const sentences = block.length <= max ? [block] : block.split(/(?<=[.!?।॥])\s+/);
    let cur = "";
    for (const s of sentences) {
      let piece = s;
      while (piece.length > max) {
        if (cur) { push(cur, false); cur = ""; }
        push(piece.slice(0, max), false);
        piece = piece.slice(max);
      }
      const joined = cur ? cur + " " + piece : piece;
      if (joined.length > max) { push(cur, false); cur = piece; }
      else cur = joined;
    }
    if (cur) push(cur, true);
  });
  return out;
}

export async function chat(system, user, { max_tokens = 5000, temperature = 0.2 } = {}) {
  const body = {
    model: CONFIG.CHAT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_tokens,
  };
  const send = (b) =>
    call("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify(b),
    });

  let data;
  try {
    data = await send({ ...body, reasoning_effort: "low" });
  } catch (e) {
    if (/ 400| 422/.test(e.message)) data = await send(body);
    else throw e;
  }

  const choice = data.choices?.[0];
  let t = choice?.message?.content ?? "";
  t = t.replace(/<think>[\s\S]*?<\/think>/g, "");
  if (t.includes("</think>")) t = t.split("</think>").pop();
  t = t.trim();
  if (!t) {
    throw new Error(
      `The model returned no text (finish_reason: ${choice?.finish_reason || "unknown"}). It may have spent its whole token budget on reasoning.`
    );
  }
  return t;
}
