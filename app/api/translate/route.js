import { translate, splitForApi, mapLimit } from "../../../lib/sarvam";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { text, source, target } = await req.json();
    if (source === target) return Response.json({ translation: text });
    const chunks = splitForApi(text);
    const parts = await mapLimit(chunks, 3, (c) => translate(c.t, source, target));
    const translation = parts.map((p, i) => p + (i < chunks.length - 1 ? chunks[i].sep : "")).join("");
    return Response.json({ translation });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
