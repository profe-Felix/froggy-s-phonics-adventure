import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.700.0';

// Cloudflare R2 video management for lesson video steps.
// Actions:
//   list      — list all video objects in the bucket
//   presign   — generate a one-hour presigned PUT URL for direct upload
//   delete    — delete a video object
//   save_demo — store a demo video URL in a Lesson's step.config.demos[word]
//               (uses asServiceRole so teachers can save from any browser
//               without a platform login — only ?role=teacher is needed)
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
        .filter((o) => /\.(mp4|webm|mov|m4v|ogg)$/i.test(o.Key || ''))
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
      const contentType = body.contentType || 'video/mp4';
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
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
      const publicUrl = String(body.publicUrl || '').trim();
      if (!lessonId || !word || !publicUrl || !Number.isFinite(stepIndex)) {
        return Response.json({ error: 'lessonId, stepIndex, word, publicUrl required' }, { status: 400 });
      }
      const base44 = createClientFromRequest(req);
      const lesson = await base44.asServiceRole.entities.Lesson.get(lessonId);
      const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
      const step = steps[stepIndex] || {};
      const config = { ...(step.config || {}) };
      const demos = { ...(config.demos || {}) };
      demos[word] = publicUrl;
      config.demos = demos;
      steps[stepIndex] = { ...step, config };
      await base44.asServiceRole.entities.Lesson.update(lessonId, { steps });
      return Response.json({ ok: true, publicUrl });
    }

    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    console.error('r2Video error:', error?.message || error, error?.stack || '');
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}