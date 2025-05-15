import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: string;
  positive?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, change, positive = true }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow border border-gray-100 transition-all hover:shadow-md">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className="p-3 rounded-full bg-gray-50">{icon}</div>
      </div>
      
      {change && (
        <div className="mt-4 flex items-center">
          {positive ? (
            <TrendingUp size={16} className="text-success-500 mr-1" />
          ) : (
            <TrendingDown size={16} className="text-error-500 mr-1" />
          )}
          <span className={`text-sm font-medium ${positive ? 'text-success-700' : 'text-error-700'}`}>
            {change}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatCard;