import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'satchat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Function to initialize the database and tables
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS ??`, [process.env.DB_NAME || 'satchat']);
    await connection.query(`USE ??`, [process.env.DB_NAME || 'satchat']);
    
    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telegramId BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        firstName VARCHAR(255),
        lastName VARCHAR(255),
        balance INT DEFAULT 0,
        totalEarned INT DEFAULT 0,
        messageCount INT DEFAULT 0,
        lastActive TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create wallet_addresses table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wallet_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        network VARCHAR(50) NOT NULL,
        address VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        isDefault BOOLEAN DEFAULT false,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id),
        UNIQUE KEY unique_wallet (userId, network, type)
      )
    `);
    
    // Create rewardHistory table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rewardHistory (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        amount BIGINT,
        messageId BIGINT,
        chatId BIGINT,
        messageText TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create dailyStats table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS dailyStats (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        date DATE,
        totalDistributed BIGINT,
        messageCount BIGINT,
        activeUsers TEXT
      )
    `);
    
    // Create pinnedMessages table with invoice and payment status
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pinnedMessages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        messageId BIGINT,
        chatId BIGINT,
        userId BIGINT,
        cost BIGINT,
        invoiceId VARCHAR(255),
        paymentNetwork ENUM('lightning', 'exsat', 'btc') DEFAULT 'lightning',
        paymentStatus ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        pinnedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP
      )
    `);
    
    // Create donations table to track total donations and donor information
    await connection.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        amount BIGINT,
        invoiceId VARCHAR(255) UNIQUE,
        paymentNetwork ENUM('lightning', 'exsat', 'btc') DEFAULT 'lightning',
        paymentStatus ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        purpose VARCHAR(255),
        messageId BIGINT NULL,
        chatId BIGINT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completedAt TIMESTAMP NULL
      )
    `);
    
    // Create rewardkeywords table to store keywords that boost message rewards with multipliers
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rewardkeywords (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        keyword VARCHAR(255) UNIQUE,
        multiplier DECIMAL(5,2) DEFAULT 1.0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create config table to store bot configuration settings
    await connection.query(`
      CREATE TABLE IF NOT EXISTS config (
        id BIGINT PRIMARY KEY,
        rewardPerMessage BIGINT DEFAULT 1,
        dailyRewardCap BIGINT DEFAULT 10000,
        pinningCost BIGINT DEFAULT 1000,
        pinningDuration BIGINT DEFAULT 24
      )
    `);
    
    // Create bot_balances table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bot_balances (
        id INT PRIMARY KEY AUTO_INCREMENT,
        network VARCHAR(50) NOT NULL,
        address VARCHAR(255) NOT NULL,
        balance BIGINT NOT NULL DEFAULT 0,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_network (network)
      )
    `);
    
    console.log('Database and tables initialized successfully');
    connection.release();
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// User functions
async function getUser(telegramId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE telegramId = ?', [telegramId]);
  return rows.length > 0 ? rows[0] : null;
}

async function createUser(userData) {
  await pool.query(
    'INSERT INTO users (telegramId, username, firstName, lastName, balance, totalEarned, messageCount, createdAt) VALUES (?, ?, ?, ?, 0, 0, 0, NOW())',
    [userData.telegramId, userData.username, userData.firstName, userData.lastName]
  );
}

async function updateUserBalance(telegramId, rewardAmount) {
  await pool.query(
    'UPDATE users SET balance = balance + ?, totalEarned = totalEarned + ?, messageCount = messageCount + 1, lastActive = NOW() WHERE telegramId = ?',
    [rewardAmount, rewardAmount, telegramId]
  );
}

async function updateUserWallet(telegramId, walletAddress) {
  await pool.query(
    'UPDATE users SET walletAddress = ?, walletLinkedAt = NOW() WHERE telegramId = ?',
    [walletAddress, telegramId]
  );
}

async function resetUserBalance(telegramId) {
  await pool.query('UPDATE users SET balance = 0 WHERE telegramId = ?', [telegramId]);
}

// Reward history functions
async function logReward(userId, amount, messageId, chatId, messageText) {
  await pool.query(
    'INSERT INTO rewardHistory (userId, amount, messageId, chatId, messageText, timestamp) VALUES (?, ?, ?, ?, ?, NOW())',
    [userId, amount, messageId, chatId, messageText]
  );
}

// Daily stats functions
async function saveDailyStats(stats) {
  await pool.query(
    'INSERT INTO dailyStats (date, totalDistributed, messageCount, activeUsers) VALUES (?, ?, ?, ?)',
    [stats.date, stats.totalDistributed, stats.messageCount, JSON.stringify(Array.from(stats.activeUsers))]
  );
}

// Pinned messages functions
async function addPinnedMessage(messageId, chatId, userId, cost, expiresAt, invoiceId, paymentNetwork = 'lightning') {
  await pool.query(
    'INSERT INTO pinnedMessages (messageId, chatId, userId, cost, expiresAt, invoiceId, paymentNetwork, paymentStatus) VALUES (?, ?, ?, ?, ?, ?, ?, "pending")',
    [messageId, chatId, userId, cost, expiresAt, invoiceId, paymentNetwork]
  );
}

async function getPinnedMessage(invoiceId) {
  const [rows] = await pool.query('SELECT * FROM pinnedMessages WHERE invoiceId = ?', [invoiceId]);
  return rows.length > 0 ? rows[0] : null;
}

async function updatePinPaymentStatus(invoiceId, status) {
  await pool.query(
    'UPDATE pinnedMessages SET paymentStatus = ? WHERE invoiceId = ?',
    [status, invoiceId]
  );
}

async function getExpiredPins(currentTime) {
  const [rows] = await pool.query('SELECT * FROM pinnedMessages WHERE expiresAt <= ?', [currentTime]);
  return rows;
}

async function removePin(messageId, chatId) {
  await pool.query('DELETE FROM pinnedMessages WHERE messageId = ? AND chatId = ?', [messageId, chatId]);
}

// Donation functions
async function logDonation(userId, amount, invoiceId, purpose, messageId = null, chatId = null, paymentNetwork = 'lightning') {
  await pool.query(
    'INSERT INTO donations (userId, amount, invoiceId, paymentNetwork, purpose, messageId, chatId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, amount, invoiceId, paymentNetwork, purpose, messageId, chatId]
  );
}

async function updateDonationStatus(invoiceId, status) {
  const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
  await pool.query(
    `UPDATE donations SET paymentStatus = ?, completedAt = ${completedAt} WHERE invoiceId = ?`,
    [status, invoiceId]
  );
}

async function getDonationStats() {
  const [totalRows] = await pool.query(
    'SELECT SUM(amount) as totalDonated, COUNT(DISTINCT userId) as uniqueDonors FROM donations WHERE paymentStatus = "completed"'
  );
  return totalRows[0];
}

// Reward keywords functions
async function addRewardKeyword(keyword, multiplier) {
  await pool.query(
    'INSERT INTO rewardkeywords (keyword, multiplier) VALUES (?, ?) ON DUPLICATE KEY UPDATE multiplier = ?, updatedAt = NOW()',
    [keyword, multiplier, multiplier]
  );
}

async function getRewardKeywords() {
  const [rows] = await pool.query('SELECT * FROM rewardkeywords');
  return rows;
}

// Update wallet functions
async function addWalletAddress(telegramId, network, address, type, isDefault = false) {
  try {
    const [userRows] = await pool.query('SELECT id FROM users WHERE telegramId = ?', [telegramId]);
    if (userRows.length === 0) {
      throw new Error('User not found');
    }
    const userId = userRows[0].id;

    // If this is set as default, unset any existing default for this network
    if (isDefault) {
      await pool.query(
        'UPDATE wallet_addresses SET isDefault = false WHERE userId = ? AND network = ?',
        [userId, network]
      );
    }

    // Insert or update the wallet address
    await pool.query(`
      INSERT INTO wallet_addresses (userId, network, address, type, isDefault)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      address = VALUES(address),
      isDefault = VALUES(isDefault),
      updatedAt = CURRENT_TIMESTAMP
    `, [userId, network, address, type, isDefault]);

    return true;
  } catch (error) {
    console.error('Error adding wallet address:', error);
    throw error;
  }
}

async function getWalletAddresses(telegramId) {
  try {
    const [rows] = await pool.query(`
      SELECT wa.* 
      FROM wallet_addresses wa
      JOIN users u ON wa.userId = u.id
      WHERE u.telegramId = ?
      ORDER BY wa.isDefault DESC, wa.network, wa.type
    `, [telegramId]);
    return rows;
  } catch (error) {
    console.error('Error getting wallet addresses:', error);
    throw error;
  }
}

async function getDefaultWalletAddress(telegramId, network) {
  try {
    const [rows] = await pool.query(`
      SELECT wa.* 
      FROM wallet_addresses wa
      JOIN users u ON wa.userId = u.id
      WHERE u.telegramId = ? AND wa.network = ? AND wa.isDefault = true
      LIMIT 1
    `, [telegramId, network]);
    return rows[0] || null;
  } catch (error) {
    console.error('Error getting default wallet address:', error);
    throw error;
  }
}

// Function to get bot balance for a network
export async function getBotBalance(network) {
  try {
    const [rows] = await pool.query(
      'SELECT balance FROM bot_balances WHERE network = ?',
      [network]
    );
    return rows.length > 0 ? rows[0].balance : 0;
  } catch (error) {
    console.error('Error getting bot balance:', error);
    return 0;
  }
}

// Function to update bot balance
export async function updateBotBalance(network, balance) {
  try {
    await pool.query(
      'INSERT INTO bot_balances (network, balance) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE balance = ?, last_sync = CURRENT_TIMESTAMP',
      [network, balance, balance]
    );
  } catch (error) {
    console.error('Error updating bot balance:', error);
  }
}

// Function to sync all bot balances
export async function syncBotBalances() {
  try {
    // Get all bot wallet addresses
    const [wallets] = await pool.query('SELECT network, address FROM bot_balances');
    
    for (const wallet of wallets) {
      let balance = 0;
      
      // Fetch balance from appropriate blockchain API
      switch (wallet.network) {
        case 'btc':
          // Use Bitcoin blockchain API
          balance = await fetchBitcoinBalance(wallet.address);
          break;
        case 'lightning':
          // Use Lightning Network API
          balance = await fetchLightningBalance(wallet.address);
          break;
        case 'exsat':
          // Use exSat API
          balance = await fetchExSatBalance(wallet.address);
          break;
        case 'exsat-evm':
          // Use exSat EVM API
          balance = await fetchExSatEVMBalance(wallet.address);
          break;
      }
      
      // Update balance in database
      await updateBotBalance(wallet.network, balance);
    }
  } catch (error) {
    console.error('Error syncing bot balances:', error);
  }
}

// Helper functions to fetch balances from different networks
async function fetchBitcoinBalance(address) {
  // Implement Bitcoin balance check using a public API
  // Example: blockchain.info or blockchair.com
  return 0; // Placeholder
}

async function fetchLightningBalance(address) {
  // Implement Lightning balance check
  return 0; // Placeholder
}

async function fetchExSatBalance(address) {
  // Implement exSat balance check
  return 0; // Placeholder
}

async function fetchExSatEVMBalance(address) {
  // Implement exSat EVM balance check
  return 0; // Placeholder
}

export {
  initializeDatabase,
  getUser,
  createUser,
  updateUserBalance,
  updateUserWallet,
  resetUserBalance,
  logReward,
  saveDailyStats,
  addPinnedMessage,
  getPinnedMessage,
  updatePinPaymentStatus,
  getExpiredPins,
  removePin,
  logDonation,
  updateDonationStatus,
  getDonationStats,
  addRewardKeyword, 
  getRewardKeywords,
  addWalletAddress,
  getWalletAddresses,
  getDefaultWalletAddress,
  pool
};
