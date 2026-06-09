import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import client from '../api/client';
import { useAuth } from './AuthContext';

const InboxContext = createContext();

export function useInbox() {
  return useContext(InboxContext);
}

export const InboxProvider = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  // Ticker that increments every time a server NOTIFICATION_NEW event
  // arrives. Components that want to react to fresh notifications
  // subscribe by depending on `notificationTick` in a useEffect.
  const [notificationTick, setNotificationTick] = useState(0);
  // Separate ticker for incoming chat messages, plus the metadata for
  // the most recent alert so subscribers can decide whether to ignore
  // (the open conversation already handled it via the per-conv WS) or
  // refetch the conversation list.
  const [messageTick, setMessageTick] = useState(0);
  const [lastMessageAlert, setLastMessageAlert] = useState(null);
  const ws = useRef(null); // Ref for the global WebSocket
  // Auth comes from AuthContext (cookie-aware). The WebSocket below
  // still needs a literal JWT to pass as a query param, so we fall back
  // to localStorage there — cookie-only users (rare cross-subdomain SSO
  // case where this subdomain never saw a login form) won't get the
  // realtime channel, but every HTTP fetch still works via the cookie.
  const { currentUser } = useAuth();

  const fetchUnreadCount = useCallback(async () => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }
    try {
      const response = await client.get('/conversations/summary');
      setUnreadCount(response.data.total_unread_count);
    } catch (error) {
      console.error('Failed to fetch unread message count:', error);
      setUnreadCount(0);
    }
  }, [currentUser]);

  // Global WebSocket for real-time unread count updates
  useEffect(() => {
    const wsToken = localStorage.getItem('token');
    if (!currentUser || !wsToken) {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      return;
    }

    // Close existing connection if token changes or component re-mounts
    if (ws.current) {
      ws.current.close();
    }

    // Build the WS URL relative to the current host. When VITE_API_URL is
    // an absolute URL (legacy dev where the SPA dev server and backend run
    // on different ports) we use its host; otherwise we connect through
    // the SPA's own host so Caddy routes the upgrade via the /api prefix.
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    const apiBase = import.meta.env.VITE_API_URL || '';
    let wsHost = window.location.host;
    let wsPath = '/api/conversations/ws';
    if (/^https?:\/\//i.test(apiBase)) {
      try {
        const parsed = new URL(apiBase);
        wsHost = parsed.host;
        // Absolute backend URLs (dev) don't sit behind the /api prefix.
        wsPath = '/conversations/ws';
      } catch (_) {
        /* fall through to relative defaults */
      }
    }
    const wsUrl = `${wsProtocol}://${wsHost}${wsPath}?token=${wsToken}`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("Global Inbox WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // WS envelope protocol v1: server stamps `version: 1` on every
      // payload. Old shapes (no version) still parse the same fields,
      // so we treat both interchangeably until v2 lands.
      if (msg.type === "UNREAD_COUNT_UPDATE") {
        setUnreadCount(msg.unread_count);
      } else if (msg.type === "NOTIFICATION_NEW") {
        // Bump the tick so any subscriber (e.g. Notifications dropdown)
        // re-fetches without us coupling them via a callback.
        setNotificationTick((t) => t + 1);
      } else if (msg.type === "NEW_MESSAGE_ALERT") {
        // A chat message landed in a conversation this user is in.
        // Refresh the unread badge and bump a tick so the Inbox list
        // re-fetches (newest-first ordering + unread counts). The
        // per-conversation WS already handled the in-thread append if
        // the user is sitting on that thread, so we don't touch
        // currentConversation here.
        fetchUnreadCount();
        setLastMessageAlert({
          conversation_id: msg.conversation_id,
          sender_id: msg.sender_id,
          ts: Date.now(),
        });
        setMessageTick((t) => t + 1);
      }
    };

    ws.current.onclose = () => {
      console.log("Global Inbox WebSocket disconnected");
      // Attempt to reconnect after a delay if disconnected unexpectedly
      if (currentUser) { // Only reconnect if user is still logged in
        setTimeout(() => {
          console.log("Attempting to reconnect global Inbox WebSocket...");
          fetchUnreadCount();
        }, 3000);
      }
    };

    ws.current.onerror = (error) => {
      console.error("Global Inbox WebSocket error:", error);
    };

    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [currentUser, fetchUnreadCount]);

  // Initial fetch on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  const value = {
    unreadCount,
    fetchUnreadCount,
    notificationTick,
    messageTick,
    lastMessageAlert,
  };

  return (
    <InboxContext.Provider value={value}>
      {children}
    </InboxContext.Provider>
  );
};
