import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// Bulk-upload photos for a class. Drop a batch of images; each filename is
// matched to a student by name (case-insensitive) or by number (e.g. "1.jpg").
// Matched photos are uploaded and saved automatically.
export default function BulkPhotoUploader({ students, open, onOpenChange, onDone }) {
  const [results, setResults] = useState(null);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  const nameMap = {};
  const numMap = {};
  students.forEach((s) => {
    if (s.name) nameMap[s.name.toLowerCase().trim()] = s;
    if (s.student_number) numMap[String(s.student_number)] = s;
  });

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setProcessing(true);
    setResults(null);
    const matched = [];
    const unmatched = [];
    for (const file of files) {
      const stem = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
      let student = nameMap[stem];
      if (!student) student = numMap[stem];
      // Also try "First Last" with flexible separators
      if (!student) {
        const norm = stem.replace(/[_\-\.]+/g, ' ').replace(/\s+/g, ' ').trim();
        student = nameMap[norm];
      }
      if (!student) {
        unmatched.push(file.name);
        continue;
      }
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({
          file: new File([file], file.name, { type: file.type }),
        });
        await base44.entities.Student.update(student.id, { photo_url: file_url });
        matched.push(student.name || `#${student.student_number}`);
      } catch (err) {
        unmatched.push(`${file.name} (upload failed)`);
      }
    }
    setProcessing(false);
    setResults({ matched, unmatched });
    onDone?.();
  };

  const handleClose = (next) => {
    if (!next) setResults(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk upload photos</DialogTitle>
          <DialogDescription>
            Select multiple photos. Each filename should match a student's name
            (e.g. "John Smith.jpg") or number (e.g. "1.jpg"). Matched photos are
            uploaded and saved automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="w-full"
            variant="outline"
          >
            {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {processing ? 'Uploading…' : 'Choose photos'}
          </Button>

          {results && (
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2 text-green-600 font-medium">
                <CheckCircle2 className="w-4 h-4" /> {results.matched.length} matched
              </p>
              {results.matched.length > 0 && (
                <p className="text-xs text-muted-foreground pl-6">{results.matched.join(', ')}</p>
              )}
              {results.unmatched.length > 0 && (
                <p className="flex items-center gap-2 text-amber-600 font-medium">
                  <AlertCircle className="w-4 h-4" /> {results.unmatched.length} unmatched
                </p>
              )}
              {results.unmatched.length > 0 && (
                <p className="text-xs text-muted-foreground pl-6">{results.unmatched.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            {results ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}