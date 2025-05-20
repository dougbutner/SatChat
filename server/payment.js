import { createHash } from 'crypto';
import axios from 'axios';

class PaymentService {
  constructor() {
    // Initialize API configurations
    this.btcApiUrl = 'https://blockstream.info/api';
    this.lightningApiUrl = process.env.LIGHTNING_API_URL || 'http://localhost:8080'; // Default to local LND
    this.exsatApiUrl = process.env.EXSAT_API_URL || 'https://api.exsat.io';
  }

  async createPayment(options) {
    const {
      amount,
      description,
      network = 'btc',
      type = 'default',
      callbackUrl,
      successUrl,
      autoSettle = false
    } = options;

    try {
      switch (network.toLowerCase()) {
        case 'lightning':
          return await this.createLightningPayment(amount, description, callbackUrl, successUrl);
        case 'btc':
          return await this.createBtcPayment(amount, description, callbackUrl, successUrl);
        case 'exsat':
          return await this.createExSatPayment(amount, description, type, callbackUrl, successUrl);
        default:
          throw new Error('Unsupported payment network');
      }
    } catch (error) {
      console.error(`Error creating ${network} payment:`, error);
      throw error;
    }
  }

  async createLightningPayment(amount, description, callbackUrl, successUrl) {
    try {
      // Generate a unique payment ID
      const paymentId = `ln-${createHash('sha256').update(Date.now().toString()).digest('hex')}`;
      
      // Create Lightning invoice using LND
      const response = await axios.post(`${this.lightningApiUrl}/v1/invoices`, {
        value: amount,
        memo: description,
        expiry: 3600, // 1 hour expiry
        private: false
      });

      return {
        network: 'lightning',
        invoiceId: paymentId,
        paymentRequest: response.data.payment_request,
        amount,
        status: 'pending',
        description,
        callbackUrl,
        successUrl
      };
    } catch (error) {
      console.error('Error creating Lightning payment:', error);
      throw error;
    }
  }

  async createBtcPayment(amount, description, callbackUrl, successUrl) {
    try {
      // Generate a unique payment ID
      const paymentId = `btc-${createHash('sha256').update(Date.now().toString()).digest('hex')}`;
      
      // For Bitcoin, we'll use a static address for now
      // In production, you should use a proper Bitcoin wallet service
      const address = process.env.BTC_RECEIVE_ADDRESS;
      
      return {
        network: 'btc',
        invoiceId: paymentId,
        paymentRequest: address,
        amount,
        status: 'pending',
        description,
        callbackUrl,
        successUrl
      };
    } catch (error) {
      console.error('Error creating Bitcoin payment:', error);
      throw error;
    }
  }

  async createExSatPayment(amount, description, type, callbackUrl, successUrl) {
    try {
      // Generate a unique payment ID
      const paymentId = `exsat-${createHash('sha256').update(Date.now().toString()).digest('hex')}`;
      
      // For exSat, we'll use a static address for now
      // In production, you should use the exSat API
      const address = type === 'evm' 
        ? process.env.EXSAT_EVM_ADDRESS 
        : process.env.EXSAT_NATIVE_ADDRESS;
      
      return {
        network: 'exsat',
        type,
        invoiceId: paymentId,
        paymentRequest: address,
        amount,
        status: 'pending',
        description,
        callbackUrl,
        successUrl
      };
    } catch (error) {
      console.error('Error creating exSat payment:', error);
      throw error;
    }
  }

  async verifyPayment(invoiceId, network, type = 'default') {
    try {
      switch (network.toLowerCase()) {
        case 'lightning':
          return await this.verifyLightningPayment(invoiceId);
        case 'btc':
          return await this.verifyBtcPayment(invoiceId);
        case 'exsat':
          return await this.verifyExSatPayment(invoiceId, type);
        default:
          throw new Error('Unsupported payment network');
      }
    } catch (error) {
      console.error(`Error verifying ${network} payment:`, error);
      throw error;
    }
  }

  async verifyLightningPayment(invoiceId) {
    try {
      const response = await axios.get(`${this.lightningApiUrl}/v1/invoice/${invoiceId}`);

      return {
        status: response.data.settled ? 'paid' : 'pending',
        paid: response.data.settled,
        amount: response.data.value,
        expectedAmount: response.data.value
      };
    } catch (error) {
      console.error('Error verifying Lightning payment:', error);
      throw error;
    }
  }

  async verifyBtcPayment(invoiceId) {
    try {
      // Get payment details from database
      const [rows] = await pool.query(
        'SELECT * FROM donations WHERE invoiceId = ?',
        [invoiceId]
      );

      if (rows.length === 0) {
        throw new Error('Payment not found');
      }

      const payment = rows[0];
      const address = payment.paymentRequest;

      // Check address balance using Blockstream API
      const response = await axios.get(`${this.btcApiUrl}/address/${address}/utxo`);
      const utxos = response.data;

      // Calculate total received amount
      const totalReceived = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

      return {
        status: totalReceived >= payment.amount ? 'paid' : 'pending',
        paid: totalReceived >= payment.amount,
        amount: totalReceived,
        expectedAmount: payment.amount
      };
    } catch (error) {
      console.error('Error verifying Bitcoin payment:', error);
      throw error;
    }
  }

  async verifyExSatPayment(invoiceId, type) {
    try {
      // For now, we'll just check if the payment exists in our database
      const [rows] = await pool.query(
        'SELECT * FROM donations WHERE invoiceId = ?',
        [invoiceId]
      );

      if (rows.length === 0) {
        throw new Error('Payment not found');
      }

      const payment = rows[0];
      
      // In production, you should verify the payment on the exSat network
      return {
        status: 'pending',
        paid: false,
        amount: payment.amount,
        expectedAmount: payment.amount
      };
    } catch (error) {
      console.error('Error verifying exSat payment:', error);
      throw error;
    }
  }
}

export default new PaymentService(); 