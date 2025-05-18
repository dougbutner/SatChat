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
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        telegramId BIGINT UNIQUE,
        username VARCHAR(255),
        firstName VARCHAR(255),
        lastName VARCHAR(255),
        balance BIGINT DEFAULT 0,
        totalEarned BIGINT DEFAULT 0,
        messageCount BIGINT DEFAULT 0,
        walletAddress TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lastActive TIMESTAMP,
        walletLinkedAt TIMESTAMP
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
        paymentStatus ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        purpose VARCHAR(255),
        messageId BIGINT NULL,
        chatId BIGINT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completedAt TIMESTAMP NULL
      )
    `);
    
    // Create rewardKeywords table to store keywords that boost message rewards with multipliers
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rewardKeywords (
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
    
    console.log('Database and tables initialized successfully');
    connection.release();
  } catch (error) {
    console.error('Error initializing database:', error);
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
async function addPinnedMessage(messageId, chatId, userId, cost, expiresAt, invoiceId) {
  await pool.query(
    'INSERT INTO pinnedMessages (messageId, chatId, userId, cost, expiresAt, invoiceId, paymentStatus) VALUES (?, ?, ?, ?, ?, ?, "pending")',
    [messageId, chatId, userId, cost, expiresAt, invoiceId]
  );
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
async function logDonation(userId, amount, invoiceId, purpose, messageId = null, chatId = null) {
  await pool.query(
    'INSERT INTO donations (userId, amount, invoiceId, paymentStatus, purpose, messageId, chatId, createdAt) VALUES (?, ?, ?, "pending", ?, ?, ?, NOW())',
    [userId, amount, invoiceId, purpose, messageId, chatId]
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
    'INSERT INTO rewardKeywords (keyword, multiplier) VALUES (?, ?) ON DUPLICATE KEY UPDATE multiplier = ?, updatedAt = NOW()',
    [keyword, multiplier, multiplier]
  );
}

async function getRewardKeywords() {
  const [rows] = await pool.query('SELECT * FROM rewardKeywords');
  return rows;
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
  updatePinPaymentStatus,
  getExpiredPins,
  removePin,
  logDonation,
  updateDonationStatus,
  getDonationStats,
  addRewardKeyword,
  getRewardKeywords
};
