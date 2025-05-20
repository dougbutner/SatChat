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
bot.onText(/\/linkwallet(?:\s+(.+))?/, async (msg, match) => {
  try {
    // If no arguments provided, show format help
    if (!match[1]) {
      await bot.sendMessage(
        msg.chat.id,
        `*📝 Wallet Linking Guide*

Please use the following format:
/linkwallet <network> <address>

*Supported Networks and Formats:*
• lightning - Lightning Network address
  Format: ln... (starts with ln)
  Example: lnbc1p...

• btc - Bitcoin address
  Supported formats:
  - Legacy (P2PKH): Starts with 1
  - SegWit (P2SH): Starts with 3
  - Native SegWit (Bech32): Starts with bc1
  - Taproot (Bech32m): Starts with bc1p
  Example: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa

• exsat - exSat native address (EOSIO format)
  Format: 1-12 characters, only a-z, 1-5
  Example: ice

• exsat-evm - exSat EVM address
  Format: 0x followed by 40 hex characters
  Example: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

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
        // Support for all common Bitcoin address formats:
        // P2PKH (1...), P2SH (3...), Bech32 (bc1...), and Bech32m (bc1p...)
        isValid = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address) || 
                 /^bc1[ac-hj-np-z02-9]{11,71}$/.test(address);
        type = 'bitcoin';
        break;
      case 'exsat':
        // EOSIO format: 1-12 characters, only a-z, 1-5
        isValid = /^[a-z1-5]{1,12}$/.test(address);
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
      let formatHint = '';
      switch (network.toLowerCase()) {
        case 'exsat':
          formatHint = 'exSat addresses use EOSIO format (1-12 characters, only a-z, 1-5)\nExample: ice';
          break;
        case 'lightning':
          formatHint = 'Lightning addresses start with ln';
          break;
        case 'btc':
          formatHint = `Bitcoin addresses can be in these formats:
• Legacy (P2PKH): Starts with 1
• SegWit (P2SH): Starts with 3
• Native SegWit (Bech32): Starts with bc1
• Taproot (Bech32m): Starts with bc1p`;
          break;
        case 'exsat-evm':
          formatHint = 'exSat EVM addresses start with 0x followed by 40 hex characters';
          break;
      }
      
      await bot.sendMessage(
        msg.chat.id,
        `❌ Invalid ${network} address format. ${formatHint}`,
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

    // Generate unique invoice ID
    const invoiceId = `PIN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create inline keyboard with verify payment button
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Verify Payment', callback_data: `verify_${invoiceId}` }
        ]
      ]
    };

    // Record the pinning request
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + config.pinningDuration);
    await addPinnedMessage(
      msg.reply_to_message.message_id,
      msg.chat.id,
      msg.from.id,
      config.pinningCost,
      expiryTime,
      invoiceId,
      'exsat'
    );

    // Log the donation
    await logDonation(
      msg.from.id,
      config.pinningCost,
      invoiceId,
      'Message Pinning',
      msg.reply_to_message.message_id,
      msg.chat.id,
      'exsat'
    );

    // Send payment instructions
    const paymentInstructions = `📌 To pin this message for ${config.pinningDuration} hours, you need to pay ${config.pinningCost} sats using exSat.

Invoice ID: ${invoiceId}

Please send exactly ${config.pinningCost} sats to this exSat address:
${process.env.BOT_EXSAT_ADDRESS}

Important: You MUST include the Invoice ID in the memo field:
${invoiceId}

Once you've sent the payment, click the "Verify Payment" button below.`;

    await bot.sendMessage(
      msg.chat.id,
      paymentInstructions,
      { 
        reply_to_message_id: msg.message_id,
        reply_markup: keyboard
      }
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

// Handle payment verification
bot.on('callback_query', async (query) => {
  try {
    const [action, invoiceId] = query.data.split('_');
    
    if (action === 'verify') {
      const msg = query.message;
      
      // Get the pinned message details
      const [pinRows] = await pool.query('SELECT * FROM pinnedMessages WHERE invoiceId = ?', [invoiceId]);
      if (pinRows.length === 0) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Invoice not found.',
          show_alert: true
        });
        return;
      }

      const pin = pinRows[0];
      
      // Check if already paid
      if (pin.paymentStatus === 'completed') {
        await bot.answerCallbackQuery(query.id, {
          text: '✅ Payment already verified!',
          show_alert: true
        });
        return;
      }

      // Verify payment on blockchain
      const paymentVerified = await verifyExSatPayment(invoiceId, pin.cost);
      
      if (paymentVerified) {
        // Update payment status
        await updatePinPaymentStatus(invoiceId, 'completed');
        await updateDonationStatus(invoiceId, 'completed');
        
        // Update bot balance
        const currentBalance = await getBotBalance('exsat');
        await updateBotBalance('exsat', currentBalance + pin.cost);
        
        // Pin the message
        await bot.pinChatMessage(pin.chatId, pin.messageId);
        
        await bot.answerCallbackQuery(query.id, {
          text: '✅ Payment verified! Message has been pinned.',
          show_alert: true
        });
        
        await bot.editMessageText(
          '✅ Payment verified! Message has been pinned successfully.',
          {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            reply_markup: { inline_keyboard: [] }
          }
        );
      } else {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Payment not found. Please make sure you sent the correct amount with the Invoice ID in the memo.',
          show_alert: true
        });
      }
    } else if (action === 'claim') {
      const msg = query.message;
      const user = await getUser(query.from.id);
      const amountToClaim = user.balance;
      
      // Get the wallet address for the selected network
      const wallet = await getDefaultWalletAddress(query.from.id, 'exsat');
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
        network: 'exsat',
        type: 'exsat',
        callbackUrl: process.env.WEBHOOK_URL,
        autoSettle: true
      });

      // Log the claim attempt
      await logDonation(query.from.id, amountToClaim, payment.invoiceId, 'Reward Claim', null, null, 'exsat');
      
      // Reset user balance
      await resetUserBalance(query.from.id);

      // Send payment instructions
      let paymentInstructions = '';
      paymentInstructions = `🟡 To claim your ${amountToClaim} sats, please send to this exSat address:\n\n${payment.paymentRequest}`;

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

// Helper function to verify exSat payment
async function verifyExSatPayment(invoiceId, expectedAmount) {
  try {
    // TODO: Implement blockchain history check using eosJS
    // This is a placeholder - you'll need to implement the actual blockchain check
    return false;
  } catch (error) {
    console.error('Error verifying exSat payment:', error);
    return false;
  }
}

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
*📚 SatChat Bot Help*

*User Commands:*
/linkwallet <network> <address> - Link a wallet address
Supported networks:
• lightning - Lightning Network address (starts with ln)
• btc - Bitcoin address
• exsat - exSat native address
• exsat-evm - exSat EVM address

*Currently Active Network:*
• exSat Native Network
  - All payments and rewards are processed on exSat
  - Format: 1-12 characters, only a-z, 1-5
  Example: myexsatname

/wallets - List your linked wallets
/claim - Claim your earned satoshis to your wallet
/pin - Reply to a message with this command to pin it (costs ${config.pinningCost} sats)
/balance - Check your current balance

*Admin Commands:*
/setreward <amount> - Set reward per message
/setcap <amount> - Set daily reward cap
/setpin <cost> <hours> - Set pinning cost and duration
/addkeyword <word> <multiplier> - Add or update a keyword that boosts rewards (multiplier between 1.0-10.0)

*Current Settings:*
• Reward per message: ${config.rewardPerMessage} sats
• Daily reward cap: ${config.dailyRewardCap} sats
• Pinning cost: ${config.pinningCost} sats
• Pinning duration: ${config.pinningDuration} hours

*Payment Instructions:*
• All payments are processed on the exSat network
• When pinning a message, you'll receive an invoice ID
• Send the exact amount to the bot's exSat address
• Include the invoice ID in the memo field
• Click "Verify Payment" after sending

Made with ❤️ for the Bitcoin 2025 Hackathon
`;
    
    await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
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

// Handle /listchains command
bot.onText(/\/listchains/, async (msg) => {
  try {
    await bot.sendMessage(
      msg.chat.id,
      `*🔗 Supported Networks for Stacking Sats*

*Lightning Network*
• Fastest and cheapest for small amounts
• Best for regular transactions
• Format: ln... (starts with ln)

*Bitcoin (BTC)*
• Most widely supported
• Best for larger amounts
• Format: 1... or 3... (25-34 characters)

*exSat Network*
• Native exSat addresses
• Best for exSat ecosystem
• Format: 42 characters

*exSat EVM*
• Compatible with Ethereum tools
• Best for DeFi and smart contracts
• Format: 0x followed by 40 hex characters

Use /linkwallet to add a wallet address for any of these networks.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error listing chains:', error);
    await bot.sendMessage(
      msg.chat.id,
      '❌ An error occurred while fetching network information. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});