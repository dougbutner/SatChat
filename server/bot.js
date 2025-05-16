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
  updatePinPaymentStatus
} from './database.js';

// Load environment variables
dotenv.config();

// Initialize database
initializeDatabase();

// Initialize the bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

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
      // Optional: notify the group that daily limit is reached
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
    
    // Award Satoshis for the message
    await updateUserBalance(msg.from.id, config.rewardPerMessage);
    
    // Update daily stats
    dailyRewards.totalDistributed += config.rewardPerMessage;
    dailyRewards.messageCount += 1;
    dailyRewards.activeUsers.add(msg.from.id);
    
    // Log the reward in history
    await logReward(msg.from.id, config.rewardPerMessage, msg.message_id, msg.chat.id, msg.text || '[media]');
    
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
    
    // In a real implementation, this would trigger a Lightning payment
    // For now, we'll just reset the balance
    await resetUserBalance(msg.from.id);
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Claim request for ${amountToClaim} sats has been submitted! Funds will be sent to your Lightning wallet shortly.`,
      { reply_to_message_id: msg.message_id }
    );
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
    
    // Generate a unique invoice ID (in a real implementation, this would be from a Lightning Network API)
    const invoiceId = `INV-${Date.now()}-${msg.from.id}`;
    const cost = config.pinningCost;
    
    // Log the donation for pinning
    await logDonation(msg.from.id, cost, invoiceId, 'Message Pinning', msg.reply_to_message.message_id, msg.chat.id);
    
    // Record the pinning request with pending status
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + config.pinningDuration);
    await addPinnedMessage(msg.reply_to_message.message_id, msg.chat.id, msg.from.id, cost, expiryTime, invoiceId);
    
    // In a real implementation, generate a Lightning invoice for the user to pay
    // For now, we'll simulate with a placeholder message
    await bot.sendMessage(
      msg.chat.id,
      `📌 To pin this message for ${config.pinningDuration} hours, you need to pay ${cost} sats.\n\nInvoice ID: ${invoiceId}\n\nPlease send ${cost} sats to [Lightning Address Placeholder]. Once payment is confirmed, the message will be pinned.`,
      { reply_to_message_id: msg.message_id }
    );
    
    // Note: Actual pinning happens only after payment confirmation, which would be handled by a separate process or webhook
  } catch (error) {
    console.error('Error handling pin request:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while processing your pin request. Please try again.',
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
    
    // For now, config is stored in memory. In a real app, you'd persist this to the database
    
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
    
    // For now, config is stored in memory. In a real app, you'd persist this to the database
    
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
    
    // For now, config is stored in memory. In a real app, you'd persist this to the database
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Pinning settings updated: ${newCost} sats for ${newDuration} hours.`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error setting pinning options:', error);
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

// Placeholder for payment confirmation (would be triggered by a webhook or external API in a real implementation)
async function handlePaymentConfirmation(invoiceId, status) {
  try {
    // Update donation status
    await updateDonationStatus(invoiceId, status);
    
    // Update pin payment status
    await updatePinPaymentStatus(invoiceId, status);
    
    if (status === 'completed') {
      // Retrieve the pin record
      const [pinRows] = await pool.query('SELECT * FROM pinnedMessages WHERE invoiceId = ?', [invoiceId]);
      if (pinRows.length > 0) {
        const pin = pinRows[0];
        // Pin the message
        await bot.pinChatMessage(pin.chatId, pin.messageId);
        console.log(`Message ${pin.messageId} pinned after payment confirmation for invoice ${invoiceId}`);
      }
    }
  } catch (error) {
    console.error('Error handling payment confirmation:', error);
  }
}

// Start message
console.log('SatChat Bot is running...');