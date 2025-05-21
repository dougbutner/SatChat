import { log } from 'console';
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
  TOKEN_CONTRACT: 'btc.xsat',
  RPC_API_URL: process.env.VAULTA_API_URL || 'https://vaulta.greymass.com',
  HISTORY_API_URL: 'https://vaulta.greymass.com/v1/history'
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
    try {
      // Initialize RPC API connection
      this.rpc = new JsonRpc(VAULTA_CONFIG.RPC_API_URL, { fetch });
      
      // Initialize API with private key for signing transactions
      this.api = new Api({
        rpc: this.rpc,
        signatureProvider: new JsSignatureProvider([process.env.BOT_PRIVATE_KEY]),
        textDecoder: new TextDecoder(),
        textEncoder: new TextEncoder()
      });
      
      // Log configuration (without private key)
      console.log('Initializing Vaulta service with:');
      console.log('- RPC API URL:', VAULTA_CONFIG.RPC_API_URL);
      console.log('- History API URL:', VAULTA_CONFIG.HISTORY_API_URL);
      console.log('- Bot Address:', process.env.BOT_EXSAT_ADDRESS);
      console.log('- SAT Conversion:', `1 SAT = ${VAULTA_CONFIG.SAT_TO_A} ${VAULTA_CONFIG.TOKEN_SYMBOL}`);
      console.log('- Token Contract:', VAULTA_CONFIG.TOKEN_CONTRACT);
      
      // Verify account exists and has proper permissions
      this.verifyAccount();
    } catch (error) {
      console.error('Failed to initialize Vaulta service:', error);
      throw error;
    }
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
      console.log('Verifying Vaulta account configuration...');
      
      // First test API connection
      const info = await this.rpc.get_info();
      console.log('Successfully connected to Vaulta blockchain');
      console.log(`Chain ID: ${info.chain_id}`);
      console.log(`Head Block: ${info.head_block_num}`);
      
      // Check if account exists
      const accountInfo = await this.rpc.get_account(process.env.BOT_EXSAT_ADDRESS);
      console.log('Account verified:', process.env.BOT_EXSAT_ADDRESS);
      console.log('Created:', accountInfo.created);
      console.log('Permissions:', accountInfo.permissions.map(p => p.perm_name).join(', '));
      
      // Check if account has the token
      const balance = await this.getBalance(process.env.BOT_EXSAT_ADDRESS);
      console.log('Current balance:', balance, VAULTA_CONFIG.TOKEN_SYMBOL);
      console.log('Current balance in SATs:', this.aToSat(balance), 'SATs');
      
      // Verify history API is working
      try {
        const historyResponse = await fetch(`${VAULTA_CONFIG.HISTORY_API_URL}/get_actions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            account_name: process.env.BOT_EXSAT_ADDRESS,
            pos: -1,
            offset: -1
          })
        });
        
        if (historyResponse.ok) {
          console.log('Successfully connected to Vaulta History API');
        } else {
          console.warn(`History API returned status ${historyResponse.status}: ${historyResponse.statusText}`);
        }
      } catch (historyError) {
        console.warn('Warning: Could not connect to History API:', historyError.message);
        console.warn('Payment verification may not work properly');
      }
      
      console.log('Account verification completed successfully');
      return true;
    } catch (error) {
      console.error('Account verification failed:', error.message);
      if (error.message.includes('unknown key')) {
        console.error('The account does not exist on the Vaulta blockchain');
      } else if (error.message.includes('Failed to fetch')) {
        console.error('Could not connect to Vaulta blockchain API');
        console.error('Please check your internet connection and API endpoint configuration');
      }
      throw error;
    }
  }

  async verifyPayment(invoiceId, expectedAmount, fromAddress) {
    try {
      console.log(`Verifying payment: invoiceId=${invoiceId}, expectedAmount=${expectedAmount}, fromAddress=${fromAddress}`);
      
      // Convert expected SAT amount to A
      const expectedA = this.satToA(expectedAmount);
      console.log(`Expected amount in A tokens: ${expectedA} ${VAULTA_CONFIG.TOKEN_SYMBOL}`);
      
      // Format the expected quantity with 8 decimal places
      const expectedQuantity = `${expectedA.toFixed(8)} ${VAULTA_CONFIG.TOKEN_SYMBOL}`;
      console.log(`Looking for transfer with quantity: ${expectedQuantity}`);

      // Use the v1 history compatible endpoint provided by Greymass Roborovski
      const response = await fetch(`${VAULTA_CONFIG.HISTORY_API_URL}/get_actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_name: process.env.BOT_EXSAT_ADDRESS,
          pos: -1,
          offset: -100, // Check last 100 actions
          filter: `${VAULTA_CONFIG.TOKEN_CONTRACT}:transfer` // Only get transfer actions from the token contract
        })
      });

      if (!response.ok) {
        console.error(`History API error: ${response.status} ${response.statusText}`);
        throw new Error(`History API error: ${response.status} ${response.statusText}`);
      }

      const historyData = await response.json();
      console.log(`Retrieved ${historyData.actions?.length || 0} actions from history API`);

      // Look for matching transaction in the actions
      if (historyData.actions && historyData.actions.length > 0) {
        for (const action of historyData.actions) {
          console.log(`Checking action: ${JSON.stringify(action.act.data)}`);
          
          // Check if this is a transfer to our bot address with the correct memo and amount
          if (action.act.name === 'transfer' && 
              action.act.account === VAULTA_CONFIG.TOKEN_CONTRACT &&
              action.act.data.to === process.env.BOT_EXSAT_ADDRESS && 
              action.act.data.from === fromAddress &&
              action.act.data.memo === invoiceId) {
                
            // Parse the quantity (format: "0.00000001 BTC")
            const quantityParts = action.act.data.quantity.split(' ');
            const receivedAmount = parseFloat(quantityParts[0]);
            
            console.log(`Found matching transaction: amount=${receivedAmount}, expected=${expectedA}`);
            
            // Check if the amount matches (allowing for small precision differences)
            if (Math.abs(receivedAmount - expectedA) < 0.00000001) {
              return {
                status: 'paid',
                paid: true,
                amount: expectedAmount,
                expectedAmount: expectedAmount,
                txId: action.trx_id,
                blockNum: action.block_num,
                timestamp: action.block_time
              };
            } else {
              console.log(`Amount mismatch: received=${receivedAmount}, expected=${expectedA}`);
            }
          }
        }
      } else {
        console.log('No relevant actions found in history');
      }

      // If we get here, no matching payment was found
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
      console.log(`Getting balance for ${address}...`);
      
      const result = await this.rpc.get_currency_balance(
        VAULTA_CONFIG.TOKEN_CONTRACT, 
        address, 
        VAULTA_CONFIG.TOKEN_SYMBOL
      );
      
      // Format result: ["0.00000100 BTC"] -> 0.00000100
      let balance = 0;
      if (result && result.length > 0) {
        const balanceStr = result[0];
        const parts = balanceStr.split(' ');
        balance = parseFloat(parts[0]);
      }
      
      console.log(`Balance for ${address}: ${balance} ${VAULTA_CONFIG.TOKEN_SYMBOL}`);
      return balance;
    } catch (error) {
      console.error(`Error getting balance for ${address}:`, error.message);
      
      // Return 0 for specific error cases
      if (error.message.includes('unknown key') || 
          error.message.includes('no balance object found')) {
        console.log(`No balance found for ${address}, returning 0`);
        return 0;
      }
      
      // Rethrow other errors
      throw error;
    }
  }

  async sendPayment(toAddress, sats, memo) {
    try {
      // Convert SATs to A
      const aAmount = this.satToA(sats);
      
      // Format the quantity with 8 decimal places
      const quantity = `${aAmount.toFixed(8)} ${VAULTA_CONFIG.TOKEN_SYMBOL}`;
      
      console.log('Preparing payment transaction:', {
        from: process.env.BOT_EXSAT_ADDRESS,
        to: toAddress,
        sats,
        quantity,
        memo
      });

      // Verify we have sufficient balance
      const currentBalance = await this.getBalance(process.env.BOT_EXSAT_ADDRESS);
      if (currentBalance < aAmount) {
        throw new Error(`Insufficient balance: ${currentBalance} ${VAULTA_CONFIG.TOKEN_SYMBOL} available, ${quantity} required`);
      }

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
            quantity,
            memo: memo || ''
          }
        }]
      };

      console.log('Sending transaction...');
      
      // Execute the transaction
      const result = await this.api.transact(transaction, {
        blocksBehind: 3,
        expireSeconds: 30
      });

      console.log('Payment successful:', result.transaction_id);
      console.log('Transaction details:', {
        blockNum: result.processed?.block_num,
        blockTime: result.processed?.block_time,
        fee: result.processed?.receipt?.fee || '0'
      });
      
      return {
        success: true,
        txId: result.transaction_id,
        blockNum: result.processed?.block_num,
        blockTime: result.processed?.block_time
      };
    } catch (error) {
      console.error('Error sending Vaulta payment:', error);
      
      let errorMessage = 'Unknown error occurred';
      
      if (error.json) {
        try {
          // Extract the detailed error message from EOSIO error format
          const errorDetails = JSON.parse(error.json.error);
          errorMessage = errorDetails.details[0]?.message || error.message;
          console.error('Detailed error:', errorDetails);
        } catch (parseError) {
          errorMessage = error.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      if (errorMessage.includes('no balance object found')) {
        console.error('The account does not have any tokens. Please ensure:');
        console.error('1. The account has been created on the Vaulta blockchain');
        console.error('2. The account has received tokens');
        console.error('3. The account has sufficient balance for the transfer');
      } else if (errorMessage.includes('unable to find key')) {
        console.error('The account does not have the proper permissions set up');
        console.error('Please ensure:');
        console.error('1. The account exists on the Vaulta blockchain');
        console.error('2. The private key matches the account\'s active permission');
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}

export default new VaultaService(); 