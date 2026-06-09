import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const ArchivedConversations = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  // SSO-correct auth source. localStorage is per-origin so the user can
  // be authenticated via the .kotobaseed.net cookie even when no token
  // is stored on this subdomain.
  const { currentUser, loading: authLoading } = useAuth();
  const user = currentUser;

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const messagesContainerRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) navigate('/login');
  }, [authLoading, currentUser, navigate]);

  const fetchArchivedConversations = useCallback(async () => {
    if (!currentUser) return;
    setIsLoadingConversations(true);
    try {
      const response = await client.get('/conversations/archive');
      setConversations(response.data);
    } catch (error) {
      addToast('Failed to load archived conversations', 'error');
    } finally {
      setIsLoadingConversations(false);
    }
  }, [addToast, currentUser]);

  const fetchCurrentConversation = useCallback(async () => {
    if (!conversationId || !currentUser) {
      setCurrentConversation(null);
      return;
    }
    setIsLoadingMessages(true);
    try {
      const response = await client.get(`/conversations/${conversationId}`);
      setCurrentConversation(response.data);
    } catch (error) {
      addToast('Failed to load conversation', 'error');
      setCurrentConversation(null);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversationId, addToast, currentUser]);

  useEffect(() => {
    fetchArchivedConversations();
  }, [fetchArchivedConversations]);

  useEffect(() => {
    fetchCurrentConversation();
  }, [fetchCurrentConversation]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [currentConversation?.messages]);

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (!user) return <div className="p-10 text-center">Loading user data...</div>;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex h-[calc(100vh-128px)] bg-white shadow-lg rounded-lg">
        {/* Left Column: Conversation List */}
        <div className="w-1/3 border-r border-kotoba-text/10 overflow-y-auto">
          <div className="p-4 border-b border-kotoba-text/10">
            <h2 className="text-xl font-bold text-kotoba-text/90">Archived Conversations</h2>
          </div>
          {isLoadingConversations ? (
            <div className="p-4 text-kotoba-text/60">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-kotoba-text/60">No archived conversations.</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => navigate(`/messages/archive/${conv.id}`)}
                className={`flex items-center p-4 border-b border-kotoba-text/10 cursor-pointer hover:bg-kotoba-background/40 ${conversationId == conv.id ? 'bg-kotoba-primary/5 border-l-4 border-kotoba-primary' : ''}`}
              >
                <div className="flex-shrink-0 mr-3">
                  {conv.other_participant.avatar_url ? (
                    <img className="h-10 w-10 rounded-full object-cover" src={conv.other_participant.avatar_url} alt={conv.other_participant.full_name} />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-kotoba-primary/10 flex items-center justify-center text-kotoba-primary font-bold text-sm">
                      {conv.other_participant.full_name ? conv.other_participant.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium text-kotoba-text">
                      {conv.other_participant.full_name}
                    </p>
                    <p className="text-xs text-kotoba-text/60">
                      {formatDateTime(conv.updated_at)}
                    </p>
                  </div>
                  <p className="text-sm text-kotoba-text/70 truncate">
                    {conv.request_title}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Chat Window */}
        <div className="flex-1 flex flex-col">
          {currentConversation ? (
            <>
              <div className="bg-white p-4 border-b border-kotoba-text/10 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-kotoba-text/90">{currentConversation.request_title}</h3>
                  <p className="text-sm text-kotoba-text/70">
                    {user.id === currentConversation.teacher_id ? `Student: ${currentConversation.student.full_name}` : `Teacher: ${currentConversation.teacher.full_name}`}
                  </p>
                </div>
              </div>

              <div ref={messagesContainerRef} className="flex-1 p-4 overflow-y-auto bg-kotoba-background/40 min-h-0">
                {isLoadingMessages ? (
                  <div className="text-center text-kotoba-text/60">Loading messages...</div>
                ) : currentConversation.messages.length === 0 ? (
                  <div className="text-center text-kotoba-text/60">No messages yet.</div>
                ) : (
                  currentConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex mb-4 ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg shadow relative ${
                          message.sender_id === user.id ? 'bg-kotoba-primary text-white' : 'bg-kotoba-text/20 text-kotoba-text/90'
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <span className="block text-xs text-right opacity-75 mt-1">
                          {formatDateTime(message.created_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="bg-white p-4 border-t border-kotoba-text/10 text-center text-kotoba-text/70">
                This conversation is closed.
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-kotoba-text/60">
              Select a conversation to view the archive.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArchivedConversations;
