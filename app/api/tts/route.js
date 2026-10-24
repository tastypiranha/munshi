import { tts, splitForApi, mapLimit } from "../../../lib/sarvam";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { text, language } = await req.json();
    const chunks = splitForApi(text);
    const audios = await mapLimit(chunks, 3, (c) => tts(c.t, language));
    return Response.json({ audios });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
