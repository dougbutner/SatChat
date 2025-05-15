import React from 'react';
import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertTriangle size={64} className="text-bitcoin-orange mb-6" />
      <h1 className="text-4xl font-bold text-gray-800 mb-4">404 - Page Not Found</h1>
      <p className="text-gray-600 max-w-md mb-8">
        The page you're looking for doesn't exist or has been moved. Let's get you back on track.
      </p>
      <Link
        to="/"
        className="py-3 px-6 bg-bitcoin-orange text-white rounded-md hover:bg-bitcoin-dark transition-colors flex items-center"
      >
        <Home size={20} className="mr-2" />
        Back to Home
      </Link>
    </div>
  );
};

export default NotFound;