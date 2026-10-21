import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ScanError, saveBookIndex, syncIntroducedReaders, ocrBook } from '../../shared/bookVocabularyScan.mjs';

// Open teacher entry is intentional. Service authority stays here, and the
// contract can write only book indexes or append trusted, missing DF reader steps.
export default async function(req: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers });
  try {
    if (Number(req.headers.get('content-length') || 0) > 1500000)
      return Response.json({ ok: false, error: 'request_too_large' }, { status: 413, headers });
    const text = await req.text();
    if (text.length > 1500000) return Response.json({ ok: false, error: 'request_too_large' }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text); } catch { throw new ScanError('invalid_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ScanError('invalid_request');
    const client = createClientFromRequest(req), svc = client.asServiceRole;
    let result;
    if (body.action === 'save_index') result = await saveBookIndex(svc.entities, body);
    else if (body.action === 'sync_readers' && Object.keys(body).length === 1)
      result = await syncIntroducedReaders(svc.entities);
    else if (body.action === 'ocr_book') result = await ocrBook(svc.entities, svc.integrations.Core, body);
    else throw new ScanError('invalid_action');
    return Response.json(result, { headers });
  } catch (error) {
    const known = error instanceof ScanError;
    return Response.json({ ok: false, error: known ? error.code : 'scan_unavailable' },
      { status: known ? error.status : 503, headers });
  }
}
