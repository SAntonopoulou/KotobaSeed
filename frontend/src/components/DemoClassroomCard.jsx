import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../utils/errors';

// Practice classroom — a private Daily.co room a tutor can spin up to get
// comfortable with the in-call controls before a real lesson. No student
// joins. The time spent counts against the tutor's monthly minute quota,
// so we warn them with a modal before they enter.
//
// Visible only to creators. Hides itself silently for everyone else (the
// dashboard is mounted on a tenant subdomain, but a non-owner could
// theoretically land on it briefly — the modal still confirms intent).

const DemoClassroomCard = () => {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [opening, setOpening] = useState(false);

  if (!currentUser || currentUser.role !== 'creator') {
    return null;
  }

  const openRoom = async () => {
    setOpening(true);
    try {
      const res = await client.post('/tutor/demo-classroom');
      // Stash the freshly minted room url + token in sessionStorage so
      // the room page can pick them up without a second roundtrip.
      sessionStorage.setItem(
        'demo-classroom-session',
        JSON.stringify({
          room_url: res.data.room_url,
          token: res.data.token,
          expires_at: res.data.expires_at,
        }),
      );
      setShowWarning(false);
      navigate('/demo-classroom');
    } catch (err) {
      const code = err?.response?.status;
      if (code === 403) {
        addToast(
          "You're over your monthly minute quota — practice room is paused until your quota resets or you top up.",
          'error',
        );
      } else {
        addToast(
          getErrorMessage(err, "Could not open the practice room. Try again in a moment."),
          'error',
        );
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <section className="bg-white shadow-soft rounded-3xl p-6 space-y-3">
        <h2 className="text-lg font-bold text-kotoba-primary">
          Practice your classroom
        </h2>
        <p className="text-sm text-kotoba-text/80">
          Open a private classroom just for you. No student joins — it's
          a chance to get comfortable with the audio, video, and
          screen-share controls before your first real lesson.
        </p>
        <p className="text-sm text-kotoba-text/60">
          Heads up: Daily.co charges us by the minute, so time in here
          counts against your monthly minute quota the same as a real
          lesson would.
        </p>
        <div>
          <button
            type="button"
            onClick={() => setShowWarning(true)}
            className="inline-flex items-center px-5 py-2.5 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary"
          >
            Open practice room
          </button>
        </div>
      </section>

      {showWarning && (
        <div
          className="fixed z-50 inset-0 overflow-y-auto"
          aria-labelledby="demo-warning-title"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => !opening && setShowWarning(false)}
              />
            </div>
            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="inline-block align-bottom bg-white rounded-3xl text-left overflow-hidden shadow-soft transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-6 pt-6 pb-4">
                <h3
                  id="demo-warning-title"
                  className="text-lg leading-6 font-bold text-kotoba-primary"
                >
                  Heads up — practice time uses your quota
                </h3>
                <p className="mt-3 text-sm text-kotoba-text/80">
                  This opens a private classroom for you to get
                  comfortable with the controls. Daily.co charges us by
                  the minute either way, so time you spend here counts
                  against your monthly minute quota same as a real
                  lesson. Take a few minutes to get familiar — but
                  don't camp out.
                </p>
              </div>
              <div className="bg-kotoba-background/40 px-6 py-3 flex flex-row-reverse gap-3">
                <button
                  type="button"
                  onClick={openRoom}
                  disabled={opening}
                  className="inline-flex justify-center rounded-md px-4 py-2 text-sm font-semibold text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary disabled:opacity-60"
                >
                  {opening ? 'Opening…' : 'Open the room'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWarning(false)}
                  disabled={opening}
                  className="inline-flex justify-center rounded-md border border-kotoba-text/20 px-4 py-2 text-sm font-medium text-kotoba-text/80 bg-white hover:bg-kotoba-background/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DemoClassroomCard;
