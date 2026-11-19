import { NextResponse } from "next/server";
import { noStore, RequestLimitedError } from "@/lib/server/responses";
import { enforceAbuseLimit } from "@/lib/server/rate-limit";
import { adminClient } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 130;
const languages = new Set(["en", "pcm", "yo", "ha", "ig"]);
const replies: Record<string, string> = {
  en: "I can answer general questions about Signa. For polling unit updates, information is unavailable unless an approved public update exists. This does not mean the location is safe.",
  pcm: "I fit answer general questions about Signa. For polling unit update, information no dey available unless approved public update dey. This no mean say the place safe.",
  yo: "Mo lè dáhùn àwọn ìbéèrè gbogbogbò nípa Signa. Bí kò bá sí ìròyìn gbogbogbò tí a fọwọ́ sí, ìwífún kò sí. Èyí kò túmọ̀ sí pé ibi náà wà ní ààbò.",
  ha: "Zan iya amsa tambayoyi na gaba game da Signa. Idan babu sahihin bayani na jama'a, babu bayani. Wannan ba yana nufin wurin yana da aminci ba.",
  ig: "Enwere m ike ịza ajụjụ izugbe gbasara Signa. Ọ bụrụ na enweghị ozi ọha akwadoro, ozi adịghị. Nke a apụtaghị na ebe ahụ dị nchebe.",
};
export async function POST(req: Request) {
  try { await enforceAbuseLimit(req, "browser-voice", { scope: "voice", reporterMax: 10, ipMax: 20, windowSeconds: 600 }); }
  catch (error) {
    const limited = error instanceof RequestLimitedError;
    return NextResponse.json({ error: limited ? "Too many voice requests" : "Voice service is temporarily unavailable" }, { status: limited ? 429 : 503, headers: noStore });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 5_500_000) return NextResponse.json({ error: "Audio request is too large" }, { status: 413, headers: noStore });
  const apiKey = process.env.INTRON_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Speech service is not configured" }, { status: 503, headers: noStore });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  const language = form?.get("language");
  if (!(audio instanceof File) || audio.size < 1 || audio.size > 5 * 1024 * 1024 || !languages.has(String(language)))
    return NextResponse.json({ error: "Provide audio up to 5 MB and a supported language code" }, { status: 400, headers: noStore });
  const mime = audio.type.toLowerCase().split(";")[0].trim();
  const formats: Record<string, string> = { "audio/wav": "wav", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/webm": "webm", "audio/flac": "flac" };
  if (!formats[mime]) return NextResponse.json({ error: "Unsupported audio type" }, { status: 415, headers: noStore });
  const bytes = Buffer.from(await audio.arrayBuffer());
  const validSignature = mime === "audio/wav" ? bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE"
    : mime === "audio/mpeg" ? bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    : mime === "audio/mp4" || mime === "audio/x-m4a" ? bytes.toString("ascii", 4, 8) === "ftyp"
    : mime === "audio/ogg" ? bytes.toString("ascii", 0, 4) === "OggS"
    : mime === "audio/webm" ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    : mime === "audio/flac" ? bytes.toString("ascii", 0, 4) === "fLaC" : false;
  if (!validSignature) return NextResponse.json({ error: "Audio bytes do not match the declared format" }, { status: 415, headers: noStore });
  const request = new FormData();
  request.append("audio_file_name", `signa-enquiry.${formats[mime]}`);
  request.append("audio_file_blob", new Blob([bytes], { type: mime }), `enquiry.${formats[mime]}`);
  request.append("use_language_asr_input", String(language));
  request.append("use_category", "file_category_general");
  let stt;
  try {
    const response = await fetch("https://infer.voice.intron.io/file/v1/upload/sync", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: request, signal: AbortSignal.timeout(125_000) });
    if (!response.ok) return NextResponse.json({ error: "Speech recognition is temporarily unavailable" }, { status: 502, headers: noStore });
    stt = await response.json();
  } catch { return NextResponse.json({ error: "Speech recognition timed out or failed" }, { status: 502, headers: noStore }); }
  const transcript = String(stt.transcript ?? stt.transcription ?? stt.text ?? "").trim().slice(0, 4000);
  if (!transcript) return NextResponse.json({ error: "No speech was recognized" }, { status: 422, headers: noStore });
  const code = transcript.match(/\b[A-Z0-9][A-Z0-9-]{1,31}\b/i)?.[0]?.toUpperCase();
  let replyText: string;
  if (!code) replyText = replies[String(language)];
  else {
    const { data, error } = await adminClient().from("public_safe_updates").select("polling_unit_code,summary,public_date")
      .eq("polling_unit_code", code).eq("approved", true).lte("public_date", new Date().toISOString().slice(0, 10))
      .order("public_date", { ascending: false }).limit(3);
    if (error) return NextResponse.json({ error: "Approved public information is temporarily unavailable" }, { status: 503, headers: noStore });
    replyText = data?.length
      ? data.map((row) => `${row.polling_unit_code}, ${row.public_date}: ${row.summary}`).join(". ")
      : `Information is unavailable for polling unit ${code}. This does not mean the location is safe.`;
  }
  const ttsResponse = await fetch("https://infer.voice.intron.io/tts/v1/generate", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: replyText, voice_language: language, voice_accent: ({ en: "english", pcm: "pidgin", yo: "yoruba", ha: "hausa", ig: "igbo" } as Record<string, string>)[String(language)], voice_gender: "female", output_audio_format: "wav" }), signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!ttsResponse?.ok) return NextResponse.json({ error: "Speech response is temporarily unavailable", transcript }, { status: 502, headers: noStore });
  const ttsPayload = await ttsResponse.json().catch(() => null);
  const audioPath = ttsPayload?.data?.audio_path;
  if (typeof audioPath !== "string") return NextResponse.json({ error: "Speech provider returned no audio" }, { status: 502, headers: noStore });
  let audioUrl: URL;
  try { audioUrl = new URL(audioPath); } catch { return NextResponse.json({ error: "Invalid speech response" }, { status: 502, headers: noStore }); }
  if (audioUrl.protocol !== "https:" || !(audioUrl.hostname === "intron.io" || audioUrl.hostname.endsWith(".intron.io"))) return NextResponse.json({ error: "Untrusted speech response location" }, { status: 502, headers: noStore });
  const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(15_000), redirect: "error" }).catch(() => null);
  if (!audioResponse?.ok) return NextResponse.json({ error: "Could not retrieve speech response" }, { status: 502, headers: noStore });
  const audioBytes = await audioResponse.arrayBuffer();
  if (!audioBytes.byteLength || audioBytes.byteLength > 8 * 1024 * 1024) return NextResponse.json({ error: "Invalid speech response" }, { status: 502, headers: noStore });
  return new NextResponse(audioBytes, { headers: { ...noStore, "Content-Type": audioResponse.headers.get("content-type") || "audio/wav", "X-Signa-Transcript": encodeURIComponent(transcript), "X-Signa-Reply": encodeURIComponent(replyText), "X-Signa-Language": String(language) } });
}
