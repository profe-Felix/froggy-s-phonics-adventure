// Student's read-only mirror of the teacher's Google Slides. Renders the same
// embed URL the teacher is showing so students see the slides on their own
// device. No real-time slide sync — the teacher verbally guides which slide
// to look at. Students navigate within the embedded presentation themselves.
export default function GoogleSlidesMirrorPanel({ broadcast, step }) {
  const url =
    broadcast?.type === 'google_slides' ? broadcast.url : step?.config?.slidesUrl || '';

  if (!url) return null;

  return (
    <div className="w-full h-full p-2">
      <iframe
        src={url}
        className="w-full h-full rounded-xl border-0"
        allowFullScreen
        title="Google Slides"
      />
    </div>
  );
}