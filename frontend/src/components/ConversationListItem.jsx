import React from 'react';
import Avatar from './Avatar';

// One row in the inbox sidebar. Pure presentation; the parent owns the
// click handler so it can route via react-router.
const ConversationListItem = ({ conversation, active, onClick }) => {
  if (!conversation) return null;
  // Rendered as a button so keyboard nav (Tab + Space/Enter) works and
  // screen readers announce it as interactive. text-left preserves the
  // visual layout of the previous div-as-row.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center p-4 border-b border-kotoba-text/10 hover:bg-kotoba-background/40 focus:outline-none focus:bg-kotoba-background/40 ${
        active ? 'bg-kotoba-primary/5 border-l-4 border-kotoba-primary' : ''
      }`}
    >
      <div className="flex-shrink-0 mr-3">
        <Avatar
          src={conversation.other_participant.avatar_url}
          name={conversation.other_participant.full_name}
          size={40}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2">
          <p className="text-sm font-medium text-kotoba-text truncate">
            {conversation.other_participant.full_name}
          </p>
          <p className="text-sm text-kotoba-text/70 truncate">
            {conversation.request_title}
          </p>
        </div>
        {conversation.unread_messages_count > 0 && (
          <span className="text-xs font-semibold text-kotoba-primary">
            {conversation.unread_messages_count} unread
          </span>
        )}
      </div>
    </button>
  );
};

export default ConversationListItem;
