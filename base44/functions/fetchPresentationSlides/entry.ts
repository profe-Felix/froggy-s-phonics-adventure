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

    // Find the textElements array for the speaker notes on a slide.
    // notesPage is nested inside slideProperties (not directly on the slide).
    function getNotesTextElements(slide) {
      const np = slide.notesPage || slide.slideProperties?.notesPage;
      if (!np) return null;
      if (np.notes?.text?.textElements) return np.notes.text.textElements;
      if (Array.isArray(np.pageElements)) {
        for (const el of np.pageElements) {
          if (el.shape?.text?.textElements) {
            const t = el.shape.text.textElements.map(te => te.textRun?.content || '').join('');
            if (t.trim()) return el.shape.text.textElements;
          }
        }
      }
      return null;
    }

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Convert a Google Slides textStyle to an inline CSS style string,
    // preserving bold, italic, underline, strikethrough, colors, font size,
    // font family, and font weight.
    function textStyleToCss(style) {
      if (!style) return '';
      const parts = [];
      if (style.foregroundColor?.opaqueColor?.rgbColor) {
        const { red, green, blue } = style.foregroundColor.opaqueColor.rgbColor;
        parts.push(`color: rgb(${Math.round((red||0)*255)}, ${Math.round((green||0)*255)}, ${Math.round((blue||0)*255)})`);
      }
      if (style.backgroundColor?.opaqueColor?.rgbColor) {
        const { red, green, blue } = style.backgroundColor.opaqueColor.rgbColor;
        parts.push(`background-color: rgb(${Math.round((red||0)*255)}, ${Math.round((green||0)*255)}, ${Math.round((blue||0)*255)})`);
      }
      if (style.fontSize?.magnitude) {
        const unit = style.fontSize.unit === 'PT' ? 'pt' : 'px';
        parts.push(`font-size: ${style.fontSize.magnitude}${unit}`);
      }
      if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`);
      if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`);
      return parts.join('; ');
    }

    // Wrap text content in HTML tags based on its textStyle.
    function styleRun(content, style) {
      // Convert newlines to <br> for HTML rendering (the plain-text version
      // used whitespace-pre-wrap; the HTML version needs explicit <br> tags).
      let html = escapeHtml(content).replace(/\n/g, '<br>');
      if (style?.bold) html = `<strong>${html}</strong>`;
      if (style?.italic) html = `<em>${html}</em>`;
      if (style?.underline) html = `<u>${html}</u>`;
      if (style?.strikethrough) html = `<s>${html}</s>`;
      const css = textStyleToCss(style);
      if (css) html = `<span style="${css}">${html}</span>`;
      return html;
    }

    // Convert the full textElements array (paragraph markers + text runs)
    // to an HTML string, preserving paragraph breaks, bullets, and inline
    // formatting. Line breaks come from \n characters in the text content
    // (converted to <br> by styleRun); paragraphMarkers are only used for
    // bullet list structure, not for adding extra <br> tags.
    function textElementsToHtml(textElements) {
      let html = '';
      let isFirstParagraph = true;
      let inBulletList = false;

      for (const el of textElements) {
        if (el.paragraphMarker) {
          const isBullet = !!el.paragraphMarker.style?.bullet;
          if (!isFirstParagraph && inBulletList) html += '</li>';
          if (isBullet && !inBulletList) { html += '<ul>'; inBulletList = true; }
          else if (!isBullet && inBulletList) { html += '</ul>'; inBulletList = false; }
          if (isBullet) html += '<li>';
          isFirstParagraph = false;
        } else if (el.textRun) {
          html += styleRun(el.textRun.content || '', el.textRun.textStyle);
        }
      }
      if (inBulletList) html += '</li></ul>';
      return html.trim();
    }

    const slides = (data.slides || []).map((slide, i) => {
      const slideId = slide.objectId;
      const slideNumber = i + 1;
      let notes = '';
      let notesHtml = '';
      const textElements = getNotesTextElements(slide);
      if (textElements) {
        notes = textElements.map(te => te.textRun?.content || '').join('').trim();
        notesHtml = textElementsToHtml(textElements);
      }
      return { slideId, slideNumber, notes, notesHtml };
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