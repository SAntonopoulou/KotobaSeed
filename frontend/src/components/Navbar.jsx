import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import logo from '../assets/Logo - Rectangle.png';
import Notifications from './Notifications';
import InboxDropdown from './InboxDropdown'; // Import InboxDropdown
import { useInbox } from '../context/InboxContext'; // Import useInbox
import { FaEnvelope } from 'react-icons/fa'; // Import an icon
import { tutorSiteUrl } from '../hooks/useTenant';

const Navbar = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [user, setUser] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const userMenuRef = useRef(null);
  const inboxMenuRef = useRef(null);
  const { unreadCount } = useInbox();

  useEffect(() => {
    const fetchUser = async () => {
      if (token) {
        try {
          const response = await client.get('/users/me');
          setUser(response.data);
        } catch (error) {
          console.error("Failed to fetch user for navbar", error);
          if (error.response && error.response.status === 403) {
            // This case should now be handled by the axios interceptor in client.js
            // If it still happens, it means the token is truly invalid or expired.
            localStorage.removeItem('token');
            setUser(null);
            navigate('/login');
            // No window.location.reload() here, AuthContext should handle state
          }
        }
      }
    };
    fetchUser();
  }, [token]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (inboxMenuRef.current && !inboxMenuRef.current.contains(event.target)) {
        setShowInbox(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuRef, inboxMenuRef]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
    window.location.reload(); // This reload is still necessary to clear all component states
  };

  const handleSearch = (e) => {
      e.preventDefault();
      if (searchQuery.trim()) {
          navigate(`/projects?search=${encodeURIComponent(searchQuery)}`);
      }
  };

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/">
                <img className="h-8 w-auto" src={logo} alt="Kotobaseed" />
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {user ? (
                <>
                  <Link to="/projects" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Projects</Link>
                  <Link to="/requests" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Requests</Link>
                  <Link to="/groups" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Groups</Link>
                  <Link to="/library" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Find a tutor</Link>
                  <Link to="/archive" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Archive</Link>
                  <Link to="/pricing" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Pricing</Link>

                  {user.role === 'creator' && <Link to="/teacher/dashboard" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Dashboard</Link>}
                  {user.role === 'student' && <Link to="/student/dashboard" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">My Pledges</Link>}
                  {user.role === 'student' && <Link to="/student/assignments" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Homework</Link>}
                  {user.role === 'admin' && <Link to="/admin/dashboard" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Admin</Link>}
                </>
              ) : (
                <>
                  <Link to="/library" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Find a tutor</Link>
                  <Link to="/archive" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Archive</Link>
                  <Link to="/pricing" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Pricing</Link>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-2 lg:ml-6 lg:justify-end">
              <form onSubmit={handleSearch} className="max-w-lg w-full lg:max-w-xs">
                  <label htmlFor="search" className="sr-only">Search</label>
                  <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                          </svg>
                      </div>
                      <input
                          id="search"
                          name="search"
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="Search projects"
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                      />
                  </div>
              </form>
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {user ? (
              <div className="flex items-center space-x-4">
                <div className="relative" ref={inboxMenuRef}>
                  <button onClick={() => setShowInbox(!showInbox)} className="text-gray-500 hover:text-gray-700 relative">
                    <FaEnvelope size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {showInbox && <InboxDropdown closeDropdown={() => setShowInbox(false)} />}
                </div>
                <Notifications />

                <div className="relative" ref={userMenuRef}>
                    <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none">
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt={user.full_name} className="h-8 w-8 rounded-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${user.full_name}&background=random`; }} />
                        ) : (
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                            </div>
                        )}
                    </button>

                    {showUserMenu && (
                        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <Link to={`/profile/${user.id}`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserMenu(false)}>Your Profile</Link>
                            <Link to="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setShowUserMenu(false)}>Settings</Link>
                            {user.tutor_slug && (
                                <>
                                    <div className="border-t border-gray-100 my-1" />
                                    <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">Your tutor site</div>
                                    <a
                                        href={tutorSiteUrl(user.tutor_slug, '/')}
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        onClick={() => setShowUserMenu(false)}
                                    >
                                        Visit your site
                                    </a>
                                    <a
                                        href={tutorSiteUrl(user.tutor_slug, '/dashboard')}
                                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        onClick={() => setShowUserMenu(false)}
                                    >
                                        Manage your site
                                    </a>
                                    <div className="border-t border-gray-100 my-1" />
                                </>
                            )}
                            <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Logout</button>
                        </div>
                    )}
                </div>
              </div>
            ) : (
              <div className="flex space-x-4">
                <Link to="/login" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">Login</Link>
                <Link to="/register" className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium">Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;