import { chat, parseJson } from "../../../lib/sarvam";
import { extractPrompt, draftPrompt } from "../../../lib/prompts";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { transcript, letterType, profile = {} } = await req.json();
    if (!transcript?.trim()) throw new Error("Nothing to write about yet");

    const provided = JSON.stringify({
      name: profile.name || null,
      address: profile.address || null,
      writing_to: profile.recipient || null,
    });

    const raw = await chat(
      extractPrompt(letterType) +
        '\n- Also add a field "input_language": the English name of the language(s) the speaker used, for example "Tamil" or "Hinglish".',
      `User-provided details: ${provided}\n\nTranscript:\n"""\n${transcript}\n"""`,
      { temperature: 0 }
    );

    let facts;
    try {
      facts = parseJson(raw);
    } catch {
      facts = { issue_summary: transcript, missing_fields: [] };
    }
    if (!Array.isArray(facts.missing_fields)) facts.missing_fields = [];

    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const letter = await chat(
      draftPrompt({ letterType, languageName: "English", today }),
      `Facts (JSON):\n${JSON.stringify(facts, null, 2)}`
    );

    return Response.json({ facts, letter });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
