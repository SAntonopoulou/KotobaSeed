import React, { useEffect, useState } from 'react';
import { FaShieldAlt } from 'react-icons/fa';
import client from '../api/client';

// Tenant-scoped read of the tutor's APPROVED credentials. Shown on the
// public site hero so visitors see "verified DELE C2 / CELTA" near the
// tutor's name. Identity verifications (Stripe Connect KYC) are folded
// into a single generic "Verified by Stripe" pill rather than listing
// the document type — fewer words, same trust signal.

const KIND_LABEL = {
  language_proficiency: 'Language',
  teaching_credential: 'Credential',
  identity: 'Identity (Stripe)',
};

const VerifiedCredentialsBadges = ({ className = '' }) => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/verifications/public');
        if (!cancelled) setItems(res.data || []);
      } catch {
        // Endpoint failure is harmless — just don't render badges.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((row) => {
        const label =
          row.kind === 'language_proficiency'
            ? `Verified ${row.language || 'language'}`
            : row.kind === 'teaching_credential'
            ? row.description
            : KIND_LABEL[row.kind] || 'Verified';
        return (
          <li
            key={row.id}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-kotoba-primary/10 text-kotoba-primary text-xs font-semibold"
            title={row.description}
          >
            <FaShieldAlt className="text-kotoba-primary" aria-hidden />
            {label}
          </li>
        );
      })}
    </ul>
  );
};

export default VerifiedCredentialsBadges;
