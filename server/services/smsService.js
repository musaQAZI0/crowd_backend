const twilio = require('twilio');

class SMSService {
  constructor() {
    this.client = null;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    this.initializeTwilio();
  }

  initializeTwilio() {
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('Twilio SMS service initialized successfully');
      } else {
        console.warn('Twilio credentials not found, SMS service will be simulated');
      }
    } catch (error) {
      console.error('Failed to initialize Twilio SMS service:', error);
    }
  }

  async sendSMS(options) {
    try {
      const { to, message, from } = options;

      if (!to || !message) {
        throw new Error('Phone number and message are required');
      }

      // Validate phone number format
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(to)) {
        throw new Error('Invalid phone number format. Use E.164 format (+1234567890)');
      }

      // Check message length (SMS limit is 160 characters)
      if (message.length > 160) {
        console.warn('Message exceeds 160 characters and will be sent as multiple SMS');
      }

      const fromNumber = from || this.fromNumber;

      if (!this.client) {
        // Simulate SMS sending for development
        console.log('SIMULATED SMS:', {
          to,
          from: fromNumber,
          message
        });
        return {
          sid: 'sim_' + Date.now(),
          status: 'sent',
          to,
          from: fromNumber,
          body: message,
          dateCreated: new Date()
        };
      }

      const result = await this.client.messages.create({
        body: message,
        from: fromNumber,
        to: to
      });

      console.log(`SMS sent successfully to ${to}, SID: ${result.sid}`);
      return result;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      throw error;
    }
  }

  async sendBulkSMS(messages, options = {}) {
    try {
      const { batchSize = 50, delay = 1000 } = options;
      const results = [];

      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const batchPromises = batch.map(msg => this.sendSMS(msg));

        try {
          const batchResults = await Promise.allSettled(batchPromises);
          results.push(...batchResults);

          // Add delay between batches to respect rate limits
          if (i + batchSize < messages.length && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(`Error in SMS batch ${i / batchSize + 1}:`, error);
        }
      }

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Bulk SMS completed: ${successful} successful, ${failed} failed`);

      return {
        total: results.length,
        successful,
        failed,
        results
      };
    } catch (error) {
      console.error('Bulk SMS error:', error);
      throw error;
    }
  }

  // SMS Templates
  getThankYouSMS(data) {
    const { userName, eventName } = data;
    return {
      message: `Hi ${userName}! Thanks for attending ${eventName}. We hope you had an amazing time! 🎉 Stay tuned for more events.`
    };
  }

  getSurveySMS(data) {
    const { userName, eventName, surveyLink } = data;
    return {
      message: `Hi ${userName}! How was ${eventName}? Share your feedback: ${surveyLink} It takes just 2 minutes. Thanks! 📝`
    };
  }

  getReviewRequestSMS(data) {
    const { userName, eventName, reviewLink } = data;
    return {
      message: `Hi ${userName}! Loved ${eventName}? Please leave us a quick review: ${reviewLink} It helps others find great events! ⭐`
    };
  }

  getReminderSMS(data) {
    const { userName, eventName, eventDate, eventTime } = data;
    return {
      message: `Hi ${userName}! Reminder: ${eventName} is tomorrow at ${eventTime} on ${eventDate}. See you there! 🎫`
    };
  }

  getEventUpdateSMS(data) {
    const { userName, eventName, updateMessage } = data;
    return {
      message: `Hi ${userName}! Update for ${eventName}: ${updateMessage} Check your email for more details.`
    };
  }

  async sendThankYouSMS(recipientData) {
    const template = this.getThankYouSMS(recipientData);
    return await this.sendSMS({
      to: recipientData.phone,
      message: template.message
    });
  }

  async sendSurveySMS(recipientData) {
    const template = this.getSurveySMS(recipientData);
    return await this.sendSMS({
      to: recipientData.phone,
      message: template.message
    });
  }

  async sendReviewRequestSMS(recipientData) {
    const template = this.getReviewRequestSMS(recipientData);
    return await this.sendSMS({
      to: recipientData.phone,
      message: template.message
    });
  }

  async sendReminderSMS(recipientData) {
    const template = this.getReminderSMS(recipientData);
    return await this.sendSMS({
      to: recipientData.phone,
      message: template.message
    });
  }

  async sendEventUpdateSMS(recipientData) {
    const template = this.getEventUpdateSMS(recipientData);
    return await this.sendSMS({
      to: recipientData.phone,
      message: template.message
    });
  }

  // Utility methods
  validatePhoneNumber(phoneNumber) {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  formatPhoneNumber(phoneNumber, countryCode = '+1') {
    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if not present
    if (!phoneNumber.startsWith('+')) {
      if (cleaned.length === 10) {
        cleaned = countryCode.replace('+', '') + cleaned;
      }
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  async getDeliveryStatus(messageSid) {
    try {
      if (!this.client) {
        return {
          sid: messageSid,
          status: 'delivered', // Simulated status
          dateUpdated: new Date()
        };
      }

      const message = await this.client.messages(messageSid).fetch();
      return {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateUpdated: message.dateUpdated
      };
    } catch (error) {
      console.error('Error fetching SMS status:', error);
      throw error;
    }
  }

  async getAccountInfo() {
    try {
      if (!this.client) {
        return {
          balance: 'N/A (Simulated)',
          currency: 'USD',
          status: 'Simulated'
        };
      }

      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      const balance = await this.client.balance.fetch();

      return {
        friendlyName: account.friendlyName,
        status: account.status,
        balance: balance.balance,
        currency: balance.currency
      };
    } catch (error) {
      console.error('Error fetching account info:', error);
      throw error;
    }
  }
}

module.exports = new SMSService();