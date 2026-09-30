const SB_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co';

// Lists a Supabase storage public bucket recursively, using the anon key
// held as a backend secret so it never ships to the browser bundle.
Deno.serve(async (req) => {
  try {
    // Public buckets listed with the anon key — no platform auth required,
    // so students (class + number login, not platform auth) can use the
    // workstation activities that resolve words from these buckets.
    // Allowlist of public buckets the app legitimately lists. Prevents a caller
    // from enumerating arbitrary buckets via a modified request body.
    const ALLOWED_BUCKETS = new Set([
      'lettersort-images',
      'lettersort-audio',
      'syllable-audio',
      'audio',
      'images',
    ]);

    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket || '');
    const prefix = String(body.prefix || '');
    if (!bucket) return Response.json({ error: 'bucket required' }, { status: 400 });
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return Response.json({ error: 'bucket not allowed' }, { status: 403 });
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!anonKey) return Response.json({ error: 'SUPABASE_ANON_KEY not set' }, { status: 500 });

    const out = [];
    // List one page with up to 3 retries on transient Supabase errors
    // (429 rate-limit, 5xx). Returns null if all retries fail so the
    // caller can decide whether to skip the page or abort.
    async function listPage(dir, offset, limit) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`${SB_URL}/storage/v1/object/list/${bucket}`, {
            method: 'POST',
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prefix: dir,
              limit,
              offset,
              sortBy: { column: 'name', order: 'asc' },
            }),
          });
          if (r.ok) return await r.json();
          // Retry on rate-limit or server errors; bail on 4xx auth/permission
          if (r.status !== 429 && r.status < 500) return null;
        } catch { /* network blip — retry */ }
        await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
      }
      return null;
    }
    async function walk(dir) {
      let offset = 0;
      const limit = 100;
      while (true) {
        const items = await listPage(dir, offset, limit);
        if (!items) {
          // A single page failing (rate-limit, transient 5xx) should not
          // kill the whole activity — stop walking this branch but keep
          // whatever files we already gathered.
          break;
        }
        for (const it of items) {
          const full = dir ? `${dir.replace(/\/$/, '')}/${it.name}` : it.name;
          if (it.metadata) out.push(full);
          else await walk(full);
        }
        if (items.length < limit) break;
        offset += limit;
      }
    }
    await walk(prefix || '');
    return Response.json({ files: out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});