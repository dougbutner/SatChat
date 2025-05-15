import React from 'react';
import { BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, PieChart as PieChartIcon, TrendingUp, Download } from 'lucide-react';

const Analytics: React.FC = () => {
  // Sample data - in a real app this would come from an API
  const dailyRewards = [
    { day: 'Mon', sats: 2450 },
    { day: 'Tue', sats: 3800 },
    { day: 'Wed', sats: 2900 },
    { day: 'Thu', sats: 4100 },
    { day: 'Fri', sats: 3600 },
    { day: 'Sat', sats: 1800 },
    { day: 'Sun', sats: 2200 },
  ];
  
  const activityDistribution = [
    { name: 'Messages', value: 65 },
    { name: 'Pinning', value: 25 },
    { name: 'Admin Actions', value: 10 },
  ];
  
  const COLORS = ['#F7931A', '#3A5FF3', '#10B981'];
  
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Analytics</h1>
        <button className="py-2 px-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors flex items-center text-sm">
          <Download size={16} className="mr-1" />
          Export Data
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
            <BarChart3 className="mr-2 text-primary-600" size={20} />
            Daily Rewards Distribution
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyRewards} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip 
                formatter={(value) => [`${value} sats`, 'Rewards']}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="sats" fill="#F7931A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 p-3 bg-gray-50 rounded-md text-center">
            <p className="text-gray-700 text-sm">
              <strong>Weekly Total:</strong> 20,850 sats
            </p>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
            <PieChartIcon className="mr-2 text-primary-600" size={20} />
            Activity Distribution
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={activityDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                dataKey="value"
                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {activityDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {activityDistribution.map((item, index) => (
              <div key={item.name} className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index] }}></div>
                <span className="text-sm text-gray-700">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
          <TrendingUp className="mr-2 text-primary-600" size={20} />
          Growth Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="border border-gray-200 rounded-md p-4">
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="text-2xl font-semibold text-gray-800 mt-1">156</p>
            <div className="flex items-center mt-2 text-success-500 text-sm">
              <TrendingUp size={14} className="mr-1" />
              <span>+12% from last week</span>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-md p-4">
            <p className="text-sm text-gray-500">Total Messages</p>
            <p className="text-2xl font-semibold text-gray-800 mt-1">4,328</p>
            <div className="flex items-center mt-2 text-success-500 text-sm">
              <TrendingUp size={14} className="mr-1" />
              <span>+8% from last week</span>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-md p-4">
            <p className="text-sm text-gray-500">Total Rewards</p>
            <p className="text-2xl font-semibold text-gray-800 mt-1">95,412 sats</p>
            <div className="flex items-center mt-2 text-success-500 text-sm">
              <TrendingUp size={14} className="mr-1" />
              <span>+15% from last week</span>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-md p-4">
            <p className="text-sm text-gray-500">Pinning Revenue</p>
            <p className="text-2xl font-semibold text-gray-800 mt-1">24,000 sats</p>
            <div className="flex items-center mt-2 text-success-500 text-sm">
              <TrendingUp size={14} className="mr-1" />
              <span>+5% from last week</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;