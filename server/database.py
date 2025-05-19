import mysql.connector
from mysql.connector import pooling
from typing import Optional, List, Dict, Any
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# Database configuration
db_config = {
    'host': DB_HOST,
    'user': DB_USER,
    'password': DB_PASSWORD,
    'database': DB_NAME,
    'pool_name': 'satchat_pool',
    'pool_size': 5  # Reduced pool size for free hosting
}

# Create connection pool
connection_pool = mysql.connector.pooling.MySQLConnectionPool(**db_config)

async def initialize_database():
    """Initialize database and create required tables if they don't exist."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        
        # Create users table
        cursor.execute("""
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
        """)
        
        # Create rewardHistory table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rewardHistory (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                userId BIGINT,
                amount BIGINT,
                messageId BIGINT,
                chatId BIGINT,
                messageText TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create rewardkeywords table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rewardkeywords (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                keyword VARCHAR(255) UNIQUE,
                multiplier DECIMAL(5,2) DEFAULT 1.0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        print('Database and tables initialized successfully')
        
    except Exception as e:
        print(f'Error initializing database: {e}')
    finally:
        cursor.close()
        conn.close()

async def get_user(telegram_id: int) -> Optional[Dict[str, Any]]:
    """Get user by Telegram ID."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM users WHERE telegramId = %s', (telegram_id,))
        user = cursor.fetchone()
        return user
    finally:
        cursor.close()
        conn.close()

async def create_user(user_data: Dict[str, Any]) -> None:
    """Create a new user."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO users (telegramId, username, firstName, lastName) VALUES (%s, %s, %s, %s)',
            (user_data['telegramId'], user_data['username'], user_data['firstName'], user_data['lastName'])
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

async def update_user_balance(telegram_id: int, reward_amount: int) -> None:
    """Update user's balance and message count."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE users SET balance = balance + %s, totalEarned = totalEarned + %s, messageCount = messageCount + 1, lastActive = NOW() WHERE telegramId = %s',
            (reward_amount, reward_amount, telegram_id)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

async def log_reward(user_id: int, amount: int, message_id: int, chat_id: int, message_text: str) -> None:
    """Log a reward transaction."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO rewardHistory (userId, amount, messageId, chatId, messageText) VALUES (%s, %s, %s, %s, %s)',
            (user_id, amount, message_id, chat_id, message_text)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

async def add_reward_keyword(keyword: str, multiplier: float) -> None:
    """Add or update a reward keyword."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO rewardkeywords (keyword, multiplier) VALUES (%s, %s) ON DUPLICATE KEY UPDATE multiplier = %s, updatedAt = NOW()',
            (keyword, multiplier, multiplier)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

async def update_wallet_address(telegram_id: int, wallet_address: str) -> bool:
    """Update user's Lightning wallet address."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE users SET walletAddress = %s, walletLinkedAt = NOW() WHERE telegramId = %s',
            (wallet_address, telegram_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        cursor.close()
        conn.close()

async def get_reward_keywords() -> List[Dict[str, Any]]:
    """Get all reward keywords."""
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM rewardkeywords')
        keywords = cursor.fetchall()
        return keywords
    finally:
        cursor.close()
        conn.close() 