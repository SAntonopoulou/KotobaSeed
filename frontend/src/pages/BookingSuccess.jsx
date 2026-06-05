import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const BookingSuccess = () => {
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  return (
    <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-3" aria-hidden>✓</div>
        <h1 className="text-2xl font-bold text-kotoba-primary mb-2">You're booked.</h1>
        <p className="text-kotoba-text mb-6">
          {bookingId
            ? `Your booking #${bookingId} is confirmed. We've emailed the details.`
            : "Your booking is confirmed. We've emailed the details."}
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-2.5 rounded-lg bg-kotoba-primary text-white font-semibold hover:bg-green-800"
        >
          Back to the site
        </Link>
      </div>
    </div>
  );
};

export default BookingSuccess;
