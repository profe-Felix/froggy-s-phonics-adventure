import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.700.0';

// Cloudflare R2 audio/video management for lesson demo steps.
// Actions:
//   list              — list all objects in the bucket
//   presign           — generate a one-hour presigned PUT URL
//   delete            — delete an object
//   save_demo         — store a demo URL + slider_data in Lesson step.config.demos[word]
//   upload_demo_b64   — receive audio as base64 string (JSON) + metadata, upload to R2 server-side.
//                       Audio is small (~50-200KB) so base64 fits within the JSON payload limit.
//                       Avoids both CORS issues and multipart parsing crashes.
export default async function(req) {
  try {
    const accountId = secrets.get('R2_ACCOUNT_ID');
    const accessKeyId = secrets.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = secrets.get('R2_SECRET_ACCESS_KEY');
    const bucket = secrets.get('R2_BUCKET_NAME');
    const publicBase = (secrets.get('R2_PUBLIC_BASE_URL') || '').replace(/\/$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      return Response.json({ error: 'R2 secrets not configured' }, { status: 500 });
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';

    if (action === 'list') {
      const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
      const files = (data.Contents || [])
        .map((o) => ({
          key: o.Key,
          size: o.Size,
          url: `${publicBase}/${o.Key}`,
          lastModified: o.LastModified,
        }))
        .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
      return Response.json({ files });
    }

    if (action === 'presign') {
      const key = String(body.key || '').trim();
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      const ct = body.contentType || 'audio/webm';
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: ct });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return Response.json({ uploadUrl, publicUrl: `${publicBase}/${key}` });
    }

    if (action === 'delete') {
      const key = String(body.key || '').trim();
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return Response.json({ ok: true });
    }

    // ── upload_demo_b64: audio as base64 string (JSON body) ──
    // Uploads audio to R2 (no SDK needed), then best-effort saves demo metadata
    // into the Lesson entity. The Lesson update is wrapped separately so that
    // if createClientFromRequest/asServiceRole fails (e.g. no auth token from
    // published app), the R2 upload still succeeds and the frontend gets the URL.
    if (action === 'upload_demo_b64') {
      const lessonId = String(body.lessonId || '').trim();
      const stepIndex = Number(body.stepIndex);
      const word = String(body.word || '').trim();
      const audioBase64 = String(body.audioBase64 || '');
      const contentType = String(body.contentType || 'audio/webm').split(';')[0];
      const sliderData = Array.isArray(body.sliderData) ? body.sliderData : [];

      if (!word || !audioBase64 || !Number.isFinite(stepIndex)) {
        return Response.json({ error: 'stepIndex, word, audioBase64 required' }, { status: 400 });
      }

      const ext = contentType.includes('mp4') ? 'm4a'
        : contentType.includes('ogg') ? 'ogg' : 'webm';
      const key = `blending-demos/${word}.${ext}`;

      console.log('upload_demo_b64: decoding base64, length=', audioBase64.length);

      // Decode base64 to binary
      let bytes;
      try {
        const binaryString = atob(audioBase64);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } catch (decodeErr) {
        console.error('base64 decode failed:', decodeErr?.message || decodeErr);
        return Response.json({ error: 'base64 decode failed: ' + (decodeErr?.message || 'unknown') }, { status: 400 });
      }

      console.log('upload_demo_b64: decoded', bytes.length, 'bytes, uploading via fetch to R2 key:', key);

      // Use fetch + presigned URL instead of s3.send(PutObjectCommand) —
      // the AWS SDK's streaming upload crashes the Deno worker, but a plain
      // fetch PUT with the presigned URL works reliably.
      const presignCommand = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const uploadUrl = await getSignedUrl(s3, presignCommand, { expiresIn: 300 });
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: bytes,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => '');
        console.error('R2 PUT failed:', uploadRes.status, errText);
        return Response.json({ error: `R2 upload failed: ${uploadRes.status}` }, { status: 500 });
      }

      console.log('upload_demo_b64: R2 upload complete');

      const audioUrl = `${publicBase}/${key}`;

      // Best-effort: save demo metadata into the Lesson entity.
      // If this fails (no auth, lesson not found, etc.), the R2 upload still succeeds.
      let lessonSaved = false;
      if (lessonId) {
        try {
          const base44 = createClientFromRequest(req);
          const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId);
          const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
          const step = steps[stepIndex] || {};
          const config = { ...(step.config || {}) };
          const demos = { ...(config.demos || {}) };
          demos[word] = { audio_url: audioUrl, slider_data: sliderData };
          config.demos = demos;
          steps[stepIndex] = { ...step, config };
          await base44.asServiceRole.entities.Lesson.update(lessonId, { steps });
          lessonSaved = true;
        } catch (lessonErr) {
          console.warn('Lesson save failed (R2 upload still succeeded):', lessonErr?.message || lessonErr);
        }
      }

      return Response.json({ ok: true, audioUrl, sliderData, lessonSaved });
    }

    if (action === 'save_demo') {
      const lessonId = String(body.lessonId || '').trim();
      const stepIndex = Number(body.stepIndex);
      const word = String(body.word || '').trim();
      const audioUrl = String(body.audioUrl || '').trim();
      const sliderData = Array.isArray(body.sliderData) ? body.sliderData : [];
      if (!lessonId || !word || !audioUrl || !Number.isFinite(stepIndex)) {
        return Response.json({ error: 'lessonId, stepIndex, word, audioUrl required' }, { status: 400 });
      }
      const base44 = createClientFromRequest(req);
      const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId);
      const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
      const step = steps[stepIndex] || {};
      const config = { ...(step.config || {}) };
      const demos = { ...(config.demos || {}) };
      demos[word] = { audio_url: audioUrl, slider_data: sliderData };
      config.demos = demos;
      steps[stepIndex] = { ...step, config };
      await base44.asServiceRole.entities.Lesson.update(lessonId, { steps });
      return Response.json({ ok: true, audioUrl });
    }

    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    console.error('r2Video error:', error?.message || error, error?.stack || '');
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}