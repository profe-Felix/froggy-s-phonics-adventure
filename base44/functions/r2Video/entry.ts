import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.700.0';

// Cloudflare R2 audio/video management for lesson demo steps.
// Actions:
//   list           — list all objects in the bucket
//   presign        — generate a one-hour presigned PUT URL
//   delete         — delete an object
//   save_demo      — store a demo URL + slider_data in Lesson step.config.demos[word]
//   upload_demo    — receive an AUDIO file (multipart) + lessonId/stepIndex/word/sliderData,
//                    upload audio to R2 server-side (avoids browser CORS + payload size
//                    limits for video), and save audio_url + slider_data into the Lesson.
//                    Used by teachers from any browser without a platform login.
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

    const contentType = req.headers.get('content-type') || '';

    // ── upload_demo: multipart form-data (audio file + metadata + sliderData) ──
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const lessonId = String(form.get('lessonId') || '').trim();
      const stepIndex = Number(form.get('stepIndex'));
      const word = String(form.get('word') || '').trim();
      const sliderDataRaw = String(form.get('sliderData') || '[]');

      if (!file || !lessonId || !word || !Number.isFinite(stepIndex)) {
        return Response.json({ error: 'file, lessonId, stepIndex, word required' }, { status: 400 });
      }

      let sliderData = [];
      try { sliderData = JSON.parse(sliderDataRaw); } catch { sliderData = []; }

      const fileContentType = (file.type || 'audio/webm').split(';')[0];
      const ext = fileContentType.includes('mp4') ? 'm4a'
        : fileContentType.includes('ogg') ? 'ogg' : 'webm';
      const key = `blending-demos/${word}.${ext}`;
      const buffer = await file.arrayBuffer();

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: new Uint8Array(buffer),
        ContentType: fileContentType,
      }));

      const audioUrl = `${publicBase}/${key}`;

      // Save audio_url + slider_data into the Lesson entity
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

      return Response.json({ ok: true, audioUrl, sliderData });
    }

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