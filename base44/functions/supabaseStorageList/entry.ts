import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SB_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co';

// Lists a Supabase storage public bucket recursively, using the anon key
// held as a backend secret so it never ships to the browser bundle.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket || '');
    const prefix = String(body.prefix || '');
    if (!bucket) return Response.json({ error: 'bucket required' }, { status: 400 });

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!anonKey) return Response.json({ error: 'SUPABASE_ANON_KEY not set' }, { status: 500 });

    const out = [];
    async function walk(dir) {
      let offset = 0;
      const limit = 100;
      while (true) {
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
        if (!r.ok) throw new Error('list ' + r.status);
        const items = await r.json();
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