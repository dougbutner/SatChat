import TelegramBot from 'node-telegram-bot-api';
import firebase from 'firebase/app';
import 'firebase/firestore';
import { getBitcoinFact } from './utils/facts.js';

// Firebase initialization
const firebaseConfig = {
  // This would come from environment variables in a real setup
  apiKey: "FIREBASE_API_KEY",
  authDomain: "satchat-app.firebaseapp.com",
  projectId: "satchat-app",
  storageBucket: "satchat-app.appspot.com",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Initialize the bot with your token
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
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
    // Archive previous day's stats to Firestore
    db.collection('dailyStats').add({
      date: dailyRewards.date,
      totalDistributed: dailyRewards.totalDistributed,
      messageCount: dailyRewards.messageCount,
      activeUsers: Array.from(dailyRewards.activeUsers),
    });
    
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
    const userRef = db.collection('users').doc(msg.from.id.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      await userRef.set({
        telegramId: msg.from.id,
        username: msg.from.username || '',
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        balance: 0,
        totalEarned: 0,
        messageCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    // Award Satoshis for the message
    await userRef.update({
      balance: firebase.firestore.FieldValue.increment(config.rewardPerMessage),
      totalEarned: firebase.firestore.FieldValue.increment(config.rewardPerMessage),
      messageCount: firebase.firestore.FieldValue.increment(1),
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
    });
    
    // Update daily stats
    dailyRewards.totalDistributed += config.rewardPerMessage;
    dailyRewards.messageCount += 1;
    dailyRewards.activeUsers.add(msg.from.id);
    
    // Log the reward in history
    await db.collection('rewardHistory').add({
      userId: msg.from.id,
      amount: config.rewardPerMessage,
      messageId: msg.message_id,
      chatId: msg.chat.id,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      messageText: msg.text || '[media]',
    });
    
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
    await db.collection('users').doc(msg.from.id.toString()).update({
      walletAddress: walletAddress,
      walletLinkedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    
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
    const userRef = db.collection('users').doc(msg.from.id.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to participate in the chat first to earn rewards.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    const userData = userDoc.data();
    
    if (!userData.walletAddress) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to link a Lightning wallet first using /linkwallet <address>.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    if (userData.balance <= 0) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You have no rewards to claim.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    // In a real implementation, this would call your Lightning Network API to send satoshis
    // For now, we'll just update the user's balance in Firestore
    const amountToClaim = userData.balance;
    
    // Record the claim in history
    await db.collection('claimHistory').add({
      userId: msg.from.id,
      amount: amountToClaim,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      walletAddress: userData.walletAddress,
      status: 'pending', // Would be updated by a webhook in a real implementation
    });
    
    // Reset user's balance
    await userRef.update({
      balance: 0,
      lastClaim: firebase.firestore.FieldValue.serverTimestamp(),
    });
    
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
bot.onText(/\/pin (.+)/, async (msg, match) => {
  try {
    if (!msg.reply_to_message) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to reply to a message you want to pin.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    const userRef = db.collection('users').doc(msg.from.id.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists || userDoc.data().balance < config.pinningCost) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ You need at least ${config.pinningCost} sats in your balance to pin a message.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    // Deduct the pinning cost from user's balance
    await userRef.update({
      balance: firebase.firestore.FieldValue.increment(-config.pinningCost),
    });
    
    // Pin the message
    await bot.pinChatMessage(msg.chat.id, msg.reply_to_message.message_id);
    
    // Record the pinning in history
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + config.pinningDuration);
    
    await db.collection('pinnedMessages').add({
      userId: msg.from.id,
      cost: config.pinningCost,
      messageId: msg.reply_to_message.message_id,
      chatId: msg.chat.id,
      pinnedAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiryTime,
      messageText: msg.reply_to_message.text || '[media]',
    });
    
    await bot.sendMessage(
      msg.chat.id,
      `📌 Message pinned for ${config.pinningDuration} hours at a cost of ${config.pinningCost} sats.`,
      { reply_to_message_id: msg.message_id }
    );
    
    // Add the pinning cost to the daily reward pool
    // This would distribute the pinning cost among active users in a real implementation
  } catch (error) {
    console.error('Error pinning message:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while pinning the message. Please try again.',
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
    
    // Update config in Firestore for persistence
    await db.collection('config').doc('rewardSettings').set(config, { merge: true });
    
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
    
    // Update config in Firestore for persistence
    await db.collection('config').doc('rewardSettings').set(config, { merge: true });
    
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
    
    // Update config in Firestore for persistence
    await db.collection('config').doc('rewardSettings').set(config, { merge: true });
    
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
    const expiredPinsSnapshot = await db.collection('pinnedMessages')
      .where('expiresAt', '<=', now)
      .where('unpinned', '==', false)
      .get();
    
    for (const doc of expiredPinsSnapshot.docs) {
      const pinnedMsg = doc.data();
      try {
        await bot.unpinChatMessage(pinnedMsg.chatId, pinnedMsg.messageId);
        await doc.ref.update({ unpinned: true, unpinnedAt: firebase.firestore.FieldValue.serverTimestamp() });
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

// Start message
console.log('SatChat Bot is running...');