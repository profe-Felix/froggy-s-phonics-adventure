import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.700.0';

// Cloudflare R2 video management for lesson video steps.
// Actions:
//   list    — list all video objects in the bucket (any authenticated user)
//   presign — generate a one-hour presigned PUT URL for direct upload (teacher/admin only)
//   delete  — delete a video object (teacher/admin only)
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
    const isStaff = user.role === 'admin' || user.role === 'teacher';

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
      if (!isStaff) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const key = String(body.key || '').trim();
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      const contentType = body.contentType || 'video/mp4';
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return Response.json({ uploadUrl, publicUrl: `${publicBase}/${key}` });
    }

    if (action === 'delete') {
      if (!isStaff) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const key = String(body.key || '').trim();
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}