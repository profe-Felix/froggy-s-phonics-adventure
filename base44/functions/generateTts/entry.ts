import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const SB_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co';
const PROJECT_REF = 'dmlsiyyqpcupbizpxwhp';
const BUCKET = 'audio';

// Stable short hash (first 16 hex chars of SHA-256) so the same sentence
// always maps to the same file in the audio bucket — generate once, reuse
// forever.
async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Derive the languageCode (e.g. "es-US") from a voice name (e.g. "es-US-Wavenet-B").
function langCodeFromVoice(voice) {
  if (!voice) return null;
  const parts = String(voice).split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return null;
}

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim().slice(0, 500);
    const lang = body.lang === 'en' ? 'en' : 'es';
    // Optional voice name (e.g. "es-US-Neural2-B"). When omitted, the default
    // Standard voice for the language is used (legacy behavior).
    const voice = body.voice ? String(body.voice).trim() : '';
    if (!text) return Response.json({ error: 'text required' }, { status: 400 });

    // Resolve the effective voice + languageCode. A provided voice wins; its
    // languageCode is derived from the voice name so es-US voices use es-US.
    const defaultVoice = lang === 'en' ? 'en-US-Standard-E' : 'es-ES-Standard-A';
    const effectiveVoice = voice || defaultVoice;
    const langCode = langCodeFromVoice(effectiveVoice) || (lang === 'en' ? 'en-US' : 'es-ES');

    const hash = await hashText(text);
    // Include the voice in the cache path so different voices don't collide.
    const path = `${lang}/tts/${effectiveVoice}/${hash}.mp3`;
    const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;

    // 1. Already cached in the bucket? Return instantly — no API call, no cost.
    const head = await fetch(publicUrl, { method: 'HEAD' });
    if (head.ok) return Response.json({ url: publicUrl });

    // 2. Generate via Google Cloud TTS.
    const apiKey = secrets.get('GOOGLE_TTS_API_KEY');
    if (!apiKey) return Response.json({ error: 'TTS API key not set' }, { status: 500 });

    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: langCode,
            name: effectiveVoice,
          },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
        }),
      }
    );
    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      return Response.json({ error: 'TTS failed: ' + err }, { status: 502 });
    }
    const ttsData = await ttsRes.json();
    const audioBase64 = ttsData.audioContent;
    if (!audioBase64) return Response.json({ error: 'No audio content' }, { status: 502 });

    // Decode base64 → raw MP3 bytes
    const binary = atob(audioBase64);
    const audioBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) audioBytes[i] = binary.charCodeAt(i);

    // 3. Upload to the Supabase audio bucket. The anon key can't write (storage
    //    RLS blocks it), so fetch the service_role key via the Supabase
    //    Management API connector.
    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('supabase');
    const keysRes = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const keys = await keysRes.json();
    const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key;
    if (!serviceRoleKey) return Response.json({ error: 'No service role key' }, { status: 500 });

    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true',
      },
      body: audioBytes,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return Response.json({ error: 'Upload failed: ' + err }, { status: 502 });
    }

    return Response.json({ url: publicUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}