import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { FaBell, FaTimes } from 'react-icons/fa';
import { useInbox } from '../context/InboxContext';
import { formatDateTime } from '../utils/dates';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  // WS-driven freshness — the InboxContext WS pushes NOTIFICATION_NEW
  // events; the counter bumps on each, triggering a re-fetch here.
  const { notificationTick } = useInbox();

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await client.get('/notifications/');
      // Defensive: API contract is list[Notification] but a misbehaving
      // proxy or error shape would crash the bell render on the next line.
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Long-interval poll only as a fallback in case the WS is wedged.
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    // Skip the very first tick (initial state 0); only refetch on bumps.
    if (notificationTick > 0) {
      fetchNotifications();
    }
  }, [notificationTick, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await client.patch(`/notifications/${id}/read`);
      fetchNotifications();
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await client.patch(`/notifications/read-all`);
      fetchNotifications();
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
    }
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const unreadCount = unreadNotifications.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} aria-label="Notifications" className="relative">
        <FaBell className="h-6 w-6 text-kotoba-text/60 hover:text-kotoba-text/80" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="flex justify-between items-center px-4 py-2 border-b">
            <div className="text-sm text-kotoba-text/80 font-bold">Notifications</div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} className="text-xs text-kotoba-primary hover:underline">Mark all as read</button>
            )}
          </div>
          <div className="py-1 max-h-96 overflow-y-auto">
            {unreadCount === 0 ? (
              <div className="px-4 py-3 text-sm text-kotoba-text/60">No new notifications.</div>
            ) : (
              unreadNotifications.map(notif => (
                <div key={notif.id} className="group px-4 py-3 border-b hover:bg-kotoba-background/40 bg-kotoba-primary/5">
                  <div className="flex justify-between items-start">
                    <Link to={notif.link || '#'} onClick={() => { setIsOpen(false); handleMarkAsRead(notif.id); }} className="text-sm text-kotoba-text/90 pr-2">
                      {notif.message}
                    </Link>
                    <button onClick={() => handleMarkAsRead(notif.id)} className="opacity-0 group-hover:opacity-100 text-kotoba-text/40 hover:text-kotoba-text/70">
                      <FaTimes size={12} />
                    </button>
                  </div>
                  <div className="text-xs text-kotoba-text/40 mt-1">{formatDateTime(notif.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
