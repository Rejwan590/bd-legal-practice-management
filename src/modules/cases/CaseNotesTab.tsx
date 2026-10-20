import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseNoteRecord, UserRecord } from '../../data/types';
import { Plus, Edit2, Trash2, Calendar, User, FileText, AlertTriangle, X } from 'lucide-react';

interface CaseNotesTabProps {
  caseId: string;
  canEdit: boolean;
  isReadOnly: boolean;
}

export const CaseNotesTab: React.FC<CaseNotesTabProps> = ({
  caseId,
  canEdit,
  isReadOnly,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [notes, setNotes] = useState<CaseNoteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CaseNoteRecord | null>(null);
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [noteBody, setNoteBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Delete confirm state
  const [deletingNote, setDeletingNote] = useState<CaseNoteRecord | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const users = await repos.user.list({ currentUser });
      const map: Record<string, string> = {};
      users.forEach((u: UserRecord) => {
        map[u.id] = u.name;
      });
      setUsersMap(map);
    } catch {
      // non-critical
    }
  }, [currentUser, repos.user]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await repos.case.listNotes({ currentUser }, caseId, {
        limit: pageSize,
        offset: page * pageSize,
      });
      setNotes(res.notes);
      setTotal(res.total);
    } catch (err: unknown) {
      console.error('Failed to load case notes:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId, currentUser, page, repos.case]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleOpenCreate = () => {
    setEditingNote(null);
    setNoteDate(new Date().toISOString().slice(0, 10));
    setNoteBody('');
    setErrorMsg(null);
    setComposerOpen(true);
  };

  const handleOpenEdit = (note: CaseNoteRecord) => {
    setEditingNote(note);
    setNoteDate(note.noteDate || note.createdAt.slice(0, 10));
    setNoteBody(note.body);
    setErrorMsg(null);
    setComposerOpen(true);
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !canEdit) return;
    if (!noteBody.trim()) {
      setErrorMsg(t('cases.noteRequired', 'Note text cannot be empty'));
      return;
    }
    if (noteBody.length > 5000) {
      setErrorMsg(t('cases.noteTooLong', 'Note text cannot exceed 5000 characters'));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingNote) {
        await repos.case.updateNote({ currentUser }, caseId, editingNote.id, {
          noteDate,
          body: noteBody.trim(),
        });
      } else {
        await repos.case.createNote({ currentUser }, caseId, {
          noteDate,
          body: noteBody.trim(),
        });
      }
      setComposerOpen(false);
      setEditingNote(null);
      setNoteBody('');
      await loadNotes();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save case note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!deletingNote || isReadOnly || !canEdit) return;
    setSubmitting(true);
    try {
      await repos.case.deleteNote({ currentUser }, caseId, deletingNote.id);
      setDeletingNote(null);
      await loadNotes();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete case note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="case-panel-notes">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-700" />
            <span>{t('cases.caseNotes', 'Case Notes & Running History')}</span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-200 text-slate-700">
              {total}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('cases.notesSubtitle', 'Internal discussions, court orders, case milestones and strategy memos')}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            data-testid="add-case-note-btn"
            disabled={isReadOnly}
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('cases.addNote', 'Add Note')}</span>
          </button>
        )}
      </div>

      {loading && notes.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-xs font-medium">
          {t('common.loading', 'Loading notes...')}
        </div>
      ) : notes.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
          {t('cases.noNotesYet', 'No case notes recorded yet. Click "+ Add Note" to record a note.')}
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const authorName = note.createdBy
              ? usersMap[note.createdBy] || (note.createdBy === currentUser.id ? currentUser.name : 'Chamber Staff')
              : 'Chamber Staff';
            return (
              <div
                key={note.id}
                data-testid={`case-note-${note.id}`}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 transition flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      <Calendar className="w-3 h-3 text-amber-700" />
                      {note.noteDate || note.createdAt.slice(0, 10)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <User className="w-3 h-3 text-slate-400" />
                      {authorName}
                    </span>
                    {note.updatedAt !== note.createdAt && (
                      <span className="text-[11px] text-slate-400 italic">
                        ({t('common.edited', 'edited')})
                      </span>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleOpenEdit(note)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition disabled:opacity-40"
                        title={t('common.edit', 'Edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setDeletingNote(note)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition disabled:opacity-40"
                        title={t('common.delete', 'Delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                  {note.body}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 disabled:opacity-30"
            >
              {t('common.previous', 'Previous')}
            </button>
            <button
              type="button"
              disabled={(page + 1) * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 disabled:opacity-30"
            >
              {t('common.next', 'Next')}
            </button>
          </div>
        </div>
      )}

      {/* Composer Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingNote ? t('cases.editNote', 'Edit Case Note') : t('cases.newNote', 'New Case Note')}
              </h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitNote} className="p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('cases.noteDate', 'Date')}
                </label>
                <input
                  type="date"
                  required
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {t('cases.noteText', 'Note / Instructions / Milestone')}
                  </label>
                  <span className={`text-[11px] font-mono ${noteBody.length > 5000 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                    {noteBody.length} / 5000
                  </span>
                </div>
                <textarea
                  rows={5}
                  required
                  maxLength={5000}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder={t('cases.notePlaceholder', 'Enter case notes, court developments, lawyer remarks, or strategy...')}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || isReadOnly}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs disabled:opacity-40"
                >
                  {submitting ? t('common.saving', 'Saving...') : t('common.save', 'Save Note')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deletingNote && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {t('cases.deleteNoteConfirm', 'Delete Case Note')}
                </h4>
                <p className="text-xs text-slate-500">
                  {t('cases.deleteNoteWarning', 'This note will be soft-deleted and archived in the audit log.')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingNote(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDeleteNote}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
              >
                {submitting ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
