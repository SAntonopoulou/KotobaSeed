import React from 'react';
import { Link } from 'react-router-dom';

const BookingCancelled = () => (
  <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
      <h1 className="text-2xl font-bold text-kotoba-primary mb-2">No charge made.</h1>
      <p className="text-kotoba-text mb-6">
        You backed out before the payment went through. Nothing was taken from your card. You're welcome to try again any time.
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

export default BookingCancelled;
