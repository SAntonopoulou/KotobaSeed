import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useInbox } from '../context/InboxContext';

const InboxDropdown = ({ closeDropdown }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { unreadCount, fetchUnreadCount } = useInbox(); // Destructure unreadCount
  const token = localStorage.getItem('token'); // Get token directly

  useEffect(() => {
    const fetchConversations = async () => {
      if (!token) { // Check token before fetching
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
  }, [unreadCount, token]); // Changed dependency to unreadCount

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
      <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-200">
        Messages
      </div>
      {loading ? (
        <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="px-4 py-2 text-sm text-gray-500">No conversations yet.</div>
      ) : (
        <div className="max-h-60 overflow-y-auto">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              to={`/messages/${conv.id}`}
              className={`flex items-center px-4 py-3 hover:bg-gray-100 ${conv.unread_messages_count > 0 ? 'bg-kotoba-primary/5' : ''}`}
              onClick={closeDropdown}
            >
              <div className="flex-shrink-0 mr-3">
                {conv.other_participant.avatar_url ? (
                  <img className="h-8 w-8 rounded-full object-cover" src={conv.other_participant.avatar_url} alt={conv.other_participant.full_name} />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-kotoba-primary/10 flex items-center justify-center text-kotoba-primary font-bold text-xs">
                    {conv.other_participant.full_name ? conv.other_participant.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900">
                    {conv.other_participant.full_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(conv.last_message_created_at || conv.updated_at)}
                  </p>
                </div>
                <p className={`text-sm text-gray-600 ${conv.unread_messages_count > 0 ? 'font-semibold' : ''} truncate`}>
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
        className="block w-full text-center px-4 py-2 text-sm text-kotoba-primary hover:bg-gray-100 border-t border-gray-200"
        onClick={closeDropdown}
      >
        View All Messages
      </Link>
    </div>
  );
};

export default InboxDropdown;
