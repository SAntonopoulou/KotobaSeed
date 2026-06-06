import React, { useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const PledgeForm = ({ projectId, projectName }) => {
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [isPledging, setIsPledging] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsPledging(true);

    const amount = parseFloat(pledgeAmount);
    if (isNaN(amount) || amount <= 0) {
      addToast('Please enter a valid pledge amount.', 'error');
      setIsPledging(false);
      return;
    }

    const amountInCents = Math.round(amount * 100);

    try {
      const response = await client.post('/pledges/', {
        project_id: projectId,
        amount: amountInCents,
      });
      window.location.href = response.data.checkout_url;
    } catch (error) {
      console.error('Pledge failed:', error);
      addToast(error.response?.data?.detail || 'Failed to create pledge.', 'error');
      setIsPledging(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="pledgeAmount" className="block text-sm font-medium text-gray-700">
          Pledge Amount (EUR)
        </label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">€</span>
          </div>
          <input
            type="number"
            name="pledgeAmount"
            id="pledgeAmount"
            className="focus:ring-kotoba-primary focus:border-kotoba-primary block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
            placeholder="10.00"
            min="1"
            step="0.01"
            value={pledgeAmount}
            onChange={(e) => setPledgeAmount(e.target.value)}
            required
            disabled={isPledging}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isPledging}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary disabled:bg-kotoba-primary/40"
      >
        {isPledging ? 'Processing...' : 'Pledge Now'}
      </button>
    </form>
  );
};

export default PledgeForm;
