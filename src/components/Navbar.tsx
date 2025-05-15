import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bitcoin, Menu, X, Settings, Wallet, BarChart3, Home } from 'lucide-react';

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: <Home size={20} /> },
    { path: '/wallet', label: 'Wallet', icon: <Wallet size={20} /> },
    { path: '/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
    { path: '/admin', label: 'Admin', icon: <Settings size={20} /> },
  ];

  return (
    <nav className="bg-white shadow-md sticky top-0 z-10">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo and name */}
          <Link to="/" className="flex items-center space-x-2">
            <Bitcoin className="text-bitcoin-orange" size={28} />
            <span className="font-bold text-xl text-gray-800">SatChat</span>
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-8">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-1 px-3 py-2 rounded-md transition-colors ${
                  location.pathname === item.path
                    ? 'text-bitcoin-orange font-medium'
                    : 'text-gray-600 hover:text-bitcoin-orange'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={toggleMenu}
            className="md:hidden text-gray-600 focus:outline-none"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white shadow-lg pt-2 pb-4 px-4">
          <div className="flex flex-col space-y-2">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-2 px-4 py-3 rounded-md transition-colors ${
                  location.pathname === item.path
                    ? 'bg-gray-100 text-bitcoin-orange font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-bitcoin-orange'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;