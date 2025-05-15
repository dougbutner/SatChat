import React, { useState } from 'react';
import { Settings, Save, BarChart3, Zap, MessageCircle, Pin } from 'lucide-react';

const AdminPanel: React.FC = () => {
  // These would come from API in a real implementation
  const [settings, setSettings] = useState({
    rewardPerMessage: 1,
    dailyRewardCap: 10000,
    pinningCost: 1000,
    pinningDuration: 24, // hours
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings({
      ...settings,
      [name]: parseInt(value, 10),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Would save to the backend in a real implementation
    console.log("Saving settings:", settings);
    // Show success notification
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
        <div className="bg-yellow-50 text-yellow-800 py-1 px-3 rounded-full text-sm border border-yellow-200 flex items-center">
          <Settings size={14} className="mr-1" />
          Admin Access
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
            <Settings className="mr-2 text-primary-600" size={20} />
            Reward Configuration
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="rewardPerMessage" className="block text-sm font-medium text-gray-700 mb-1">
                Reward per Message (sats)
              </label>
              <div className="flex items-center">
                <div className="relative flex-grow">
                  <Zap className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="number"
                    id="rewardPerMessage"
                    name="rewardPerMessage"
                    min="1"
                    max="100"
                    value={settings.rewardPerMessage}
                    onChange={handleChange}
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <span className="ml-2 text-gray-500">sats</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Amount of satoshis rewarded for each message</p>
            </div>

            <div>
              <label htmlFor="dailyRewardCap" className="block text-sm font-medium text-gray-700 mb-1">
                Daily Reward Cap
              </label>
              <div className="flex items-center">
                <div className="relative flex-grow">
                  <MessageCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="number"
                    id="dailyRewardCap"
                    name="dailyRewardCap"
                    min="1000"
                    max="100000"
                    step="1000"
                    value={settings.dailyRewardCap}
                    onChange={handleChange}
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <span className="ml-2 text-gray-500">sats</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Maximum total rewards distributed per day</p>
            </div>

            <div>
              <label htmlFor="pinningCost" className="block text-sm font-medium text-gray-700 mb-1">
                Message Pinning Cost
              </label>
              <div className="flex items-center">
                <div className="relative flex-grow">
                  <Pin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="number"
                    id="pinningCost"
                    name="pinningCost"
                    min="100"
                    max="10000"
                    step="100"
                    value={settings.pinningCost}
                    onChange={handleChange}
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <span className="ml-2 text-gray-500">sats</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">Cost to pin a message in the group</p>
            </div>

            <div>
              <label htmlFor="pinningDuration" className="block text-sm font-medium text-gray-700 mb-1">
                Pinning Duration
              </label>
              <div className="flex items-center">
                <div className="relative flex-grow">
                  <BarChart3 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="number"
                    id="pinningDuration"
                    name="pinningDuration"
                    min="1"
                    max="168"
                    value={settings.pinningDuration}
                    onChange={handleChange}
                    className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <span className="ml-2 text-gray-500">hours</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">How long a pinned message stays pinned</p>
            </div>

            <button 
              type="submit"
              className="w-full py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center justify-center font-medium"
            >
              <Save className="mr-2" size={18} />
              Save Configuration
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
              <BarChart3 className="mr-2 text-primary-600" size={20} />
              Current Status
            </h2>
            
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Today's Rewards Distributed</span>
                  <span className="font-semibold text-bitcoin-orange">3,245 sats</span>
                </div>
                <div className="mt-2 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-bitcoin-orange rounded-full" 
                    style={{ width: `${(3245 / settings.dailyRewardCap) * 100}%` }}
                  ></div>
                </div>
                <div className="mt-1 text-xs text-gray-500 text-right">
                  {Math.round((3245 / settings.dailyRewardCap) * 100)}% of daily cap
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Active Users Today</p>
                  <p className="text-xl font-semibold text-gray-800 mt-1">42</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Messages Today</p>
                  <p className="text-xl font-semibold text-gray-800 mt-1">187</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Active Pinned Messages</p>
                  <p className="text-xl font-semibold text-gray-800 mt-1">3</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Total Sats Donated</p>
                  <p className="text-xl font-semibold text-gray-800 mt-1">8,500</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full py-2.5 px-4 bg-bitcoin-orange text-white rounded-md hover:bg-bitcoin-dark transition-colors flex items-center justify-center font-medium">
                Pause Rewards
              </button>
              <button className="w-full py-2.5 px-4 border border-error-500 text-error-500 rounded-md hover:bg-error-50 transition-colors flex items-center justify-center font-medium">
                Reset Daily Stats
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;