import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { getBitcoinFact } from './utils/facts.js';
import paymentService from './payment.js';
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
  addRewardKeyword,
  pool,
  getWalletAddresses,
  addWalletAddress,
  getDefaultWalletAddress
} from './database.js';
import express from 'express';

// Load environment variables
dotenv.config();

// Initialize database
initializeDatabase();

// Initialize the bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN || '7453633569:AAHr4UsNmucKwTUg9qaRU5dfZynQbkx-QGg';
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
    const args = match[1].trim().split(' ');
    if (args.length < 2) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ Invalid command format. Please use:\n' +
        '/linkwallet <network> <address>\n\n' +
        'Supported networks:\n' +
        '• lightning - Lightning Network address (starts with ln)\n' +
        '• btc - Bitcoin address\n' +
        '• exsat - exSat native address\n' +
        '• exsat-evm - exSat EVM address\n\n' +
        'Example: /linkwallet lightning lnurl1...',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const [network, address] = args;
    let type = 'default';
    let isValid = false;

    // Validate address format based on network
    switch (network.toLowerCase()) {
      case 'lightning':
        isValid = address.startsWith('ln');
        type = 'lightning';
        break;
      case 'btc':
        isValid = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
        type = 'bitcoin';
        break;
      case 'exsat':
        isValid = /^[a-zA-Z0-9]{42}$/.test(address);
        type = 'native';
        break;
      case 'exsat-evm':
        isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
        type = 'evm';
        break;
      default:
        await bot.sendMessage(
          msg.chat.id,
          '❌ Unsupported network. Please use: lightning, btc, exsat, or exsat-evm',
          { reply_to_message_id: msg.message_id }
        );
        return;
    }

    if (!isValid) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Invalid ${network} address format. Please check and try again.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Add the wallet address
    await addWalletAddress(msg.from.id, network.toLowerCase(), address, type, true);
    
    await bot.sendMessage(
      msg.chat.id,
      `✅ Your ${network} wallet has been successfully linked!\n\n` +
      `Network: ${network}\n` +
      `Type: ${type}\n` +
      `Address: ${address}\n\n` +
      'You can now claim your rewards using /claim.',
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

// Handle /wallets command
bot.onText(/\/wallets/, async (msg) => {
  try {
    const wallets = await getWalletAddresses(msg.from.id);
    
    if (wallets.length === 0) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You have no linked wallets. Use /linkwallet to add one.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    let message = '📋 Your Linked Wallets:\n\n';
    wallets.forEach(wallet => {
      message += `Network: ${wallet.network}\n` +
                `Type: ${wallet.type}\n` +
                `Address: ${wallet.address}\n` +
                `Default: ${wallet.isDefault ? 'Yes' : 'No'}\n\n`;
    });

    await bot.sendMessage(
      msg.chat.id,
      message,
      { reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error listing wallets:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while fetching your wallets. Please try again.',
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
    
    const wallets = await getWalletAddresses(msg.from.id);
    if (wallets.length === 0) {
      await bot.sendMessage(
        msg.chat.id,
        '❌ You need to link a wallet first using /linkwallet <network> <address>.',
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

    // Create inline keyboard for network selection
    const keyboard = {
      inline_keyboard: wallets.map(wallet => [{
        text: `${wallet.network.toUpperCase()} (${wallet.type})`,
        callback_data: `claim_${wallet.network}_${wallet.type}`
      }])
    };

    await bot.sendMessage(
      msg.chat.id,
      `💰 Choose a network to claim your ${amountToClaim} sats:`,
      { reply_to_message_id: msg.message_id, reply_markup: keyboard }
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
    
    // Create inline keyboard for payment network selection
    const keyboard = {
      inline_keyboard: [
        [
          { text: '₿ Bitcoin Mainnet', callback_data: 'pin_btc' }
        ],
        [
          { text: '🟡 exSat Network', callback_data: 'pin_exsat' }
        ]
      ]
    };

    await bot.sendMessage(
      msg.chat.id,
      `📌 Choose your preferred payment network to pin this message for ${config.pinningDuration} hours (${config.pinningCost} sats):`,
      { reply_to_message_id: msg.message_id, reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Error handling pin request:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while processing your pin request. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Handle payment network selection
bot.on('callback_query', async (query) => {
  try {
    const [action, network, type] = query.data.split('_');
    
    if (action === 'claim') {
      const msg = query.message;
      const user = await getUser(query.from.id);
      const amountToClaim = user.balance;
      
      // Get the wallet address for the selected network
      const wallet = await getDefaultWalletAddress(query.from.id, network);
      if (!wallet) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Wallet not found. Please link a wallet first.',
          show_alert: true
        });
        return;
      }

      // Create payment based on network
      const payment = await paymentService.createPayment({
        amount: amountToClaim,
        description: `SatChat Reward Claim for user ${query.from.id}`,
        network,
        type,
        callbackUrl: process.env.WEBHOOK_URL,
        autoSettle: true
      });

      // Log the claim attempt
      await logDonation(query.from.id, amountToClaim, payment.invoiceId, 'Reward Claim', null, null, network);
      
      // Reset user balance
      await resetUserBalance(query.from.id);

      // Send payment instructions
      let paymentInstructions = '';
      switch (network) {
        case 'lightning':
          paymentInstructions = `⚡️ To claim your ${amountToClaim} sats, please pay this Lightning invoice:\n\n${payment.paymentRequest}`;
          break;
        case 'btc':
          paymentInstructions = `₿ To claim your ${amountToClaim} sats, please send to this Bitcoin address:\n\n${payment.paymentRequest}`;
          break;
        case 'exsat':
          paymentInstructions = `🟡 To claim your ${amountToClaim} sats, please send to this exSat address:\n\n${payment.paymentRequest}`;
          break;
        case 'exsat-evm':
          paymentInstructions = `🟡 To claim your ${amountToClaim} sats, please send to this exSat EVM address:\n\n${payment.paymentRequest}`;
          break;
      }

      await bot.editMessageText(
        paymentInstructions,
        {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          reply_markup: { inline_keyboard: [] }
        }
      );
    } else if (action === 'pin') {
      const msg = query.message;
      const cost = config.pinningCost;
      
      // Create payment based on selected network
      const payment = await paymentService.createPayment({
        amount: cost,
        description: `SatChat Message Pinning for message ${msg.reply_to_message.message_id}`,
        network,
        callbackUrl: process.env.WEBHOOK_URL,
        autoSettle: false
      });

      // Record the pinning request
      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + config.pinningDuration);
      await addPinnedMessage(
        msg.reply_to_message.message_id,
        msg.chat.id,
        query.from.id,
        cost,
        expiryTime,
        payment.invoiceId,
        network
      );

      // Log the donation
      await logDonation(
        query.from.id,
        cost,
        payment.invoiceId,
        'Message Pinning',
        msg.reply_to_message.message_id,
        msg.chat.id,
        network
      );

      // Send payment instructions
      let paymentInstructions = '';
      if (network === 'btc') {
        paymentInstructions = `📌 To pin this message for ${config.pinningDuration} hours, you need to pay ${cost} sats using Bitcoin.

Invoice ID: ${payment.invoiceId}

Please send exactly ${cost} sats to this Bitcoin address:
${payment.paymentRequest}

Once payment is confirmed, the message will be pinned.`;
      } else if (network === 'exsat') {
        paymentInstructions = `📌 To pin this message for ${config.pinningDuration} hours, you need to pay ${cost} sats using exSat.

Invoice ID: ${payment.invoiceId}

Please send exactly ${cost} sats using the following payment request:
${payment.paymentRequest}

Once payment is confirmed, the message will be pinned.`;
      }

      await bot.editMessageText(
        paymentInstructions,
        {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          reply_markup: { inline_keyboard: [] }
        }
      );
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ An error occurred. Please try again.',
      show_alert: true
    });
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
/linkwallet <network> <address> - Link a wallet address
Supported networks:
• lightning - Lightning Network address (starts with ln)
• btc - Bitcoin address
• exsat - exSat native address
• exsat-evm - exSat EVM address

/wallets - List your linked wallets
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

// Webhook endpoint for payment confirmation
const app = express();
app.use(express.json());

app.post('/webhook/payment', async (req, res) => {
  try {
    const { invoiceId, network } = req.body;
    
    // Verify payment status
    const paymentStatus = await paymentService.verifyPayment(invoiceId, network);
    
    if (paymentStatus.paid) {
    // Update donation status
      await updateDonationStatus(invoiceId, 'completed');
      
        // Check if it's for pinning
      const [pinRows] = await pool.query('SELECT * FROM pinnedMessages WHERE invoiceId = ?', [invoiceId]);
      if (pinRows.length > 0) {
        const pin = pinRows[0];
        await updatePinPaymentStatus(invoiceId, 'completed');
        await bot.pinChatMessage(pin.chatId, pin.messageId);
        console.log(`Message ${pin.messageId} pinned after payment confirmation for invoice ${invoiceId}`);
          await bot.sendMessage(pin.chatId, `📌 Message has been pinned successfully for ${config.pinningDuration} hours!`);
      }
    } else if (paymentStatus.status === 'failed') {
      await updateDonationStatus(invoiceId, 'failed');
      await updatePinPaymentStatus(invoiceId, 'failed');
      console.log(`Payment failed for invoice ${invoiceId}`);
      }
    
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Start the webhook server
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