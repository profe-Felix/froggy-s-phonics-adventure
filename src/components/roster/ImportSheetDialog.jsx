import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Upload } from 'lucide-react';

export default function ImportSheetDialog({ open, onOpenChange, onImported }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const reset = () => { setUrl(''); setError(''); setResult(null); };

  const handleImport = async () => {
    setError('');
    setResult(null);
    if (!url.trim()) { setError('Paste your Google Sheets URL first.'); return; }
    setLoading(true);
    try {
      const res = await base44.functions.invoke('importGoogleSheet', {
        sheetUrl: url.trim(),
        school_year: ACTIVE_SCHOOL_YEAR,
      });
      setResult(res.data);
      onImported?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import roster from Google Sheets</DialogTitle>
          <DialogDescription>
            Paste the link to your roster. In Google Sheets click <strong>Share</strong> and set it to
            "Anyone with the link", then copy the link. The first row should have headers like
            <strong> Name, Number, Class</strong>, and optionally <strong>Print</strong> (check the rows
            that need ID cards).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sheet-url">Google Sheets URL</Label>
            <Input
              id="sheet-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…/edit"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <p className="text-sm text-green-600">
              {result.imported} new, {result.updated} updated
              {result.unmatched?.length ? `, ${result.unmatched.length} unmatched (no number)` : ''}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={loading}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}