# SatChat

SatChat is a modern web application that integrates cryptocurrency functionality with a Telegram bot interface. Built with React, TypeScript, and Node.js, it provides a seamless experience for managing cryptocurrency transactions and interactions.

## Features

- 🚀 Modern React-based dashboard
- 💰 Cryptocurrency wallet integration
- 🤖 Telegram bot functionality
- 📊 Analytics and reporting
- 🔐 Secure wallet connection
- 👨‍💼 Admin panel for management

## Bot Commands

### User Commands
- `/linkwallet <address>` - Link your Lightning wallet address to receive rewards
- `/claim` - Claim your earned satoshis and transfer them to your linked wallet
- `/balance` - Check your current satoshi balance
- `/pin` - Reply to a message to pin it (costs satoshis)
- `/help` - Display all available commands and their usage

### Admin Commands
- `/setreward <amount>` - Set the reward amount per message (1-100 sats)
- `/setcap <amount>` - Set the daily reward cap
- `/setpin <cost> <hours>` - Set the cost and duration for pinning messages
- `/addkeyword <word> <multiplier>` - Add a keyword that boosts rewards with a multiplier

### Features
- Earn satoshis for sending messages in the chat
- Keywords can multiply your rewards
- Pin important messages for a fee
- Daily reward caps to manage distribution
- Automatic Bitcoin facts shared in chat
- Secure Lightning Network payments via OpenNode

## Tech Stack

### Frontend
- React 18
- TypeScript
- React Router DOM
- TailwindCSS
- Vite
- Recharts for analytics
- Lucide React for icons

### Backend
- Node.js
- Express.js
- Python (for bot functionality)
- MySQL Database
- OpenNode API integration
- Telegram Bot API

## Prerequisites

- Node.js (v18 or higher)
- Python 3.x
- MySQL Server
- Telegram Bot Token
- OpenNode API Key

## Installation

1. Clone the repository:
   ```bash
git clone https://github.com/yourusername/satchat.git
cd satchat
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the root directory with the following variables:
```env
     TELEGRAM_BOT_TOKEN=your_telegram_bot_token
     OPENNODE_API_KEY=your_opennode_api_key
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=satchat
```

## Development

1. Start the frontend development server:
```bash
npm run dev
```

2. Start the Telegram bot:
```bash
npm run start:bot
```

## Building for Production

1. Build the frontend:
```bash
npm run build
```

2. Preview the production build:
```bash
npm run preview
```

## Project Structure

```
satchat/
├── src/                    # Frontend source code
│   ├── components/        # Reusable React components
│   ├── pages/            # Page components
│   └── App.tsx           # Main application component
├── server/                # Backend server code
│   ├── bot.js            # Telegram bot implementation
│   ├── database.js       # Database operations
│   └── utils/            # Utility functions
├── public/               # Static assets
└── dist/                # Production build output
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

## Acknowledgments

- [OpenNode](https://www.opennode.com/) for cryptocurrency payment processing
- [Telegram Bot API](https://core.telegram.org/bots/api) for bot functionality
- [React](https://reactjs.org/) for the frontend framework
- [TailwindCSS](https://tailwindcss.com/) for styling
