import React from 'react';

// Self-contained "report this conversation" dialog. Lifted out of
// Inbox.jsx so the inbox file stays focused on the thread surface and
// future moderation surfaces (e.g. profile-level reports) can reuse the
// same component.
const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

const ReportConversationModal = ({
  open,
  reason,
  note,
  onReasonChange,
  onNoteChange,
  onCancel,
  onSubmit,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-kotoba-text">Report this conversation</h3>
        <p className="text-sm text-kotoba-text/70">
          Our team will review this thread. Reports are confidential.
        </p>
        <div>
          <label htmlFor="reportReason" className="block text-sm font-medium text-kotoba-text/80">
            Reason
          </label>
          <select
            id="reportReason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reportNote" className="block text-sm font-medium text-kotoba-text/80">
            Additional context (optional)
          </label>
          <textarea
            id="reportNote"
            rows="3"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            maxLength={1000}
            className="mt-1 block w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-kotoba-text/20 text-kotoba-text/80 hover:bg-kotoba-background/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white"
          >
            Submit report
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportConversationModal;
