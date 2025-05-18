# SatChat Bot

**SatChat** is a Telegram bot designed for the Bitcoin 2025 Hackathon. It rewards users with satoshis (sats) for participating in chat groups, allows message pinning for a fee, and supports claiming rewards to Lightning wallets.

## Features
- **User Rewards**: Earn sats for sending messages in the chat.
- **Keyword Multipliers**: Certain keywords boost reward amounts.
- **Wallet Linking**: Link a Lightning wallet to claim rewards.
- **Message Pinning**: Pay to pin messages for a specified duration.
- **Admin Controls**: Configure reward settings, daily caps, pinning costs, and keywords.
- **Daily Stats**: Tracks and resets daily reward distribution.

## Setup Instructions

### Prerequisites
- Node.js and npm installed on your system.
- MySQL database server.
- Telegram Bot Token from BotFather.
- OpenNode account for Lightning Network payments.

### Installation
1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd SatChat
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Set Up Environment Variables**:
   - Create a `.env` file in the root directory.
   - Add the following:
     ```
     TELEGRAM_BOT_TOKEN=your_telegram_bot_token
     DB_HOST=your_database_host
     DB_USER=your_database_user
     DB_PASSWORD=your_database_password
     DB_NAME=your_database_name
     OPENNODE_API_KEY=your_opennode_api_key
     WEBHOOK_URL=your_webhook_url_for_payment_confirmation
     WEBHOOK_PORT=3000
     ```
4. **Database Setup**:
   - Create the necessary tables by running the SQL scripts found in `server/database.sql`.
5. **Run the Bot**:
   ```bash
   node server/bot.js
   ```

## Usage
- **User Commands**:
  - `/linkwallet <address>`: Link your Lightning wallet.
  - `/claim`: Claim your earned sats.
  - `/pin`: Reply to a message to pin it (costs sats).
  - `/balance`: Check your current balance.
  - `/help`: View all commands and settings.
- **Admin Commands**:
  - `/setreward <amount>`: Set reward per message.
  - `/setcap <amount>`: Set daily reward cap.
  - `/setpin <cost> <hours>`: Set pinning cost and duration.
  - `/addkeyword <word> <multiplier>`: Add a keyword that boosts rewards.

## Development
- **Database Schema**: Managed in `server/database.js`.
- **Bot Logic**: Found in `server/bot.js`.

## Lightning Network Integration
- **OpenNode Integration**: SatChat uses OpenNode for Lightning Network payments.
  1. Sign up for an OpenNode account at [opennode.com](https://opennode.com) to obtain API credentials.
  2. Add your OpenNode API key to the `.env` file as `OPENNODE_API_KEY`.
  3. Set up a webhook URL for payment confirmations. For local development, use a service like ngrok to expose your local server (e.g., `ngrok http 3000`) and set `WEBHOOK_URL` in the `.env` file.
  4. For production, deploy the bot to a server with a public IP and secure the webhook endpoint.

## Contributing
Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests.

## License
Made with ❤️ for the Bitcoin 2025 Hackathon.
