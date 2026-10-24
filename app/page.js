"use client";
import { useEffect, useRef, useState } from "react";

const LETTER_TYPES = [
  "Electricity bill complaint",
  "Ration card issue",
  "School leave application",
  "RTI request",
  "Water supply or sanitation complaint",
  "Custom (describe it)",
];

const LANGS = [
  { code: "hi-IN", label: "हिन्दी · Hindi" },
  { code: "en-IN", label: "English" },
  { code: "ta-IN", label: "தமிழ் · Tamil" },
  { code: "te-IN", label: "తెలుగు · Telugu" },
  { code: "bn-IN", label: "বাংলা · Bengali" },
  { code: "mr-IN", label: "मराठी · Marathi" },
  { code: "gu-IN", label: "ગુજરાતી · Gujarati" },
  { code: "kn-IN", label: "ಕನ್ನಡ · Kannada" },
  { code: "ml-IN", label: "മലയാളം · Malayalam" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ · Punjabi" },
  { code: "od-IN", label: "ଓଡ଼ିଆ · Odia" },
];
const SUPPORTED = new Set(LANGS.map((l) => l.code));
const langLabel = (c) => LANGS.find((l) => l.code === c)?.label || c;

const EXAMPLES = [
  { label: "Tamil · electricity", type: LETTER_TYPES[0], text: "என் வீட்டுல போன மூணு மாசமா மின்சார பில் ரொம்ப அதிகமா வருது, மீட்டர்ல பிரச்சனை இருக்கும்னு நினைக்கிறேன். பில் ஆயிரத்து எண்ணூறு ரூபாய் வந்திருக்கு." },
  { label: "Hinglish · school leave", type: LETTER_TYPES[2], text: "Mere beta Rohan ko bukhar hai, usko teen din ki chhutti chahiye. Woh class 6 B mein padhta hai." },
  { label: "Hindi · ration card", type: LETTER_TYPES[1], text: "मेरे राशन कार्ड में मेरी पत्नी का नाम नहीं है। मैंने दो महीने पहले आवेदन किया था लेकिन अभी तक कुछ नहीं हुआ।" },
];

const FACT_LABELS = [
  ["sender_name", "Name"], ["sender_address", "Address"], ["recipient_authority", "Writing to"],
  ["issue_summary", "Issue"], ["key_dates", "Dates"], ["amounts", "Amounts"],
  ["reference_numbers", "Reference numbers"], ["requested_action", "Your request"],
];
const fmt = (v) => (Array.isArray(v) ? v.join(", ") : v || "");

const STEPS = [["stt", "Listening"], ["letter", "Drafting"], ["translate", "Translating"], ["tts", "Speaking"]];
const MAX_SECONDS = 45;

async function parse(res) {
  let j;
  try { j = await res.json(); } catch { throw new Error("The server returned an unexpected response."); }
  if (!res.ok || j.error) throw new Error(j.error || "Request failed");
  return j;
}
const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(parse);

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

// Browsers record webm/mp4; converting to 16 kHz mono WAV avoids format problems with the API
async function blobToWav(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const rendered = await off.startRendering();
  ctx.close();
  return encodeWav(rendered.getChannelData(0), 16000);
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name; a.click();
}

function ChunkPlayer({ audios }) {
  const ref = useRef(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setI(0); setPlaying(false); }, [audios]);
  useEffect(() => { if (playing && ref.current) ref.current.play().catch(() => setPlaying(false)); }, [i, playing]);
  return (
    <div className="player">
      <button className="btn dark" onClick={() => { if (playing) { ref.current.pause(); setPlaying(false); } else setPlaying(true); }}>
        {playing ? "❚❚ Pause" : "▶ Listen to your letter"}
      </button>
      <span>part {i + 1} of {audios.length}</span>
      <audio ref={ref} src={`data:audio/wav;base64,${audios[i]}`}
        onEnded={() => { if (i < audios.length - 1) setI(i + 1); else { setPlaying(false); setI(0); } }} />
    </div>
  );
}

function Stepper({ step, showStt }) {
  const list = STEPS.filter(([k]) => showStt || k !== "stt");
  const idx = list.findIndex(([k]) => k === step);
  return (
    <ol className="stepper">
      {list.map(([k, l], i) => <li key={k} className={i < idx ? "done" : i === idx ? "active" : ""}>{l}</li>)}
    </ol>
  );
}

export default function Home() {
  const [letterType, setLetterType] = useState(LETTER_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [profile, setProfile] = useState({ name: "", address: "", recipient: "" });
  const [mode, setMode] = useState("speak");
  const [typed, setTyped] = useState("");
  const [letterLang, setLetterLang] = useState("en-IN");
  const [readLang, setReadLang] = useState("auto");

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState(null);
  const [fills, setFills] = useState({});

  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const extrasRef = useRef({});

  const effectiveType = () =>
    letterType.startsWith("Custom") ? customType.trim() || "General formal application" : letterType;

  function stopRecording() {
    clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  }
  useEffect(() => { if (recording && seconds >= MAX_SECONDS) stopRecording(); }, [seconds, recording]);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const wav = await blobToWav(new Blob(chunksRef.current, { type: rec.mimeType }));
          setAudioBlob(wav);
          setAudioUrl(URL.createObjectURL(wav));
        } catch {
          setError("I couldn't process that recording. Please try again, or type instead.");
        }
      };
      rec.start();
      recRef.current = rec;
      setAudioBlob(null); setAudioUrl(""); setSeconds(0); setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone access was blocked. Allow it in the address bar, or switch to typing.");
    }
  }

  async function runPipeline(text, base, spoken) {
    setStep("letter");
    const lr = await post("/api/letter", { transcript: text, letterType: effectiveType(), letterLanguage: letterLang, profile });
    const target = readLang === "auto" ? (SUPPORTED.has(spoken) ? spoken : "hi-IN") : readLang;
    let res = { transcript: base, spoken, facts: lr.facts, letter: lr.letter, target, translation: null, audios: null };
    setResult(res);
    try {
      let speakText = lr.letter;
      if (target !== letterLang) {
        setStep("translate");
        const tr = await post("/api/translate", { text: lr.letter, source: letterLang, target });
        res = { ...res, translation: tr.translation };
        setResult(res);
        speakText = tr.translation;
      }
      setStep("tts");
      const sp = await post("/api/tts", { text: speakText, language: target });
      res = { ...res, audios: sp.audios };
      setResult(res);
    } catch (e) {
      setNotice("Your letter is ready, but the translation or voice step failed: " + e.message);
    }
    setStep("");
  }

  async function generate() {
    setError(""); setNotice(""); setResult(null); setFills({}); extrasRef.current = {};
    setBusy(true);
    try {
      let text = typed, spoken = null;
      if (mode === "speak") {
        if (!audioBlob) throw new Error("Please record your problem first, or switch to typing.");
        setStep("stt");
        const fd = new FormData();
        fd.append("file", audioBlob, "voice.wav");
        const j = await parse(await fetch("/api/stt", { method: "POST", body: fd }));
        text = j.transcript || ""; spoken = j.language;
        if (!text.trim()) throw new Error("I couldn't hear any speech. Try again a little closer to the mic.");
      } else if (!typed.trim()) {
        throw new Error("Please describe your problem first.");
      }
      await runPipeline(text, text, spoken);
    } catch (e) {
      setError(e.message); setStep("");
    }
    setBusy(false);
  }

  async function updateLetter() {
    const clean = Object.fromEntries(Object.entries(fills).filter(([, v]) => v.trim()));
    if (!Object.keys(clean).length) return;
    extrasRef.current = { ...extrasRef.current, ...clean };
    const extra = Object.entries(extrasRef.current).map(([k, v]) => `- ${k}: ${v}`).join("\n");
    setError(""); setNotice(""); setFills({}); setBusy(true);
    try {
      await runPipeline(result.transcript + "\n\nAdditional details provided by the user:\n" + extra, result.transcript, result.spoken);
    } catch (e) { setError(e.message); setStep(""); }
    setBusy(false);
  }

  const shownFacts = result ? FACT_LABELS.filter(([k]) => fmt(result.facts?.[k])) : [];
  const missing = result?.facts?.missing_fields || [];

  return (
    <>
      <header className="top">
        <div className="brand"><span className="mark">मु</span><span>Munshi</span></div>
        <a className="pill" href="#how">How it works</a>
      </header>

      <main>
        <section className="hero">
          <h1>Speak in your language. <em>Write like an officer.</em></h1>
          <p>Tell Munshi your problem in any Indian language. It writes a proper formal letter, then reads it back in your own language so you can check it says what you meant.</p>
          <div className="chips">
            <span className="chip">11 languages</span>
            <span className="chip">Voice or typing</span>
            <span className="chip">Read-back to verify</span>
            <span className="chip">Powered by Sarvam AI</span>
          </div>
        </section>

        <section className="workspace">
          <div className="card">
            <h2>Your problem</h2>

            <div className="field">
              <label className="label">What kind of letter?</label>
              <select value={letterType} onChange={(e) => setLetterType(e.target.value)}>
                {LETTER_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              {letterType.startsWith("Custom") && (
                <input style={{ marginTop: 8 }} placeholder="e.g. Complaint about a broken street light"
                  value={customType} onChange={(e) => setCustomType(e.target.value)} />
              )}
            </div>

            <div className="field">
              <label className="label">About you (optional)</label>
              <div className="row">
                <input placeholder="Your full name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                <input placeholder="Writing to (office / person)" value={profile.recipient} onChange={(e) => setProfile({ ...profile, recipient: e.target.value })} />
              </div>
              <input style={{ marginTop: 10 }} placeholder="Your address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            </div>

            <div className="field">
              <label className="label">Tell us what happened</label>
              <div className="tabs">
                <button className={mode === "speak" ? "on" : ""} onClick={() => setMode("speak")}>🎙 Speak</button>
                <button className={mode === "type" ? "on" : ""} onClick={() => setMode("type")}>⌨ Type</button>
              </div>

              {mode === "speak" ? (
                <div className="recorder">
                  <button className={"rec" + (recording ? " live" : "")} onClick={recording ? stopRecording : startRecording}
                    aria-label={recording ? "Stop recording" : "Start recording"}>
                    {recording ? "■" : "🎙"}
                  </button>
                  <div className="hint">
                    {recording ? `Recording… ${seconds}s (max ${MAX_SECONDS}s). Tap to stop.`
                      : audioUrl ? "Recorded. Listen back, or tap the mic to record again."
                      : "Tap the mic and speak in any Indian language."}
                  </div>
                  {audioUrl && !recording && <audio controls src={audioUrl} style={{ width: "100%" }} />}
                </div>
              ) : (
                <>
                  <textarea placeholder="Describe the problem in any language…" value={typed} onChange={(e) => setTyped(e.target.value)} />
                  <div className="examples">
                    {EXAMPLES.map((ex) => (
                      <button key={ex.label} className="ex" onClick={() => { setTyped(ex.text); setLetterType(ex.type); }}>{ex.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="field row">
              <div>
                <label className="label">Letter language</label>
                <select value={letterLang} onChange={(e) => setLetterLang(e.target.value)}>
                  <option value="en-IN">English</option>
                  <option value="hi-IN">हिन्दी · Hindi</option>
                </select>
              </div>
              <div>
                <label className="label">Read it back in</label>
                <select value={readLang} onChange={(e) => setReadLang(e.target.value)}>
                  <option value="auto">Same language I spoke</option>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <button className="btn full" onClick={generate} disabled={busy || recording}>
              {busy ? "Working…" : "Write my letter"}
            </button>
          </div>

          <div className="card">
            <h2>Your letter</h2>
            {error && <div className="banner err">{error}</div>}
            {notice && <div className="banner warn">{notice}</div>}
            {busy && <Stepper step={step} showStt={mode === "speak"} />}

            {!result && !busy && !error && (
              <div className="empty"><div className="big">✉️</div><p>Your letter will appear here, with a spoken read-back in your language.</p></div>
            )}

            {result && (
              <>
                <div className="sec">
                  <h3>{mode === "speak" ? "What I heard" : "What you wrote"}{result.spoken ? ` · ${langLabel(result.spoken)}` : ""}</h3>
                  <div className="quote">{result.transcript}</div>
                </div>

                {shownFacts.length > 0 && (
                  <div className="sec">
                    <h3>Details I picked up. Please check these.</h3>
                    <table className="facts"><tbody>
                      {shownFacts.map(([k, l]) => <tr key={k}><td>{l}</td><td>{fmt(result.facts[k])}</td></tr>)}
                    </tbody></table>
                  </div>
                )}

                {missing.length > 0 && (
                  <div className="sec fillbox">
                    <h3>A few details would make this stronger</h3>
                    {missing.map((m) => (
                      <div className="field" key={m}>
                        <input placeholder={m} value={fills[m] || ""} onChange={(e) => setFills({ ...fills, [m]: e.target.value })} />
                      </div>
                    ))}
                    <button className="btn ghost" onClick={updateLetter} disabled={busy}>Update letter</button>
                  </div>
                )}

                <div className="sec">
                  <h3>Formal letter · {letterLang === "hi-IN" ? "Hindi" : "English"}</h3>
                  <div className="letter printable">{result.letter}</div>
                  <div className="actions">
                    <button className="btn ghost" onClick={() => navigator.clipboard.writeText(result.letter)}>Copy</button>
                    <button className="btn ghost" onClick={() => download("letter.txt", result.letter)}>Download .txt</button>
                    <button className="btn ghost" onClick={() => window.print()}>Print</button>
                  </div>
                </div>

                {result.translation && (
                  <div className="sec">
                    <h3>In your language · {langLabel(result.target)}</h3>
                    <div className="letter">{result.translation}</div>
                  </div>
                )}

                {result.audios && (
                  <div className="sec">
                    <h3>Read-back</h3>
                    <ChunkPlayer audios={result.audios} />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section id="how" className="how">
          <h2>How Munshi works</h2>
          <div className="how-grid">
            <div className="how-item"><b>1</b><h3>You speak</h3><p>Record in your own language, even if you mix two. No typing needed.</p></div>
            <div className="how-item"><b>2</b><h3>It understands</h3><p>Names, dates, amounts and reference numbers are pulled out for you to check.</p></div>
            <div className="how-item"><b>3</b><h3>It writes</h3><p>A short, respectful formal letter in English or Hindi, ready to print.</p></div>
            <div className="how-item"><b>4</b><h3>It reads back</h3><p>You hear the letter in your language, so you know exactly what you are signing.</p></div>
          </div>
        </section>
      </main>

      <footer>Built for a hackathon with Sarvam AI. Always review a letter before sending it.</footer>
    </>
  );
}