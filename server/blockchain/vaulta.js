import dotenv from 'dotenv';
import { Api, JsonRpc } from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig.js';
import fetch from 'node-fetch';
import { TextEncoder, TextDecoder } from 'util';

// Load environment variables
dotenv.config();

// Vaulta configuration
const VAULTA_CONFIG = {
  SAT_TO_A: 0.00000001,  // 1 SAT = 0.00000001 BTC
  TOKEN_SYMBOL: 'BTC',
  TOKEN_CONTRACT: 'btc.xsat'
};

// Validate required environment variables
if (!process.env.BOT_PRIVATE_KEY) {
  throw new Error('BOT_PRIVATE_KEY is required in .env file');
}

if (!process.env.BOT_EXSAT_ADDRESS) {
  throw new Error('BOT_EXSAT_ADDRESS is required in .env file');
}

class VaultaService {
  constructor() {
    // Initialize EOS connection with fallback to Greymass API
    this.rpc = new JsonRpc(process.env.VAULTA_API_URL || 'https://vaulta.greymass.com');
    
    // Log configuration (without private key)
    console.log('Initializing Vaulta service with:');
    console.log('- API URL:', process.env.VAULTA_API_URL || 'https://vaulta.greymass.com');
    console.log('- Bot Address:', process.env.BOT_EXSAT_ADDRESS);
    console.log('- SAT Conversion:', `1 SAT = ${VAULTA_CONFIG.SAT_TO_A} ${VAULTA_CONFIG.TOKEN_SYMBOL}`);
    console.log('- Token Contract:', VAULTA_CONFIG.TOKEN_CONTRACT);
    
    this.api = new Api({
      rpc: this.rpc,
      signatureProvider: new JsSignatureProvider([process.env.BOT_PRIVATE_KEY]),
      textDecoder: new TextDecoder(),
      textEncoder: new TextEncoder()
    });

    // Verify account exists and has proper permissions
    this.verifyAccount();
  }

  // Convert SATs to A tokens
  satToA(sats) {
    return sats * VAULTA_CONFIG.SAT_TO_A;
  }

  // Convert A tokens to SATs
  aToSat(aAmount) {
    return Math.floor(aAmount / VAULTA_CONFIG.SAT_TO_A);
  }

  async verifyAccount() {
    try {
      // Check if account exists
      const accountInfo = await this.rpc.get_account(process.env.BOT_EXSAT_ADDRESS);
      console.log('Account verified:', process.env.BOT_EXSAT_ADDRESS);
      console.log('Permissions:', accountInfo.permissions.map(p => p.perm_name).join(', '));
      
      // Check if account has token contract
      const balance = await this.getBalance(process.env.BOT_EXSAT_ADDRESS);
      console.log('Current balance:', balance, VAULTA_CONFIG.TOKEN_SYMBOL);
      console.log('Current balance in SATs:', this.aToSat(balance), 'SATs');
    } catch (error) {
      console.error('Account verification failed:', error.message);
      if (error.message.includes('unknown key')) {
        console.error('The account does not exist or the private key does not match the account permissions');
      }
      throw error;
    }
  }

  async verifyPayment(invoiceId, expectedAmount, fromAddress) {
    try {
      // Get transaction history for the bot's address
      const history = await this.rpc.get_actions(process.env.BOT_EXSAT_ADDRESS, {
        pos: -1,
        offset: -100 // Check last 100 transactions
      });

      // Convert expected SAT amount to A
      const expectedA = this.satToA(expectedAmount);

      // Look for matching transaction
      for (const action of history.actions) {
        if (action.act.name === 'transfer' && 
            action.act.data.memo === invoiceId &&
            action.act.data.from === fromAddress &&
            parseFloat(action.act.data.quantity) === expectedA) {
          return {
            status: 'paid',
            paid: true,
            amount: expectedAmount,
            expectedAmount: expectedAmount,
            txId: action.trx_id
          };
        }
      }

      return {
        status: 'pending',
        paid: false,
        amount: 0,
        expectedAmount: expectedAmount
      };
    } catch (error) {
      console.error('Error verifying Vaulta payment:', error);
      throw error;
    }
  }

  async getBalance(address) {
    try {
      const result = await this.rpc.get_currency_balance(VAULTA_CONFIG.TOKEN_CONTRACT, address, VAULTA_CONFIG.TOKEN_SYMBOL);
      return parseFloat(result[0] || '0');
    } catch (error) {
      console.error('Error getting Vaulta balance:', error);
      return 0;
    }
  }

  async sendPayment(toAddress, sats, memo) {
    try {
      // Convert SATs to A
      const aAmount = this.satToA(sats);
      
      console.log('Sending payment:', {
        from: process.env.BOT_EXSAT_ADDRESS,
        to: toAddress,
        sats,
        aAmount: `${aAmount.toFixed(8)} ${VAULTA_CONFIG.TOKEN_SYMBOL}`,
        memo
      });

      // Format the transaction data according to EOSIO standard
      const transaction = {
        actions: [{
          account: VAULTA_CONFIG.TOKEN_CONTRACT,
          name: 'transfer',
          authorization: [{
            actor: process.env.BOT_EXSAT_ADDRESS,
            permission: 'active'
          }],
          data: {
            from: process.env.BOT_EXSAT_ADDRESS,
            to: toAddress,
            quantity: `${aAmount.toFixed(8)} ${VAULTA_CONFIG.TOKEN_SYMBOL}`,
            memo: memo
          }
        }]
      };

      console.log('Transaction data:', JSON.stringify(transaction, null, 2));

      const result = await this.api.transact(transaction, {
        blocksBehind: 3,
        expireSeconds: 30
      });

      console.log('Payment successful:', result.transaction_id);
      return {
        success: true,
        txId: result.transaction_id
      };
    } catch (error) {
      console.error('Error sending Vaulta payment:', error);
      if (error.message.includes('no balance object found')) {
        console.error('The account does not have any A tokens. Please ensure:');
        console.error('1. The account has been created on the Vaulta blockchain');
        console.error('2. The account has received A tokens');
        console.error('3. The account has sufficient balance for the transfer');
      } else if (error.message.includes('unable to find key')) {
        console.error('The account does not have the proper permissions set up');
        console.error('Please ensure:');
        console.error('1. The account exists on the Vaulta blockchain');
        console.error('2. The private key matches the account\'s active permission');
        console.error('3. The account has sufficient balance');
      }
      throw error;
    }
  }
}

export default new VaultaService(); 