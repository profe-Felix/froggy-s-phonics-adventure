import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Loader2, RefreshCw, Plus, ExternalLink } from 'lucide-react';

function extractSpreadsheetId(input) {
  if (!input) return '';
  const m = String(input).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
}

export default function ConferenceSheetSetup() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');

  const { data: setting, isLoading } = useQuery({
    queryKey: ['conference-sheet-setting'],
    queryFn: async () => {
      const res = await base44.entities.ConferenceSheetSetting.list('-created_date', 1);
      return res[0] || null;
    },
  });

  const saveSetting = useMutation({
    mutationFn: async (spreadsheet_id) => {
      if (setting?.id) {
        return base44.entities.ConferenceSheetSetting.update(setting.id, { spreadsheet_id });
      }
      return base44.entities.ConferenceSheetSetting.create({ spreadsheet_id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conference-sheet-setting'] });
      setUrl('');
      setStatus('Connected!');
      setTimeout(() => setStatus(''), 2500);
    },
  });

  const createSheet = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('createConferenceSheet', { title: 'Parent Conferences' });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conference-sheet-setting'] });
      setStatus('New sheet created and connected!');
      setTimeout(() => setStatus(''), 3000);
    },
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('syncAllConferenceSlots', {});
      return res.data;
    },
    onSuccess: (data) => {
      const msg = data.appended > 0
        ? `Added ${data.appended} booking${data.appended !== 1 ? 's' : ''} to the sheet${data.skipped ? ` (${data.skipped} already there)` : ''}`
        : `All ${data.skipped || 0} booking${data.skipped !== 1 ? 's' : ''} already in the sheet`;
      setStatus(msg);
      setTimeout(() => setStatus(''), 4000);
    },
    onError: (err) => {
      setStatus(`Error: ${err.message}`);
      setTimeout(() => setStatus(''), 4000);
    },
  });

  const spreadsheetId = setting?.spreadsheet_id;
  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : '';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-bold text-slate-800">📋 Google Sheet Sync</h3>
        {spreadsheetId && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Bookings mirror to a Google Spreadsheet — one tab per teacher. New bookings add a row; cancellations mark it (nothing is ever deleted from the sheet).
      </p>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : spreadsheetId ? (
        <div className="space-y-3">
          <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:underline break-all">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            Open spreadsheet
          </a>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-95 transition flex items-center gap-2"
            >
              {syncAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sync all existing bookings
            </button>
          </div>
          {status && <p className="text-sm text-emerald-600 font-medium">{status}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste Google Sheet URL or ID"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => saveSetting.mutate(extractSpreadsheetId(url))}
              disabled={!url.trim() || saveSetting.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-95 transition"
            >
              {saveSetting.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">or</span>
            <button
              onClick={() => createSheet.mutate()}
              disabled={createSheet.isPending}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 active:scale-95 transition flex items-center gap-2"
            >
              {createSheet.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create a new sheet
            </button>
          </div>
          {status && <p className="text-sm text-emerald-600 font-medium">{status}</p>}
        </div>
      )}
    </div>
  );
}