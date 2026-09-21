import { useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  User,
  Phone,
  Share2,
} from 'lucide-react';
import { minutesToTime, formatLongDate, buildCalendarUrl } from '@/lib/conferenceUtils';

export default function BookingConfirmation({ slot, conference, onRestart }) {
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const calUrl = buildCalendarUrl({
    date: slot.date,
    startMinutes: slot.start_minutes,
    durationMin: slot.duration_min,
    teacherName: conference?.teacher_name,
    studentName: slot.student_name,
  });

  const saveOrSharePicture = async () => {
    if (!cardRef.current || saving) return;

    setSaving(true);

    try {
      const { default: html2canvas } =
        await import('html2canvas');

      const canvas = await html2canvas(
        cardRef.current,
        {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
        }
      );

      const blob = await new Promise(
        (resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) {
                resolve(result);
              } else {
                reject(
                  new Error(
                    'Could not create the confirmation image.'
                  )
                );
              }
            },
            'image/png',
            1
          );
        }
      );

      const filename =
        `conference-${slot.date}.png`;

      const imageFile = new File(
        [blob],
        filename,
        {
          type: 'image/png',
        }
      );

      const canShareImage =
        typeof navigator.share ===
          'function' &&
        typeof navigator.canShare ===
          'function' &&
        navigator.canShare({
          files: [imageFile],
        });

      if (canShareImage) {
        await navigator.share({
          title:
            'Conference appointment',
          text:
            'Save or share your conference appointment.',
          files: [imageFile],
        });

        return;
      }

      const imageUrl =
        URL.createObjectURL(blob);

      const isIOS =
        /iphone|ipad|ipod/i.test(
          navigator.userAgent
        );

      if (isIOS) {
        const imageWindow =
          window.open(
            imageUrl,
            '_blank'
          );

        if (!imageWindow) {
          window.location.href =
            imageUrl;
        }

        setTimeout(
          () =>
            URL.revokeObjectURL(
              imageUrl
            ),
          60000
        );

        return;
      }

      const downloadLink =
        document.createElement('a');

      downloadLink.href = imageUrl;
      downloadLink.download =
        filename;

      document.body.appendChild(
        downloadLink
      );

      downloadLink.click();
      downloadLink.remove();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            imageUrl
          ),
        5000
      );
    } catch (error) {
      if (
        error?.name !==
        'AbortError'
      ) {
        console.error(
          'Could not share confirmation:',
          error
        );

        alert(
          'We could not create the picture. Please take a screenshot of the confirmation.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">You're booked!</h1>
      <p className="text-slate-500 mb-5">Save this confirmation for your records.</p>

      <div ref={cardRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-3">
          <Calendar className="w-5 h-5 text-indigo-500" />
          <span className="font-bold text-slate-800">{formatLongDate(slot.date)}</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-5 h-5 text-indigo-500" />
          <span className="font-bold text-slate-800">{minutesToTime(slot.start_minutes)}</span>
          <span className="text-slate-400 text-sm">({slot.duration_min} min)</span>
        </div>
        {conference?.teacher_name && (
          <div className="flex items-center gap-3 mb-3">
            <User className="w-5 h-5 text-indigo-500" />
            <span className="text-slate-700">{conference.teacher_name}</span>
          </div>
        )}
        {slot.parent_phone && (
          <div className="flex items-center gap-3 mb-3">
            <Phone className="w-5 h-5 text-indigo-500" />
            <span className="text-slate-700">{slot.parent_phone}</span>
          </div>
        )}
        <div className="border-t border-slate-100 pt-3 mt-3">
          <p className="text-sm text-slate-500">Parent</p>
          <p className="font-medium text-slate-800">{slot.parent_name}</p>
          <p className="text-sm text-slate-500 mt-1">Student</p>
          <p className="font-medium text-slate-800">{slot.student_name}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-5">
        <a href={calUrl} target="_blank" rel="noreferrer" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold active:scale-95 transition inline-block">
          Add to Google Calendar
        </a>
        <button
          type="button"
          onClick={
            saveOrSharePicture
          }
          disabled={saving}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold disabled:opacity-50 active:scale-95 transition"
        >
          <Share2 className="w-4 h-4" />

          {saving
            ? 'Creating picture…'
            : 'Save or share picture'}
        </button>
      </div>

      <button onClick={onRestart} className="mt-5 text-sm text-indigo-600 font-bold">Book another time</button>
    </div>
  );
}