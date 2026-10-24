import { stt } from "../../../lib/sarvam";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) throw new Error("No audio received");
    const data = await stt(file);
    return Response.json({ transcript: data.transcript || "", language: data.language_code || null });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
