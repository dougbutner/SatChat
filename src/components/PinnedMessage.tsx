import React from 'react';
import { Pin, Clock } from 'lucide-react';

interface PinnedMessageProps {
  message: {
    id: number;
    message: string;
    user: string;
    timestamp: string;
    expiresAt: string;
  };
}

const PinnedMessage: React.FC<PinnedMessageProps> = ({ message }) => {
  // Format time remaining
  const calculateTimeRemaining = () => {
    const expiry = new Date(message.expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    
    // For demo purposes, always show some time remaining
    const hoursRemaining = 24 - new Date().getHours();
    return `${hoursRemaining} hours`;
  };
  
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <Pin className="text-warning-500" size={18} />
        </div>
        <div className="flex-grow">
          <div className="flex justify-between items-start">
            <p className="font-medium text-gray-800">@{message.user}</p>
            <div className="flex items-center text-xs text-gray-500">
              <Clock size={14} className="mr-1" />
              <span>{calculateTimeRemaining()} left</span>
            </div>
          </div>
          <p className="mt-1 text-gray-700">{message.message}</p>
          <div className="mt-2 flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {new Date(message.timestamp).toLocaleString()}
            </span>
            <button className="text-xs text-primary-600 hover:text-primary-800 transition-colors">
              View in Telegram
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PinnedMessage;