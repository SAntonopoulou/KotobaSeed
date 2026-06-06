import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import client from '../api/client';

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
  const ws = useRef(null); // Ref for the global WebSocket
  const token = localStorage.getItem('token');

  const fetchUnreadCount = useCallback(async () => {
    if (!token) {
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
  }, [token]);

  // Global WebSocket for real-time unread count updates
  useEffect(() => {
    if (!token) {
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

    // --- START: Corrected WebSocket URL Logic ---
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    // Use VITE_API_URL's host for WebSocket connection, falling back to window.location.host
    const wsHost = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL).host : window.location.host;
    const wsUrl = `${wsProtocol}://${wsHost}/conversations/ws?token=${token}`;
    // --- END: Corrected WebSocket URL Logic ---

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("Global Inbox WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "UNREAD_COUNT_UPDATE") {
        setUnreadCount(msg.unread_count);
      } else if (msg.type === "NOTIFICATION_NEW") {
        // Bump the tick so any subscriber (e.g. Notifications dropdown)
        // re-fetches without us coupling them via a callback.
        setNotificationTick((t) => t + 1);
      }
    };

    ws.current.onclose = () => {
      console.log("Global Inbox WebSocket disconnected");
      // Attempt to reconnect after a delay if disconnected unexpectedly
      if (token) { // Only reconnect if user is still logged in
        setTimeout(() => {
          console.log("Attempting to reconnect global Inbox WebSocket...");
          // Re-trigger the useEffect by changing a dependency or explicitly calling connect logic
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
  }, [token, fetchUnreadCount]); // Reconnect if token changes

  // Initial fetch on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  const value = {
    unreadCount,
    fetchUnreadCount,
    notificationTick,
  };

  return (
    <InboxContext.Provider value={value}>
      {children}
    </InboxContext.Provider>
  );
};
