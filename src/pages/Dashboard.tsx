import React, { useState } from 'react';
import { Zap, MessageCircle, Bell, Users } from 'lucide-react';

import StatCard from '../components/StatCard';
import PinnedMessage from '../components/PinnedMessage';
import RewardCard from '../components/RewardCard';
import BitcoinFact from '../components/BitcoinFact';

const Dashboard: React.FC = () => {
  // This would be replaced with actual data from the API
  const [stats] = useState({
    balance: 125,
    messagesRewarded: 42,
    pinnedMessages: 3,
    groupMembers: 156
  });

  const [pinnedMessages] = useState([
    {
      id: 1,
      message: "Check out this amazing Lightning wallet integration with BTCPay Server!",
      user: "satoshi21",
      timestamp: "2025-05-12T14:32:00Z",
      expiresAt: "2025-05-13T14:32:00Z"
    },
    {
      id: 2,
      message: "Join our Bitcoin meetup this weekend in San Francisco! RSVP with the link below.",
      user: "lightning_coder",
      timestamp: "2025-05-11T09:15:00Z",
      expiresAt: "2025-05-12T09:15:00Z"
    }
  ]);

  const [recentRewards] = useState([
    { id: 1, amount: 1, message: "Great insight on Lightning scalability!", timestamp: "2025-05-12T15:45:00Z" },
    { id: 2, amount: 1, message: "Thanks for sharing that Bitcoin article", timestamp: "2025-05-12T14:30:00Z" },
    { id: 3, amount: 1, message: "The hashrate discussion was fascinating", timestamp: "2025-05-12T12:10:00Z" }
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Dashboard</h1>
        <p className="text-gray-600 mb-6">
          Track your SatChat rewards and group activity
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            title="Available Balance" 
            value={`${stats.balance} sats`} 
            icon={<Zap className="text-bitcoin-orange" />} 
            change="+12 today"
            positive={true}
          />
          <StatCard 
            title="Messages Rewarded" 
            value={stats.messagesRewarded} 
            icon={<MessageCircle className="text-primary-600" />} 
            change="+5 today"
            positive={true}
          />
          <StatCard 
            title="Pinned Messages" 
            value={stats.pinnedMessages} 
            icon={<Bell className="text-warning-500" />} 
            change="+1 today"
            positive={true}
          />
          <StatCard 
            title="Group Members" 
            value={stats.groupMembers} 
            icon={<Users className="text-success-500" />} 
            change="+8 this week"
            positive={true}
          />
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Bell className="mr-2 text-warning-500" size={20} />
              Pinned Messages
            </h2>
            <div className="space-y-4">
              {pinnedMessages.length > 0 ? (
                pinnedMessages.map(msg => (
                  <PinnedMessage key={msg.id} message={msg} />
                ))
              ) : (
                <p className="text-gray-500 italic p-4 bg-gray-50 rounded-lg border border-gray-200">
                  No messages are currently pinned.
                </p>
              )}
            </div>
          </div>
          
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Zap className="mr-2 text-bitcoin-orange" size={20} />
              Recent Rewards
            </h2>
            <div className="space-y-3">
              {recentRewards.map(reward => (
                <RewardCard key={reward.id} reward={reward} />
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <BitcoinFact />
          
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full py-3 px-4 bg-bitcoin-orange text-white rounded-md hover:bg-bitcoin-dark transition-colors flex items-center justify-center font-medium">
                <Zap className="mr-2" size={18} />
                Claim Rewards
              </button>
              <button className="w-full py-3 px-4 border border-primary-600 text-primary-600 rounded-md hover:bg-primary-50 transition-colors flex items-center justify-center font-medium">
                <Bell className="mr-2" size={18} />
                Pin a Message
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;