import logging
import asyncio
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
            f'Welcome {user.first_name}! Your account has been created. '
            'Start chatting to earn rewards!'
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

def main() -> None:
    """Start the bot."""
    # Create the Application with minimal settings
    application = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .concurrent_updates(True)  # Enable concurrent updates for better performance
        .build()
    )

    # Initialize database
    asyncio.run(db.initialize_database())

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("balance", balance))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Start the Bot with minimal polling settings
    application.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True  # Drop pending updates on startup
    )

if __name__ == '__main__':
    main() 