"use client";

import { useRef, useState } from "react";

const options = [
  ["en", "English"], ["pcm", "Nigerian Pidgin"], ["yo", "Yoruba"], ["ha", "Hausa"], ["ig", "Igbo"],
];

export default function VoiceEnquiryPage() {
  const [language, setLanguage] = useState("en");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    setError(""); setTranscript(""); setReply("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.current = instance; chunks.current = [];
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      instance.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: instance.mimeType });
        if (blob.size > 5 * 1024 * 1024) { setError("Audio is over the 5 MB limit."); return; }
        setBusy(true);
        try {
          const form = new FormData(); form.append("audio", blob, "enquiry.webm"); form.append("language", language);
          const response = await fetch("/api/voice/turn", { method: "POST", body: form });
          if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Voice service unavailable"); }
          setTranscript(decodeURIComponent(response.headers.get("X-Signa-Transcript") || ""));
          setReply(decodeURIComponent(response.headers.get("X-Signa-Reply") || ""));
          const audio = await response.blob(); const url = URL.createObjectURL(audio);
          const player = new Audio(url); await player.play(); player.onended = () => URL.revokeObjectURL(url);
        } catch (e) { setError(e instanceof Error ? e.message : "Voice service unavailable"); }
        finally { setBusy(false); }
      };
      instance.start(); setRecording(true);
    } catch { setError("Microphone access is needed to record an enquiry."); }
  }

  function stop() { recorder.current?.stop(); setRecording(false); }

  return <main className="mx-auto max-w-xl px-5 py-12">
    <a className="text-sm underline" href="/">← Signa home</a>
    <h1 className="mt-6 text-3xl font-semibold">Speak with Signa</h1>
    <p className="mt-3 text-sm text-muted-foreground">Browser speech enquiry demo using Intron Sahara recognition and voice. Do not include personal details or private evidence. This does not submit an incident report.</p>
    <p className="mt-2 text-xs text-muted-foreground">Language choices are not provider-tested yet. Automatic language detection is not enabled; choose a language yourself and retry if recognition seems uncertain.</p>
    <label className="mt-8 block text-sm font-medium" htmlFor="voice-language">Language</label>
    <select id="voice-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3">
      {options.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
    </select>
    <div className="mt-5 flex gap-3">
      {!recording ? <button disabled={busy} onClick={start} className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50">{busy ? "Processing…" : "Start speaking"}</button> : <button onClick={stop} className="rounded-lg border px-5 py-3">Stop and send audio</button>}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {transcript && <section className="mt-8 space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Transcript</h2><p>{transcript}</p><h2 className="pt-2 font-semibold">Reply</h2><p>{reply}</p></section>}
  </main>;
}
