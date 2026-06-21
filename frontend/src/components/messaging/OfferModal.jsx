import React, { useEffect } from 'react';

// Project-offer modal — the tutor's "here's what I'd do for this request"
// surface. Owns no submit state itself; the parent (Inbox) holds every
// field + the submit handler so the offer payload can be assembled with
// access to the current conversation. We just render the form and pipe
// changes back up.
//
// Mobile-first sizing: form grids collapse to one column under sm, the
// modal stretches to the viewport bottom on small screens, and the
// backdrop closes on click.

const OfferModal = ({
  open,
  onClose,
  onSubmit,
  values,
  setters,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const {
    offerTitle,
    offerDescription,
    offerPrice,
    offerLanguage,
    offerLevel,
    offerTags,
    offerIsSeries,
    offerNumVideos,
    offerPricePerVideo,
  } = values;

  const {
    setOfferTitle,
    setOfferDescription,
    setOfferPrice,
    setOfferLanguage,
    setOfferLevel,
    setOfferTags,
    setOfferIsSeries,
    setOfferNumVideos,
    setOfferPricePerVideo,
  } = setters;

  return (
    <div
      className="fixed inset-0 z-10 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-screen items-end sm:items-center justify-center px-4 pt-4 pb-8 sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500/75 transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        />
        <div className="relative inline-block align-bottom bg-white rounded-3xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg leading-6 font-medium text-kotoba-text mb-4">
              Make Project Offer
            </h3>
            <div className="space-y-4">
              <Field
                id="offerTitle"
                label="Project Title"
                value={offerTitle}
                onChange={setOfferTitle}
              />
              <Field
                id="offerDescription"
                label="Project Description"
                value={offerDescription}
                onChange={setOfferDescription}
                multiline
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  id="offerLanguage"
                  label="Language"
                  value={offerLanguage}
                  onChange={setOfferLanguage}
                />
                <Field
                  id="offerLevel"
                  label="Level"
                  value={offerLevel}
                  onChange={setOfferLevel}
                />
              </div>
              <Field
                id="offerTags"
                label="Tags (comma-separated)"
                value={offerTags}
                onChange={setOfferTags}
              />
              <label className="flex items-center gap-2 text-sm text-kotoba-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-kotoba-primary border-kotoba-text/20 rounded"
                  checked={offerIsSeries}
                  onChange={(e) => setOfferIsSeries(e.target.checked)}
                />
                Is this a series?
              </label>
              {offerIsSeries && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    id="offerNumVideos"
                    label="Number of Videos"
                    type="number"
                    min={1}
                    value={offerNumVideos}
                    onChange={(v) => setOfferNumVideos(parseInt(v, 10) || 0)}
                  />
                  <Field
                    id="offerPricePerVideo"
                    label="Price Per Video (EUR)"
                    type="number"
                    min={0}
                    step={0.01}
                    value={offerPricePerVideo}
                    onChange={(v) => setOfferPricePerVideo(parseFloat(v) || 0)}
                  />
                </div>
              )}
              <Field
                id="offerPrice"
                label="Total Offer Price (EUR)"
                type="number"
                min={0}
                value={offerPrice}
                onChange={(v) => setOfferPrice(parseFloat(v) || 0)}
                disabled={offerIsSeries}
              />
            </div>
          </div>
          <div className="bg-kotoba-background/40 px-4 py-3 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto inline-flex justify-center rounded-2xl border border-kotoba-text/20 px-4 py-2 bg-white text-base font-medium text-kotoba-text/80 hover:bg-kotoba-background/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="w-full sm:w-auto inline-flex justify-center rounded-2xl px-4 py-2 bg-kotoba-primary text-base font-medium text-white hover:bg-kotoba-primary/90"
            >
              Send Offer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ id, label, value, onChange, multiline, type = 'text', min, step, disabled }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-kotoba-text/80">
      {label}
    </label>
    {multiline ? (
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border border-kotoba-text/20 rounded-2xl shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-kotoba-primary/30 focus:border-kotoba-primary sm:text-sm"
      />
    ) : (
      <input
        type={type}
        id={id}
        value={value}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full border border-kotoba-text/20 rounded-2xl shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-kotoba-primary/30 focus:border-kotoba-primary sm:text-sm disabled:opacity-50"
      />
    )}
  </div>
);

export default OfferModal;
