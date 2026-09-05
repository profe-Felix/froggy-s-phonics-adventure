import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, RefreshCw } from 'lucide-react';

export default function SheetLinkManager({ open, onOpenChange, onSynced }) {
  const [links, setLinks] = useState(null);
  const [editing, setEditing] = useState(null); // { id?, teacher_name, sheet_url }
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = useCallback(async () => {
    const list = await base44.entities.SheetLink.list('-created_date');
    setLinks(list);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const startAdd = () => setEditing({ teacher_name: '', sheet_url: '' });
  const startEdit = (l) => setEditing({ id: l.id, teacher_name: l.teacher_name, sheet_url: l.sheet_url });

  const saveLink = async () => {
    if (!editing) return;
    const teacher = editing.teacher_name.trim();
    const url = editing.sheet_url.trim();
    if (!teacher || !url) return;
    if (editing.id) {
      await base44.entities.SheetLink.update(editing.id, { teacher_name: teacher, sheet_url: url });
    } else {
      await base44.entities.SheetLink.create({ teacher_name: teacher, sheet_url: url });
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (l) => {
    if (!window.confirm(`Remove sheet link for ${l.teacher_name}?`)) return;
    await base44.entities.SheetLink.delete(l.id);
    load();
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await base44.functions.invoke('syncSavedSheets', { school_year: ACTIVE_SCHOOL_YEAR });
      const data = res.data;
      const ok = (data.results || []).filter((r) => !r.error);
      const totalCreated = ok.reduce((sum, r) => sum + (r.created || 0), 0);
      const totalUpdated = ok.reduce((sum, r) => sum + (r.updated || 0), 0);
      const errors = (data.results || []).filter((r) => r.error);
      setSyncMsg(`Synced ${ok.length} sheet(s) · ${totalCreated} new, ${totalUpdated} updated${errors.length ? ` · ${errors.length} failed` : ''}`);
      onSynced?.();
    } catch (e) {
      setSyncMsg(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Teacher sheet links</DialogTitle>
          <DialogDescription>
            Link each class's Google Sheet once. Then "Sync" pulls the latest roster into the app —
            no need to paste the URL every time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Button size="sm" onClick={startAdd}><Plus className="w-4 h-4 mr-1" /> Add link</Button>
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || !links?.length}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sync all now
          </Button>
        </div>
        {syncMsg && <p className="text-xs text-muted-foreground mb-2">{syncMsg}</p>}

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {links === null ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sheet links yet. Add one to get started.</p>
          ) : (
            links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{l.teacher_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.sheet_url}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => startEdit(l)}><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(l)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </div>
            ))
          )}
        </div>

        {editing && (
          <div className="border-t pt-3 mt-2 space-y-2">
            <div className="space-y-1">
              <Label>Teacher / Class name</Label>
              <Input value={editing.teacher_name} onChange={(e) => setEditing({ ...editing, teacher_name: e.target.value })} placeholder="e.g. Felix" />
            </div>
            <div className="space-y-1">
              <Label>Google Sheets URL</Label>
              <Input value={editing.sheet_url} onChange={(e) => setEditing({ ...editing, sheet_url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={saveLink}>Save</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}