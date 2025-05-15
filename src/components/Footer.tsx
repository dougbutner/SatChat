import React from 'react';
import { Bitcoin, Github as GitHub, Twitter } from 'lucide-react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-800 text-white py-8 mt-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <Bitcoin className="text-bitcoin-orange mr-2" size={24} />
            <span className="font-bold text-lg">SatChat</span>
          </div>
          
          <div className="text-sm text-gray-300 mb-4 md:mb-0">
            <p>Built for the Bitcoin 2025 Hackathon</p>
            <p>Powered by exSat's native layer</p>
          </div>
          
          <div className="flex space-x-4">
            <a 
              href="https://github.com/your-repo/satchat" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-white transition-colors"
              aria-label="GitHub Repository"
            >
              <GitHub size={20} />
            </a>
            <a 
              href="https://twitter.com/satchatapp" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-white transition-colors"
              aria-label="Twitter Account"
            >
              <Twitter size={20} />
            </a>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-700 text-center text-sm text-gray-400">
          <p>© {currentYear} SatChat. All rights reserved.</p>
          <p className="mt-1">
            <a href="#" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
            {' • '}
            <a href="#" className="hover:text-gray-300 transition-colors">Terms of Service</a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;