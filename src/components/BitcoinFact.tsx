import React, { useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';

const BitcoinFact: React.FC = () => {
  const facts = [
    "Bitcoin's smallest unit is a satoshi: 1 Bitcoin equals 100,000,000 satoshis.",
    "The Lightning Network enables instant Bitcoin payments with extremely low fees.",
    "Bitcoin's creator, Satoshi Nakamoto, remains anonymous to this day.",
    "The total supply of Bitcoin is capped at 21 million coins.",
    "Bitcoin's mining reward gets cut in half approximately every four years.",
    "The first commercial Bitcoin transaction was for two pizzas, worth 10,000 BTC.",
    "Bitcoin's blockchain has never been hacked or compromised.",
    "Over 18.5 million Bitcoins have already been mined as of 2025.",
    "The Bitcoin whitepaper was published on October 31, 2008.",
    "Bitcoin mining currently uses more renewable energy than many national grids.",
  ];
  
  const [currentFactIndex, setCurrentFactIndex] = useState(
    Math.floor(Math.random() * facts.length)
  );
  
  const getNextFact = () => {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * facts.length);
    } while (newIndex === currentFactIndex);
    setCurrentFactIndex(newIndex);
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
      <div className="flex justify-between items-start">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center">
          <Info className="mr-2 text-primary-600" size={18} />
          Bitcoin Fact
        </h2>
        <button 
          onClick={getNextFact}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Show another fact"
        >
          <RefreshCw size={16} className="text-gray-500" />
        </button>
      </div>
      <p className="mt-3 text-gray-700">
        {facts[currentFactIndex]}
      </p>
    </div>
  );
};

export default BitcoinFact;