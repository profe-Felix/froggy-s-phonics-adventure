import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Fetches slide IDs and speaker notes from the Google Slides API for a
// presentation shared with the connected Google account. Stores the result
// on the SlidePresentation record so the viewer and remote can use it.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { presentation_id, record_id } = body;
    if (!presentation_id) return Response.json({ error: 'presentation_id is required' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googleslides');

    const resp = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentation_id}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) {
      const detail = await resp.text();
      return Response.json({ error: `Google Slides API ${resp.status}`, detail }, { status: 502 });
    }
    const data = await resp.json();

    const slides = (data.slides || []).map((slide, i) => {
      const slideId = slide.objectId;
      const slideNumber = slide.slideNumber || i + 1;
      let notes = '';
      const np = slide.notesPage;
      if (np) {
        if (np.notes?.text?.textElements) {
          notes = np.notes.text.textElements.map(te => te.textRun?.content || '').join('');
        }
        if (!notes && Array.isArray(np.pageElements)) {
          for (const el of np.pageElements) {
            if (el.shape?.text?.textElements) {
              notes = el.shape.text.textElements.map(te => te.textRun?.content || '').join('');
              if (notes) break;
            }
          }
        }
      }
      return { slideId, slideNumber, notes: notes.trim() };
    });

    if (record_id) {
      await base44.entities.SlidePresentation.update(record_id, {
        slide_data: JSON.stringify(slides),
        slide_data_fetched: true,
        slide_count: slides.length,
      });
    }

    return Response.json({ slides, slideCount: slides.length, presentationId: data.presentationId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}