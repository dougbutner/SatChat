import React, { useState } from 'react';
import { Wallet, ArrowRight, Zap, QrCode, Check, Link, Copy } from 'lucide-react';

const WalletConnect: React.FC = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWalletAddress(e.target.value);
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would validate and send to the backend
    if (walletAddress.trim().startsWith('ln')) {
      setIsConnected(true);
    }
  };
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText('lnurl1dp68gurn8ghj7um9w3k7cmtd9hhxtnrdakj7ampd3kx2ar0veex7mgcqzysxqun0dpskyct5v3j8yenxvtpxd3j8g6r2d35kwctvde58ympcvun6a3k8yejzdenx932x9jrwvfjxc3mxgfr89erz0f3xccnrvd5k7m3sdrhxtnvvce59y6nxgfr89ek8yar4daej7arfde5k2a3svapx9ercv3ex2un59erxgekwwekv9jk2dr98qunsd35xzm3gv3jzynns0rs8qtpse5s');
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Connect Your Lightning Wallet</h1>
      <p className="text-gray-600 mb-8">
        Link your Lightning wallet to claim your earned Satoshis
      </p>
      
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-8">
        {!isConnected ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-2">
                Lightning Wallet Address
              </label>
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  id="walletAddress"
                  placeholder="lnurl1..."
                  value={walletAddress}
                  onChange={handleAddressChange}
                  className="pl-10 pr-3 py-3 w-full border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Enter your Lightning wallet address starting with 'ln'
              </p>
            </div>
            
            <div className="flex items-center justify-between space-x-4">
              <button 
                type="button"
                className="flex-1 py-3 px-4 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center font-medium"
              >
                <QrCode className="mr-2" size={18} />
                Scan QR Code
              </button>
              
              <button
                type="submit"
                className="flex-1 py-3 px-4 bg-bitcoin-orange text-white rounded-md hover:bg-bitcoin-dark transition-colors flex items-center justify-center font-medium"
              >
                Connect Wallet
                <ArrowRight className="ml-2" size={18} />
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-center bg-green-50 text-green-600 py-3 px-4 rounded-md">
              <Check className="mr-2" size={20} />
              <span className="font-medium">Wallet successfully connected!</span>
            </div>
            
            <div className="border border-gray-200 rounded-md p-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Wallet className="mr-2 text-primary-600" size={18} />
                  <span className="font-medium text-gray-700">Connected Wallet</span>
                </div>
                <span className="text-sm text-gray-500">Lightning Network</span>
              </div>
              <div className="mt-2 bg-gray-50 p-3 rounded flex items-center">
                <span className="text-gray-700 text-sm truncate flex-grow">
                  lnurl1...xd3j8g6r2
                </span>
                <button 
                  onClick={copyToClipboard}
                  className="ml-2 p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Copy wallet address"
                >
                  {isCopied ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>
            </div>
            
            <div className="border rounded-md border-gray-200 p-4">
              <h3 className="font-medium text-gray-700 mb-3 flex items-center">
                <Zap className="mr-2 text-bitcoin-orange" size={18} />
                Available Balance
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-800">125 sats</span>
                <button className="py-2 px-4 bg-bitcoin-orange text-white rounded-md hover:bg-bitcoin-dark transition-colors flex items-center text-sm font-medium">
                  <Zap className="mr-1" size={14} />
                  Claim Rewards
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <Link className="mr-2 text-primary-600" size={20} />
          Support for Lightning Wallets
        </h2>
        
        <p className="text-gray-700 mb-4">
          SatChat supports any Lightning-compatible wallet. Here are some popular options:
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-md p-4 hover:bg-gray-50 transition-colors">
            <h3 className="font-medium text-gray-800">Blue Wallet</h3>
            <p className="text-sm text-gray-600 mt-1">
              Open source Bitcoin wallet with Lightning support
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-md p-4 hover:bg-gray-50 transition-colors">
            <h3 className="font-medium text-gray-800">Muun</h3>
            <p className="text-sm text-gray-600 mt-1">
              Self-custodial wallet for Bitcoin and Lightning
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-md p-4 hover:bg-gray-50 transition-colors">
            <h3 className="font-medium text-gray-800">Wallet of Satoshi</h3>
            <p className="text-sm text-gray-600 mt-1">
              Simple, custodial Lightning wallet
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-md p-4 hover:bg-gray-50 transition-colors">
            <h3 className="font-medium text-gray-800">Phoenix</h3>
            <p className="text-sm text-gray-600 mt-1">
              Non-custodial Lightning wallet with automatic channel management
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletConnect;