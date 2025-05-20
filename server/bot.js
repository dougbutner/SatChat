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
import vaultaService from './blockchain/vaulta.js';

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
  dailyRewardCap: 10,          // Maximum rewards per day
  pinningCost: 69,              // Cost to pin a message
  pinningDuration: 48,            // Hours a message stays pinned
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

// Message formatting utilities
const messageStyles = {
  emojis: {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    money: '💰',
    wallet: '👛',
    pin: '📌',
    help: '📚',
    network: '🔗',
    bitcoin: '₿',
    lightning: '⚡',
    settings: '⚙️',
    stats: '📊',
    time: '⏰',
    check: '✓',
    cross: '✗'
  },
  
  formatBalance: (amount) => `${messageStyles.emojis.money} ${amount} sats`,
  formatSuccess: (text) => `${messageStyles.emojis.success} ${text}`,
  formatError: (text) => `${messageStyles.emojis.error} ${text}`,
  formatWarning: (text) => `${messageStyles.emojis.warning} ${text}`,
  formatInfo: (text) => `${messageStyles.emojis.info} ${text}`,
  
  formatSection: (title, content) => `*${title}*\n${content}`,
  formatListItem: (text) => `• ${text}`,
  formatCode: (text) => `\`${text}\``,
  
  formatNetwork: (network) => {
    const networkEmojis = {
      'lightning': messageStyles.emojis.lightning,
      'btc': messageStyles.emojis.bitcoin,
      'exsat': messageStyles.emojis.wallet,
      'exsat-evm': messageStyles.emojis.wallet
    };
    return `${networkEmojis[network] || ''} ${network}`;
  }
};

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
        messageStyles.formatWarning(`Daily reward cap of ${config.dailyRewardCap} sats has been reached. No more rewards will be distributed today.`)
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
    
    // Update reward message
    await bot.sendMessage(
      msg.chat.id,
      `${messageStyles.formatSuccess(`Rewarded ${reward} sats for your message!`)}\n` +
      `${messageStyles.formatBalance(`New balance: ${user["balance"] + reward}`)}`,
      { parse_mode: 'Markdown' }
    );
    
    // Update Bitcoin fact message
    if (Math.random() < 0.1) {
      await bot.sendMessage(
        msg.chat.id,
        `${messageStyles.emojis.bitcoin} *Bitcoin Fact:*\n${fact}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Handle /linkwallet command
bot.onText(/\/linkwallet(?:\s+(.+))?/, async (msg, match) => {
  try {
    if (!match[1]) {
      const helpText = `
${messageStyles.emojis.wallet} *Wallet Linking Guide*

${messageStyles.formatSection('Format', messageStyles.formatCode('/linkwallet <network> <address>'))}

${messageStyles.formatSection('Supported Networks', `
${messageStyles.formatListItem(`${messageStyles.emojis.lightning} Lightning Network
  Format: ln... (starts with ln)
  Example: lnbc1p...`)}

${messageStyles.formatListItem(`${messageStyles.emojis.bitcoin} Bitcoin
  Supported formats:
  - Legacy (P2PKH): Starts with 1
  - SegWit (P2SH): Starts with 3
  - Native SegWit (Bech32): Starts with bc1
  - Taproot (Bech32m): Starts with bc1p
  Example: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`)}

${messageStyles.formatListItem(`${messageStyles.emojis.wallet} exSat Native
  Format: 1-12 characters, only a-z, 1-5
  Example: ice`)}

${messageStyles.formatListItem(`${messageStyles.emojis.wallet} exSat EVM
  Format: 0x followed by 40 hex characters
  Example: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e`)}`)}`;
      
      await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
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
    
    // Update success message
    await bot.sendMessage(
      msg.chat.id,
      `${messageStyles.formatSuccess('Wallet linked successfully!')}\n\n` +
      `${messageStyles.formatSection('Details', `
${messageStyles.formatListItem(`Network: ${messageStyles.formatNetwork(network)}`)}
${messageStyles.formatListItem(`Type: ${type}`)}
${messageStyles.formatListItem(`Address: ${messageStyles.formatCode(address)}`)}`)}\n\n` +
      `Use /claim to withdraw your rewards.`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error linking wallet:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred while linking your wallet. Please try again.'),
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
        messageStyles.formatError('You have no linked wallets. Use /linkwallet to add one.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const walletList = wallets.map(wallet => 
      `${messageStyles.formatListItem(`${messageStyles.formatNetwork(wallet.network)}`)}
${messageStyles.formatListItem(`Type: ${wallet.type}`)}
${messageStyles.formatListItem(`Address: ${messageStyles.formatCode(wallet.address)}`)}
${messageStyles.formatListItem(`Default: ${wallet.isDefault ? messageStyles.emojis.check : messageStyles.emojis.cross}`)}`
    ).join('\n\n');

    await bot.sendMessage(
      msg.chat.id,
      `${messageStyles.emojis.wallet} *Your Linked Wallets*\n\n${walletList}`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error listing wallets:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred while fetching your wallets. Please try again.'),
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
        messageStyles.formatError('You need to participate in the chat first to earn rewards.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    if (user.balance < 1000) {
      await bot.sendMessage(
        msg.chat.id,
        messageStyles.formatWarning(`Minimum withdrawal amount is 1000 sats. Your current balance is ${user.balance} sats.`),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const wallet = await getDefaultWalletAddress(msg.from.id, 'exsat');
    if (!wallet) {
      await bot.sendMessage(
        msg.chat.id,
        messageStyles.formatError('Please link a wallet first using /linkwallet.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const claimId = `CLAIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const amountToClaim = user.balance;

    try {
      const result = await paymentService.sendExSatPayment(
        wallet.address,
        amountToClaim,
        `SatChat Reward Claim for user ${msg.from.id}`
      );

      if (result.success) {
        await resetUserBalance(msg.from.id);
        await logDonation(
          msg.from.id,
          amountToClaim,
          claimId,
          'Reward Claim',
          null,
          null,
          'exsat'
        );

        const claimDetails = [
          messageStyles.formatSuccess('Successfully claimed your rewards!'),
          messageStyles.formatSection('Transaction Details', `
${messageStyles.formatListItem(`Amount: ${messageStyles.formatBalance(amountToClaim)}`)}
${messageStyles.formatListItem(`To: ${messageStyles.formatCode(wallet.address)}`)}
${messageStyles.formatListItem(`TX ID: ${messageStyles.formatCode(result.txId)}`)}`)
        ].join('\n\n');

        await bot.sendMessage(
          msg.chat.id,
          claimDetails,
          { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
        );
      } else {
        throw new Error('Payment failed');
      }
    } catch (error) {
      console.error('Error processing claim:', error);
      await bot.sendMessage(
        msg.chat.id,
        messageStyles.formatError('An error occurred while processing your claim. Please try again.'),
        { reply_to_message_id: msg.message_id }
      );
    }
  } catch (error) {
    console.error('Error handling claim:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred. Please try again.'),
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
        messageStyles.formatError('You need to reply to a message you want to pin.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    const user = await getUser(msg.from.id);
    
    if (!user) {
      await bot.sendMessage(
        msg.chat.id,
        messageStyles.formatError('You need to participate in the chat first before you can pin messages.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const invoiceId = `PIN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const keyboard = {
      inline_keyboard: [
        [{ text: `${messageStyles.emojis.check} Verify Payment`, callback_data: `verify_${invoiceId}` }]
      ]
    };

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

    await logDonation(
      msg.from.id,
      config.pinningCost,
      invoiceId,
      'Message Pinning',
      msg.reply_to_message.message_id,
      msg.chat.id,
      'exsat'
    );

    const pinInstructions = [
      `${messageStyles.emojis.pin} *Pin Message Instructions*`,
      messageStyles.formatSection('Cost', `${messageStyles.formatBalance(config.pinningCost)} for ${config.pinningDuration} hours`),
      messageStyles.formatSection('Payment Details', `
${messageStyles.formatListItem(`Invoice ID: ${messageStyles.formatCode(invoiceId)}`)}
${messageStyles.formatListItem(`Amount: ${messageStyles.formatBalance(config.pinningCost)}`)}
${messageStyles.formatListItem(`Address: ${messageStyles.formatCode(process.env.BOT_EXSAT_ADDRESS)}`)}
${messageStyles.formatListItem(`Memo: ${messageStyles.formatCode(invoiceId)}`)}`),
      messageStyles.formatInfo('The amount will be converted to A tokens on the Vaulta network.'),
      messageStyles.formatInfo('Click the "Verify Payment" button below after sending.')
    ].join('\n\n');

    await bot.sendMessage(
      msg.chat.id,
      pinInstructions,
      { 
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id,
        reply_markup: keyboard
      }
    );
  } catch (error) {
    console.error('Error handling pin request:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred while processing your pin request. Please try again.'),
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Handle payment verification
bot.on('callback_query', async (query) => {
  try {
    if (query.data.startsWith('verify_')) {
      const invoiceId = query.data.replace('verify_', '');
      const pin = await getPinnedMessage(invoiceId);
      
      if (!pin) {
        await bot.answerCallbackQuery(query.id, {
          text: messageStyles.formatError('Invalid pin request.'),
          show_alert: true
        });
        return;
      }

      const paymentVerified = await verifyPayment(invoiceId);
      
      if (paymentVerified) {
        await updatePinPaymentStatus(invoiceId, 'completed');
        await updateDonationStatus(invoiceId, 'completed');
        
        const currentBalance = await getBotBalance('exsat');
        await updateBotBalance('exsat', currentBalance + pin.cost);
        
        await bot.pinChatMessage(pin.chatId, pin.messageId);
        
        await bot.answerCallbackQuery(query.id, {
          text: messageStyles.formatSuccess('Payment verified! Message has been pinned.'),
          show_alert: true
        });
        
        await bot.editMessageText(
          messageStyles.formatSuccess('Payment verified! Message has been pinned successfully.'),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: [] }
          }
        );
      } else {
        await bot.answerCallbackQuery(query.id, {
          text: messageStyles.formatError('Payment not found. Please make sure you sent the correct amount with the Invoice ID in the memo.'),
          show_alert: true
        });
      }
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(query.id, {
      text: messageStyles.formatError('An error occurred. Please try again.'),
      show_alert: true
    });
  }
});

// Helper function to verify exSat payment
async function verifyExSatPayment(invoiceId, expectedAmount) {
  try {
    // Get payment details from database
    const [rows] = await pool.query(
      'SELECT * FROM donations WHERE invoiceId = ?',
      [invoiceId]
    );

    if (rows.length === 0) {
      return false;
    }

    const payment = rows[0];
    
    // Verify payment on Vaulta blockchain
    const verification = await vaultaService.verifyPayment(
      invoiceId,
      expectedAmount,
      payment.fromAddress
    );

    if (verification.paid) {
      // Update payment record with transaction ID
      await pool.query(
        'UPDATE donations SET txId = ?, status = ? WHERE invoiceId = ?',
        [verification.txId, 'completed', invoiceId]
      );
    }

    return verification.paid;
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
        messageStyles.formatError('You need to participate in the chat first to earn rewards.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }
    
    const stats = [
      messageStyles.formatBalance(`Current Balance: ${user.balance}`),
      messageStyles.formatBalance(`Total Earned: ${user.totalEarned || 0}`),
      messageStyles.formatInfo(`Messages Sent: ${user.messageCount || 0}`)
    ].join('\n');
    
    await bot.sendMessage(
      msg.chat.id,
      `${messageStyles.emojis.stats} *Your Stats*\n\n${stats}\n\nUse /claim to withdraw to your exSat wallet.`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error checking balance:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred while checking your balance. Please try again.'),
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
${messageStyles.emojis.help} *SatChat Bot Help*

${messageStyles.formatSection('User Commands', `
${messageStyles.formatListItem('/linkwallet <network> <address> - Link a wallet address')}
${messageStyles.formatListItem('/claim - Claim your earned satoshis')}
${messageStyles.formatListItem('/balance - Check your current balance')}
${messageStyles.formatListItem('/pin - Pin a message (costs ${config.pinningCost} sats)')}
${messageStyles.formatListItem('/wallets - List your linked wallets')}
${messageStyles.formatListItem('/listchains - View supported networks')}`)}

${messageStyles.formatSection('Supported Networks', `
${messageStyles.formatListItem(`${messageStyles.emojis.lightning} Lightning Network (ln...)`)}
${messageStyles.formatListItem(`${messageStyles.emojis.bitcoin} Bitcoin (1..., 3..., bc1...)`)}
${messageStyles.formatListItem(`${messageStyles.emojis.wallet} exSat Native (1-12 chars)`)}
${messageStyles.formatListItem(`${messageStyles.emojis.wallet} exSat EVM (0x...)`)}`)}

${messageStyles.formatSection('Current Settings', `
${messageStyles.formatListItem(`Reward per message: ${config.rewardPerMessage} sats`)}
${messageStyles.formatListItem(`Daily reward cap: ${config.dailyRewardCap} sats`)}
${messageStyles.formatListItem(`Pinning cost: ${config.pinningCost} sats`)}
${messageStyles.formatListItem(`Pinning duration: ${config.pinningDuration} hours`)}`)}

${messageStyles.formatSection('Admin Commands', `
${messageStyles.formatListItem('/setreward <amount> - Set reward per message')}
${messageStyles.formatListItem('/setcap <amount> - Set daily reward cap')}
${messageStyles.formatListItem('/setpin <cost> <hours> - Set pinning settings')}
${messageStyles.formatListItem('/addkeyword <word> <multiplier> - Add reward keyword')}`)}

Made with ❤️ for the Bitcoin 2025 Hackathon
`;
    
    await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error sending help message:', error);
  }
});

// Add /info as alias for /help
bot.onText(/\/info/, async (msg) => {
  // Reuse the help command handler
  await bot.emit('message', msg);
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
    const chainsInfo = [
      `${messageStyles.emojis.network} *Supported Networks for Stacking Sats*`,
      messageStyles.formatSection('Lightning Network', `
${messageStyles.formatListItem('Fastest and cheapest for small amounts')}
${messageStyles.formatListItem('Best for regular transactions')}
${messageStyles.formatListItem(`Format: ${messageStyles.formatCode('ln...')} (starts with ln)`)}`),
      messageStyles.formatSection('Bitcoin (BTC)', `
${messageStyles.formatListItem('Most widely supported')}
${messageStyles.formatListItem('Best for larger amounts')}
${messageStyles.formatListItem(`Format: ${messageStyles.formatCode('1...')} or ${messageStyles.formatCode('3...')} (25-34 characters)`)}`),
      messageStyles.formatSection('exSat Network', `
${messageStyles.formatListItem('Native exSat addresses')}
${messageStyles.formatListItem('Currently used for all withdrawals')}
${messageStyles.formatListItem(`Format: ${messageStyles.formatCode('1-12 characters, only a-z, 1-5')}`)}
${messageStyles.formatListItem(`Example: ${messageStyles.formatCode('myexsatname')}`)}`),
      messageStyles.formatSection('exSat EVM', `
${messageStyles.formatListItem('Compatible with Ethereum tools')}
${messageStyles.formatListItem('Best for DeFi and smart contracts')}
${messageStyles.formatListItem(`Format: ${messageStyles.formatCode('0x followed by 40 hex characters')}`)}`),
      messageStyles.formatInfo('Use /linkwallet to add a wallet address for any of these networks.'),
      messageStyles.formatInfo('Note: Currently, all withdrawals are processed on the exSat Native network.')
    ].join('\n\n');

    await bot.sendMessage(
      msg.chat.id,
      chainsInfo,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error listing chains:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred while fetching network information. Please try again.'),
      { reply_to_message_id: msg.message_id }
    );
  }
});

// Add Vaulta API configuration
const VAULTA_API_URL = 'https://vaulta.greymass.com/v1/chain';
const BTC_XSAT_CONTRACT = 'btc.xsat';

// Function to fetch wallet balance from Vaulta
async function getVaultaBalance(address) {
  try {
    const response = await fetch(`${VAULTA_API_URL}/get_table_rows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: true,
        code: BTC_XSAT_CONTRACT,
        scope: address,
        table: 'accounts',
        limit: 1
      })
    });

    const data = await response.json();
    
    if (!data.rows || data.rows.length === 0) {
      return {
        sats: 0,
        btc: '0.00000000',
        aTokens: 0,
        bTokens: 0
      };
    }

    const account = data.rows[0];
    return {
      sats: account.balance || 0,
      btc: (account.balance / 100000000).toFixed(8),
      aTokens: account.a_tokens || 0,
      bTokens: account.b_tokens || 0
    };
  } catch (error) {
    console.error('Error fetching Vaulta balance:', error);
    throw error;
  }
}

// Handle /wallet command
bot.onText(/\/wallet/, async (msg) => {
  try {
    const user = await getUser(msg.from.id);
    
    if (!user) {
      await bot.sendMessage(
        msg.chat.id,
        messageStyles.formatError('You need to participate in the chat first to use wallet features.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const wallet = await getDefaultWalletAddress(msg.from.id, 'exsat');
    if (!wallet) {
      await bot.sendMessage(
        msg.chat.id,
        messageStyles.formatError('Please link an exSat wallet first using /linkwallet exsat <address>.'),
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Get wallet balance from Vaulta
    const balance = await getVaultaBalance(wallet.address);
    
    const walletInfo = [
      `${messageStyles.emojis.wallet} *Your exSat Wallet*`,
      messageStyles.formatSection('Address', messageStyles.formatCode(wallet.address)),
      messageStyles.formatSection('Balance', `
${messageStyles.formatBalance(balance.sats)} (${balance.btc} BTC)
${messageStyles.formatListItem(`A Tokens: ${balance.aTokens}`)}
${messageStyles.formatListItem(`B Tokens: ${balance.bTokens}`)}`),
      messageStyles.formatInfo('Use /linkwallet to add more wallet addresses.')
    ].join('\n\n');

    await bot.sendMessage(
      msg.chat.id,
      walletInfo,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  } catch (error) {
    console.error('Error checking wallet balance:', error);
    await bot.sendMessage(
      msg.chat.id,
      messageStyles.formatError('An error occurred while fetching your wallet balance. Please try again.'),
      { reply_to_message_id: msg.message_id }
    );
  }
});