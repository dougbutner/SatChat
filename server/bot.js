import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { getBitcoinFact } from './utils/facts.js';
import {
  initializeDatabase,
  getUser,
  createUser,
  updateUserBalance,
  updateUserWallet,
  resetUserBalance,
  logReward,
  saveDailyStats,
  addPinnedMessage,
  getExpiredPins,
  removePin,
  logDonation,
  updateDonationStatus,
  updatePinPaymentStatus,
  getRewardKeywords,
  addRewardKeyword
} from './database.js';
import opennode from 'opennode';
import express from 'express';

// Load environment variables
dotenv.config();

// Initialize database
initializeDatabase();

// Initialize the bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

// Configure OpenNode with API key from environment variables
opennode.setCredentials(process.env.OPENNODE_API_KEY || 'YOUR_OPENNODE_API_KEY');

// Default configuration values
let config = {
  rewardPerMessage: 1,            // Satoshis per message
  dailyRewardCap: 10000,          // Maximum rewards per day
  pinningCost: 1000,              // Cost to pin a message
  pinningDuration: 24,            // Hours a message stays pinned
};

// Track daily reward distribution
let dailyRewards = {
  date: new Date().toISOString().split('T')[0],
  totalDistributed: 0,
  messageCount: 0,
  activeUsers: new Set(),
};

// Reward keywords with multipliers
let rewardKeywords = [];

// Load reward keywords from database on startup
async function loadRewardKeywords() {
  try {
    rewardKeywords = await getRewardKeywords();
    console.log('Reward keywords loaded:', rewardKeywords);
  } catch (error) {
    console.error('Error loading reward keywords:', error);
  }
}
loadRewardKeywords();

// Helper function to reset daily stats at midnight
function resetDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  if (dailyRewards.date !== today) {
    // Archive previous day's stats to database
    saveDailyStats(dailyRewards);
    
    // Reset for new day
    dailyRewards = {
      date: today,
      totalDistributed: 0,
      messageCount: 0,
      activeUsers: new Set(),
    };
  }
}

// Set up a daily reset check
setInterval(resetDailyStats, 60 * 60 * 1000); // Check every hour

// Handle new messages
bot.on('message', async (msg) => {
  try {
    // Reset daily stats if needed
    resetDailyStats();
    
    // Skip commands
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }
    
    // Check if daily cap is reached
    if (dailyRewards.totalDistributed >= config.dailyRewardCap) {
      // Notify the group that daily limit is reached
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ Daily reward cap of ' + config.dailyRewardCap + ' sats has been reached. No more rewards will be distributed today.'
      );
      return;
    }
    
    // Check if user exists, create if not
    let user = await getUser(msg.from.id);
    if (!user) {
      await createUser({
        telegramId: msg.from.id,
        username: msg.from.username || '',
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || ''
      });
    }
    
    // Calculate reward with multiplier based on message content
    let reward = config.rewardPerMessage;
    let highestMultiplier = 1.0;
    if (msg.text) {
      const messageTextLower = msg.text.toLowerCase();
      for (const { keyword, multiplier } of rewardKeywords) {
        if (messageTextLower.includes(keyword.toLowerCase()) && multiplier > highestMultiplier) {
          highestMultiplier = multiplier;
        }
      }
      reward = Math.floor(config.rewardPerMessage * highestMultiplier);
    }
    
    // Award Satoshis for the message
    await updateUserBalance(msg.from.id, reward);
    
    // Update daily stats
    dailyRewards.totalDistributed += reward;
    dailyRewards.messageCount += 1;
    dailyRewards.activeUsers.add(msg.from.id);
    
    // Log the reward in history
    await logReward(msg.from.id, reward, msg.message_id, msg.chat.id, msg.text || '[media]');
    
    // Get Bitcoin fact
    const fact = getBitcoinFact();
    
    // Occasionally share a Bitcoin fact (1 in 10 messages)
    if (Math.random() < 0.1) {
      await bot.sendMessage(
        msg.chat.id,
        `<b>🔶 Bitcoin Fact:</b> ${fact}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Handle /linkwallet command
bot.onText(/\/linkwallet (.+)/, async (msg, match) => {
  try {
    const walletAddress = match[1].trim();
    
    // Simple validation - in a real app, you'd want more robust validation
    if (!walletAddress.startsWith('ln')) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Invalid Lightning wallet address. Please provide an address starting with "ln".', 
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    // Update user's wallet address
    await updateUserWallet(msg.from.id, walletAddress);
    
    await bot.sendMessage(
      msg.chat.id,
      '✅ Your Lightning wallet has been successfully linked! You can now claim your rewards using /claim.',
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error linking wallet:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while linking your wallet. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Handle /claim command
bot.onText(/\/claim/, async (msg) => {
  try {
    const user = await getUser(msg.from.id);
    
    if (!user) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to participate in the chat first to earn rewards.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    if (!user.walletAddress) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to link a Lightning wallet first using /linkwallet <address>.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    const amountToClaim = user.balance;
    if (amountToClaim <= 0) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You have no balance to claim.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    // Create a charge using OpenNode
    try {
      const charge = await opennode.createCharge({
        amount: amountToClaim,
        currency: 'BTC', // Use BTC for satoshis
        description: `SatChat Reward Claim for user ${msg.from.id}`,
        customer_email: '', // Optional, can be added if needed
        callback_url: process.env.WEBHOOK_URL || 'YOUR_WEBHOOK_URL_FOR_PAYMENT_CONFIRMATION',
        success_url: '', // Optional
        auto_settle: true // Automatically settle to user's wallet if possible
      });
      
      if (charge && charge.id) {
        // Log the charge attempt
        await logDonation(msg.from.id, amountToClaim, charge.id, 'Reward Claim');
        // Temporarily reset balance (will be finalized on webhook confirmation)
        await resetUserBalance(msg.from.id);
        await bot.sendMessage(
          msg.chat.id,
          `✅ Claim request for ${amountToClaim} sats has been submitted! Funds will be sent to your Lightning wallet shortly. Invoice ID: ${charge.id}`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        throw new Error('Failed to create charge');
      }
    } catch (paymentError) {
      console.error('Error creating OpenNode charge:', paymentError);
      await bot.sendMessage(
        msg.chat.id,
        '❌ An error occurred while processing your claim. Please try again later.',
        { reply_to_message_id: msg.message_id }
      );
    }
  } catch (error) {
    console.error('Error claiming rewards:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while processing your claim. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Handle pin message
bot.onText(/\/pin/, async (msg) => {
  try {
    if (!msg.reply_to_message) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to reply to a message you want to pin.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    const user = await getUser(msg.from.id);
    
    if (!user) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to participate in the chat first before you can pin messages.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    // Generate a unique invoice ID
    const invoiceId = `INV-${Date.now()}-${msg.from.id}`;
    const cost = config.pinningCost;
    
    // Log the donation for pinning
    await logDonation(msg.from.id, cost, invoiceId, 'Message Pinning', msg.reply_to_message.message_id, msg.chat.id);
    
    // Record the pinning request with pending status
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + config.pinningDuration);
    await addPinnedMessage(msg.reply_to_message.message_id, msg.chat.id, msg.from.id, cost, expiryTime, invoiceId);
    
    // Create a charge using OpenNode for pinning cost
    try {
      const charge = await opennode.createCharge({
        amount: cost,
        currency: 'BTC', // Use BTC for satoshis
        description: `SatChat Message Pinning for message ${msg.reply_to_message.message_id}`,
        customer_email: '', // Optional
        callback_url: process.env.WEBHOOK_URL || 'YOUR_WEBHOOK_URL_FOR_PAYMENT_CONFIRMATION',
        success_url: '', // Optional
        auto_settle: false // Manual settlement for pinning
      });
      
      if (charge && charge.id) {
        // Update invoiceId with OpenNode charge ID
        await pool.query('UPDATE pinnedMessages SET invoiceId = ? WHERE invoiceId = ?', [charge.id, invoiceId]);
        await pool.query('UPDATE donations SET invoiceId = ? WHERE invoiceId = ?', [charge.id, invoiceId]);
        await bot.sendMessage(
          msg.chat.id,
          `📌 To pin this message for ${config.pinningDuration} hours, you need to pay ${cost} sats.

Invoice ID: ${charge.id}

Please send ${cost} sats using the following Lightning invoice: ${charge.lightning_invoice.payreq}

Once payment is confirmed, the message will be pinned.`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        throw new Error('Failed to create charge for pinning');
      }
    } catch (paymentError) {
      console.error('Error creating OpenNode charge for pinning:', paymentError);
      await bot.sendMessage(
        msg.chat.id,
        '❌ An error occurred while generating the payment request for pinning. Please try again.',
        { reply_to_message_id: msg.message_id }
      );
    }
  } catch (error) {
    console.error('Error handling pin request:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while processing your pin request. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Handle /balance command
bot.onText(/\/balance/, async (msg) => {
  try {
    const user = await getUser(msg.from.id);
    
    if (!user) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to participate in the chat first to earn rewards.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    await bot.sendMessage(
      msg.chat.id,
      `💰 Your current balance is ${user.balance} sats. Use /claim to transfer to your Lightning wallet.`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error checking balance:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while checking your balance. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Admin commands - only allow from group admins
bot.onText(/\/setreward (\d+)/, async (msg, match) => {
  try {
    // Check if user is admin
    const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
    if (!['creator', 'administrator'].includes(chatMember.status)) {
      return; // Silently ignore if not admin
    }
    
    const newReward = parseInt(match[1]);
    if (isNaN(newReward) || newReward <= 0 || newReward > 100) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Reward amount must be between 1 and 100 sats.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    config.rewardPerMessage = newReward;
    await saveConfig();
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Reward per message has been updated to ${newReward} sats.`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error setting reward:', error);
  }
});

bot.onText(/\/setcap (\d+)/, async (msg, match) => {
  try {
    // Check if user is admin
    const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
    if (!['creator', 'administrator'].includes(chatMember.status)) {
      return; // Silently ignore if not admin
    }
    
    const newCap = parseInt(match[1]);
    if (isNaN(newCap) || newCap < 1000) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Daily reward cap must be at least 1000 sats.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    config.dailyRewardCap = newCap;
    await saveConfig();
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Daily reward cap has been updated to ${newCap} sats.`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error setting cap:', error);
  }
});

bot.onText(/\/setpin (\d+) (\d+)/, async (msg, match) => {
  try {
    // Check if user is admin
    const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
    if (!['creator', 'administrator'].includes(chatMember.status)) {
      return; // Silently ignore if not admin
    }
    
    const newCost = parseInt(match[1]);
    const newDuration = parseInt(match[2]);
    
    if (isNaN(newCost) || newCost < 100) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Pinning cost must be at least 100 sats.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    if (isNaN(newDuration) || newDuration < 1 || newDuration > 168) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Pinning duration must be between 1 and 168 hours.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    config.pinningCost = newCost;
    config.pinningDuration = newDuration;
    await saveConfig();
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Pinning settings updated: ${newCost} sats for ${newDuration} hours.`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error setting pinning options:', error);
  }
});

// New admin command to add or update reward-boosting keywords with multipliers
bot.onText(/\/addkeyword (\w+) (\d+\.?\d*)/, async (msg, match) => {
  try {
    // Check if user is admin
    const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
    if (!['creator', 'administrator'].includes(chatMember.status)) {
      return; // Silently ignore if not admin
    }
    
    const keyword = match[1];
    const multiplier = parseFloat(match[2]);
    
    if (isNaN(multiplier) || multiplier < 1.0 || multiplier > 10.0) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Multiplier must be between 1.0 and 10.0.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    await addRewardKeyword(keyword, multiplier);
    // Reload keywords to update in-memory list
    await loadRewardKeywords();
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Keyword "${keyword}" added with a reward multiplier of ${multiplier}x.`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error adding reward keyword:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while adding the keyword. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Help command
bot.onText(/\/help/, async (msg) => {
  try {
    const helpText = `
<b>📚 SatChat Bot Help</b>

<b>User Commands:</b>
/linkwallet <address> - Link your Lightning wallet
/claim - Claim your earned satoshis to your wallet
/pin - Reply to a message with this command to pin it (costs ${config.pinningCost} sats)
/balance - Check your current balance

<b>Admin Commands:</b>
/setreward <amount> - Set reward per message
/setcap <amount> - Set daily reward cap
/setpin <cost> <hours> - Set pinning cost and duration
/addkeyword <word> <multiplier> - Add or update a keyword that boosts rewards (multiplier between 1.0-10.0)

<b>Current Settings:</b>
• Reward per message: ${config.rewardPerMessage} sats
• Daily reward cap: ${config.dailyRewardCap} sats
• Pinning cost: ${config.pinningCost} sats
• Pinning duration: ${config.pinningDuration} hours

Made with ❤️ for the Bitcoin 2025 Hackathon
`;
    
    await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error sending help message:', error);
  }
});

// Check unpinning scheduled messages
async function checkExpiredPins() {
  try {
    const now = new Date();
    const expiredPins = await getExpiredPins(now);
    
    for (const pinnedMsg of expiredPins) {
      try {
        await bot.unpinChatMessage(pinnedMsg.chatId, pinnedMsg.messageId);
        await removePin(pinnedMsg.messageId, pinnedMsg.chatId);
      } catch (error) {
        console.error(`Error unpinning message ${pinnedMsg.messageId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error checking expired pins:', error);
  }
}

// Check for expired pins every hour
setInterval(checkExpiredPins, 60 * 60 * 1000);

// Webhook endpoint for OpenNode payment confirmation (requires express or similar setup)
// Note: This is a placeholder; actual implementation requires a server setup
const app = express();
app.use(express.json());

app.post('/webhook/payment', async (req, res) => {
  try {
    const { id, status, type } = req.body;
    if (type === 'charge') {
      console.log(`Received payment update for charge ${id}: ${status}`);
      if (status === 'paid') {
        // Update donation status
        await updateDonationStatus(id, 'completed');
        // Check if it's for pinning
        const [pinRows] = await pool.query('SELECT * FROM pinnedMessages WHERE invoiceId = ?', [id]);
        if (pinRows.length > 0) {
          const pin = pinRows[0];
          await updatePinPaymentStatus(id, 'completed');
          await bot.pinChatMessage(pin.chatId, pin.messageId);
          console.log(`Message ${pin.messageId} pinned after payment confirmation for invoice ${id}`);
          await bot.sendMessage(pin.chatId, `📌 Message has been pinned successfully for ${config.pinningDuration} hours!`);
        } else {
          // Assume it's a claim if not a pin
          console.log(`Claim payment confirmed for invoice ${id}`);
        }
      } else if (status === 'failed' || status === 'expired') {
        await updateDonationStatus(id, 'failed');
        await updatePinPaymentStatus(id, 'failed');
        console.log(`Payment failed or expired for invoice ${id}`);
      }
    }
    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Start the webhook server (adjust port as needed)
const webhookPort = process.env.WEBHOOK_PORT || 3000;
app.listen(webhookPort, () => {
  console.log(`Webhook server running on port ${webhookPort}`);
});

// Function to load configuration from database
async function loadConfig() {
  try {
    const [rows] = await pool.query('SELECT * FROM config WHERE id = 1');
    if (rows.length > 0) {
      config = {
        rewardPerMessage: rows[0].rewardPerMessage,
        dailyRewardCap: rows[0].dailyRewardCap,
        pinningCost: rows[0].pinningCost,
        pinningDuration: rows[0].pinningDuration,
      };
      console.log('Configuration loaded from database:', config);
    } else {
      // Default values if no config in database
      await pool.query(
        'INSERT INTO config (id, rewardPerMessage, dailyRewardCap, pinningCost, pinningDuration) VALUES (1, ?, ?, ?, ?)',
        [config.rewardPerMessage, config.dailyRewardCap, config.pinningCost, config.pinningDuration]
      );
      console.log('Default configuration saved to database:', config);
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Function to save configuration to database
async function saveConfig() {
  try {
    await pool.query(
      'UPDATE config SET rewardPerMessage = ?, dailyRewardCap = ?, pinningCost = ?, pinningDuration = ? WHERE id = 1',
      [config.rewardPerMessage, config.dailyRewardCap, config.pinningCost, config.pinningDuration]
    );
    console.log('Configuration saved to database:', config);
  } catch (error) {
    console.error('Error saving configuration:', error);
  }
}

// Load config on startup
loadConfig();

// Start message
console.log('SatChat Bot is running...');