import React from 'react';
import { Zap } from 'lucide-react';

interface RewardCardProps {
  reward: {
    id: number;
    amount: number;
    message: string;
    timestamp: string;
  };
}

const RewardCard: React.FC<RewardCardProps> = ({ reward }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 p-2 bg-orange-50 rounded-full">
          <Zap className="text-bitcoin-orange" size={16} />
        </div>
        <div className="flex-grow">
          <div className="flex justify-between items-start">
            <p className="font-medium text-gray-700 text-sm truncate max-w-[180px]">
              {reward.message}
            </p>
            <span className="text-bitcoin-orange text-sm font-semibold">
              +{reward.amount} sat
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(reward.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default RewardCard;