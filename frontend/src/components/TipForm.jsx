import React, { useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const TipForm = ({ projectId }) => {
  const [amount, setAmount] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (amount < 1) {
      addToast('Tip amount must be at least €1.00', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await client.post(`/projects/${projectId}/tip`, {
        amount: Math.round(amount * 100), // Send amount in cents
      });
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (error) {
      addToast(error.response?.data?.detail || 'Failed to initiate tip.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-kotoba-text/10">
      <h4 className="text-sm font-medium text-kotoba-text mb-3">Say Thanks with a Tip</h4>
      <form onSubmit={handleSubmit} className="flex items-center">
        <div className="relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-kotoba-text/60 sm:text-sm">€</span>
          </div>
          <input
            type="number"
            name="amount"
            id="amount"
            className="focus:ring-kotoba-primary focus:border-kotoba-primary block w-full pl-7 pr-12 sm:text-sm border-kotoba-text/20 rounded-md"
            placeholder="5.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            step="1"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-kotoba-primary hover:bg-kotoba-primary/90 disabled:bg-kotoba-primary/40"
        >
          {isSubmitting ? 'Sending...' : 'Send Tip'}
        </button>
      </form>
    </div>
  );
};

export default TipForm;
