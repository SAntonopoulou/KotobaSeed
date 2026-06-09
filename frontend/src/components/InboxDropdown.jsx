import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useInbox } from '../context/InboxContext';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

const InboxDropdown = ({ closeDropdown }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { unreadCount, fetchUnreadCount } = useInbox(); // Destructure unreadCount
  // Auth via AuthContext (cookie-aware). localStorage is per-origin and
  // would render this dropdown empty on subdomains where the user is
  // actually signed in via the shared SSO cookie.
  const { currentUser } = useAuth();

  useEffect(() => {
    const fetchConversations = async () => {
      if (!currentUser) {
        setConversations([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await client.get('/conversations/summary');
        setConversations(response.data.conversations);
      } catch (error) {
        console.error('Failed to fetch conversation summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [unreadCount, currentUser]);

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return formatTime(dateString);
    }
    return date.toLocaleDateString();
  };

  return (
    <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
      <div className="px-4 py-2 text-sm text-kotoba-text/80 border-b border-kotoba-text/10">
        Messages
      </div>
      {loading ? (
        <div className="px-4 py-2 text-sm text-kotoba-text/60">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="px-4 py-2 text-sm text-kotoba-text/60">No conversations yet.</div>
      ) : (
        <div className="max-h-60 overflow-y-auto">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              to={`/messages/${conv.id}`}
              className={`flex items-center px-4 py-3 hover:bg-kotoba-background/60 ${conv.unread_messages_count > 0 ? 'bg-kotoba-primary/5' : ''}`}
              onClick={closeDropdown}
            >
              <div className="flex-shrink-0 mr-3">
                <Avatar
                  src={conv.other_participant.avatar_url}
                  name={conv.other_participant.full_name}
                  size={32}
                />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-kotoba-text">
                    {conv.other_participant.full_name}
                  </p>
                  <p className="text-xs text-kotoba-text/60">
                    {formatDate(conv.last_message_created_at || conv.updated_at)}
                  </p>
                </div>
                <p className={`text-sm text-kotoba-text/70 ${conv.unread_messages_count > 0 ? 'font-semibold' : ''} truncate`}>
                  {conv.last_message_content || 'No messages yet.'}
                </p>
                {conv.unread_messages_count > 0 && (
                  <span className="text-xs text-kotoba-primary">
                    {conv.unread_messages_count} unread
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      <Link
        to="/messages"
        className="block w-full text-center px-4 py-2 text-sm text-kotoba-primary hover:bg-kotoba-background/60 border-t border-kotoba-text/10"
        onClick={closeDropdown}
      >
        View all messages
      </Link>
    </div>
  );
};

export default InboxDropdown;
