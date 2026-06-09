import React from 'react';
import { FaShieldAlt } from 'react-icons/fa';

const VerifiedBadge = ({ languages }) => {
  if (!languages || languages.length === 0) {
    return null;
  }

  const tooltipText = `Verified in: ${languages.join(', ')}`;

  return (
    <div className="relative inline-flex items-center group">
      <FaShieldAlt className="text-kotoba-primary ml-1" />
      <div className="absolute bottom-full mb-2 w-max bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {tooltipText}
      </div>
    </div>
  );
};

export default VerifiedBadge;
