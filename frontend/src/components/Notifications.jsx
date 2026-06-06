import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { FaBell, FaTimes } from 'react-icons/fa';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await client.get('/notifications/');
      setNotifications(response.data);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

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
      <button onClick={() => setIsOpen(!isOpen)} className="relative">
        <FaBell className="h-6 w-6 text-gray-500 hover:text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="flex justify-between items-center px-4 py-2 border-b">
            <div className="text-sm text-gray-700 font-bold">Notifications</div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} className="text-xs text-kotoba-primary hover:underline">Mark all as read</button>
            )}
          </div>
          <div className="py-1 max-h-96 overflow-y-auto">
            {unreadCount === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">No new notifications.</div>
            ) : (
              unreadNotifications.map(notif => (
                <div key={notif.id} className="group px-4 py-3 border-b hover:bg-gray-50 bg-kotoba-primary/5">
                  <div className="flex justify-between items-start">
                    <Link to={notif.link || '#'} onClick={() => { setIsOpen(false); handleMarkAsRead(notif.id); }} className="text-sm text-gray-800 pr-2">
                      {notif.message}
                    </Link>
                    <button onClick={() => handleMarkAsRead(notif.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600">
                      <FaTimes size={12} />
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(notif.created_at).toLocaleString()}</div>
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
