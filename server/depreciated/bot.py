import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import database as db
from config import TELEGRAM_BOT_TOKEN

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    user = update.effective_user
    db_user = await db.get_user(user.id)
    
    if not db_user:
        await db.create_user({
            'telegramId': user.id,
            'username': user.username,
            'firstName': user.first_name,
            'lastName': user.last_name
        })
        await update.message.reply_text(
            f'Welcome {user.first_name}! Your account has been created.\n'
            'Start chatting to earn rewards!\n\n'
            'Commands:\n'
            '/balance - Check your balance\n'
            '/linkwallet - Link your Lightning address\n'
            '/claim - Claim your rewards'
        )
    else:
        await update.message.reply_text(
            f'Welcome back {user.first_name}! Your balance is {db_user["balance"]} sats.'
        )

async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show user's current balance."""
    user = update.effective_user
    db_user = await db.get_user(user.id)
    
    if db_user:
        await update.message.reply_text(
            f'Your current balance is {db_user["balance"]} sats.\n'
            f'Total earned: {db_user["totalEarned"]} sats\n'
            f'Messages sent: {db_user["messageCount"]}'
        )
    else:
        await update.message.reply_text('Please use /start to create your account first.')

async def link_wallet(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Link a Lightning address to the user's account."""
    if not context.args or len(context.args) != 1:
        await update.message.reply_text(
            'Please provide your Lightning address.\n'
            'Usage: /linkwallet <lightning_address>\n'
            'Example: /linkwallet username@ln.tips'
        )
        return

    wallet_address = context.args[0]
    user = update.effective_user
    db_user = await db.get_user(user.id)

    if not db_user:
        await update.message.reply_text('Please use /start to create your account first.')
        return

    # Basic validation for Lightning address format
    if '@' not in wallet_address or not wallet_address.endswith('.ln.tips'):
        await update.message.reply_text(
            'Invalid Lightning address format. Please provide a valid Lightning address.\n'
            'Example: username@ln.tips'
        )
        return

    success = await db.update_wallet_address(user.id, wallet_address)
    if success:
        await update.message.reply_text(
            f'Successfully linked your Lightning address: {wallet_address}\n'
            'You can now claim your rewards using /claim!'
        )
    else:
        await update.message.reply_text('Failed to link wallet. Please try again.')

async def claim(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Claim earned sats and send them to the user's Lightning address."""
    user = update.effective_user
    db_user = await db.get_user(user.id)
    
    if not db_user:
        await update.message.reply_text('Please use /start to create your account first.')
        return
        
    if not db_user["walletAddress"]:
        await update.message.reply_text(
            'Please link your Lightning address first using /linkwallet <address>'
        )
        return
        
    if db_user["balance"] <= 0:
        await update.message.reply_text('You have no sats to claim!')
        return
        
    # Minimum withdrawal amount
    MIN_WITHDRAWAL = 1000  # 1000 sats minimum
    
    if db_user["balance"] < MIN_WITHDRAWAL:
        await update.message.reply_text(
            f'Minimum withdrawal amount is {MIN_WITHDRAWAL} sats.\n'
            f'Your current balance: {db_user["balance"]} sats'
        )
        return
    
    try:
        # Update user balance
        await db.update_user_balance(user.id, -db_user["balance"])
        
        await update.message.reply_text(
            f'Processing withdrawal of {db_user["balance"]} sats to {db_user["walletAddress"]}\n\n'
            f'To receive your payment:\n'
            f'1. Open your Lightning wallet\n'
            f'2. Send a payment to: {db_user["walletAddress"]}\n'
            f'3. Amount: {db_user["balance"]} sats\n\n'
            f'Your balance has been reset to 0. Happy earning!'
        )
    except Exception as e:
        logger.error(f"Error processing withdrawal: {e}")
        await update.message.reply_text(
            'Failed to process withdrawal. Please try again later.'
        )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming messages and distribute rewards."""
    if not update.message or not update.message.text:
        return

    user = update.effective_user
    message_text = update.message.text
    chat_id = update.message.chat_id
    message_id = update.message.message_id

    # Get user from database
    db_user = await db.get_user(user.id)
    if not db_user:
        await db.create_user({
            'telegramId': user.id,
            'username': user.username,
            'firstName': user.first_name,
            'lastName': user.last_name
        })
        db_user = await db.get_user(user.id)

    # Calculate reward (base reward is 1 sat)
    reward = 1

    # Check for reward keywords
    keywords = await db.get_reward_keywords()
    for keyword in keywords:
        if keyword['keyword'].lower() in message_text.lower():
            reward = int(reward * keyword['multiplier'])

    # Update user balance and log reward
    await db.update_user_balance(user.id, reward)
    await db.log_reward(db_user['id'], reward, message_id, chat_id, message_text)

    # Send reward confirmation
    await update.message.reply_text(
        f'Rewarded {reward} sats for your message! Your new balance is {db_user["balance"] + reward} sats.'
    )

def main():
    """Start the bot."""
    # Initialize database
    db.initialize_database()

    # Create the Application
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("balance", balance))
    application.add_handler(CommandHandler("linkwallet", link_wallet))
    application.add_handler(CommandHandler("claim", claim))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Start the Bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main() 