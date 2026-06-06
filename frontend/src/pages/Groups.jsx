import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [myGroups, setMyGroups] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = async () => {
    try {
      const [groupsRes, myGroupsRes] = await Promise.all([
        client.get('/language-groups/'),
        client.get('/language-groups/me')
      ]);
      setGroups(groupsRes.data);
      setMyGroups(new Set(myGroupsRes.data.map(g => g.id)));
    } catch (error) {
      console.error("Failed to fetch groups", error);
      addToast("Could not load groups.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleJoin = async (groupId) => {
    try {
      await client.post(`/language-groups/${groupId}/join`);
      setMyGroups(prev => new Set(prev).add(groupId));
      addToast("Successfully joined group!", "success");
    } catch (error) {
      addToast("Failed to join group.", "error");
    }
  };

  if (loading) return <div className="p-10 text-center">Loading groups...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Language Groups</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {groups.map(group => (
          <div key={group.id} className="bg-white shadow-md rounded-lg p-6 flex flex-col justify-between">
            <h2 className="text-xl font-semibold text-gray-800">{group.language_name}</h2>
            <button
              onClick={() => handleJoin(group.id)}
              disabled={myGroups.has(group.id)}
              className="mt-4 w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 disabled:bg-gray-400"
            >
              {myGroups.has(group.id) ? 'Joined' : 'Join'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Groups;
