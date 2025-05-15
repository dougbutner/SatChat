// Bitcoin facts to share with users after rewards
const bitcoinFacts = [
  "Bitcoin's smallest unit is called a 'satoshi'. One bitcoin equals 100,000,000 satoshis.",
  "The Lightning Network is a 'layer 2' solution built on top of Bitcoin, enabling faster transactions with lower fees.",
  "Bitcoin's creator, Satoshi Nakamoto, released the Bitcoin whitepaper on October 31, 2008.",
  "The first Bitcoin transaction was a pizza purchase worth 10,000 BTC in 2010 - worth millions today!",
  "Bitcoin has a fixed supply cap of 21 million coins, making it a deflationary asset.",
  "Bitcoin's mining reward gets cut in half approximately every four years, in an event called 'the halving'.",
  "Bitcoin's blockchain has never been hacked. Its security comes from thousands of computers running the software worldwide.",
  "The last Bitcoin is projected to be mined around the year 2140.",
  "The Lightning Network can process millions of Bitcoin transactions per second, compared to only 7 transactions per second on the base layer.",
  "As of 2025, more than 90% of all Bitcoin that will ever exist has already been mined.",
  "Bitcoin mining now uses more than 50% renewable energy, making it one of the greenest industries globally.",
  "El Salvador became the first country to adopt Bitcoin as legal tender in 2021.",
  "The Bitcoin network processed over $100 trillion in transactions in its first 15 years of existence.",
  "There are over 100,000 Bitcoin nodes running worldwide, ensuring decentralization and security.",
  "Bitcoin's code is open source, meaning anyone can view, use, or contribute to its development.",
  "The highest fee ever paid for a Bitcoin transaction was 500 BTC in 2016, worth millions today.",
  "Bitcoin has spawned an entire industry of cryptocurrencies and blockchain applications.",
  "One of Bitcoin's key innovations was solving the 'double-spend problem' in digital currencies.",
  "Bitcoin transactions are pseudonymous, not anonymous. All transactions are publicly visible on the blockchain.",
  "The Lightning Network allows Bitcoin payments as small as 1 satoshi (0.00000001 BTC)."
];

// Function to get a random Bitcoin fact
export function getBitcoinFact() {
  const randomIndex = Math.floor(Math.random() * bitcoinFacts.length);
  return bitcoinFacts[randomIndex];
}

// Function to get all Bitcoin facts
export function getAllBitcoinFacts() {
  return bitcoinFacts;
}

export default { getBitcoinFact, getAllBitcoinFacts };