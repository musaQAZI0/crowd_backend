const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    this.transporter = null;
    this.provider = process.env.EMAIL_PROVIDER || 'smtp';
    this.initializeProvider();
  }

  initializeProvider() {
    try {
      switch (this.provider) {
        case 'sendgrid':
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          break;
        case 'smtp':
        default:
          this.transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          });
          break;
      }
      console.log(`Email service initialized with provider: ${this.provider}`);
    } catch (error) {
      console.error('Failed to initialize email service:', error);
    }
  }

  async sendEmail(options) {
    try {
      const { to, subject, html, text, from, templateId, templateData } = options;

      if (!to || !subject || (!html && !text && !templateId)) {
        throw new Error('Missing required email parameters');
      }

      const fromAddress = from || process.env.DEFAULT_FROM_EMAIL || 'noreply@crowd-events.com';

      let result;

      switch (this.provider) {
        case 'sendgrid':
          result = await this.sendWithSendGrid({
            to,
            from: fromAddress,
            subject,
            html,
            text,
            templateId,
            templateData
          });
          break;

        case 'smtp':
        default:
          result = await this.sendWithSMTP({
            to,
            from: fromAddress,
            subject,
            html,
            text
          });
          break;
      }

      console.log(`Email sent successfully to ${to}`);
      return result;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  async sendWithSendGrid(emailData) {
    try {
      if (emailData.templateId) {
        // Send with template
        const msg = {
          to: emailData.to,
          from: emailData.from,
          templateId: emailData.templateId,
          dynamicTemplateData: emailData.templateData || {}
        };
        return await sgMail.send(msg);
      } else {
        // Send regular email
        const msg = {
          to: emailData.to,
          from: emailData.from,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text
        };
        return await sgMail.send(msg);
      }
    } catch (error) {
      console.error('SendGrid error:', error);
      throw error;
    }
  }

  async sendWithSMTP(emailData) {
    try {
      if (!this.transporter) {
        throw new Error('SMTP transporter not initialized');
      }

      const mailOptions = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text
      };

      return await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('SMTP error:', error);
      throw error;
    }
  }

  async sendBulkEmails(emails, options = {}) {
    try {
      const { batchSize = 100, delay = 1000 } = options;
      const results = [];

      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        const batchPromises = batch.map(email => this.sendEmail(email));

        try {
          const batchResults = await Promise.allSettled(batchPromises);
          results.push(...batchResults);

          // Add delay between batches to respect rate limits
          if (i + batchSize < emails.length && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(`Error in batch ${i / batchSize + 1}:`, error);
        }
      }

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Bulk email completed: ${successful} successful, ${failed} failed`);

      return {
        total: results.length,
        successful,
        failed,
        results
      };
    } catch (error) {
      console.error('Bulk email error:', error);
      throw error;
    }
  }

  // Email templates
  getThankYouTemplate(data) {
    const { userName, eventName, eventDate, organizerName } = data;

    return {
      subject: `Thank you for attending ${eventName}!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Thank You</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4A90E2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; color: #666; }
            .button { display: inline-block; padding: 12px 24px; background: #4A90E2; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Thank You, ${userName}!</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>Thank you for attending <strong>${eventName}</strong> on ${eventDate}. Your presence made the event special!</p>
              <p>We hope you had an amazing experience and would love to hear your feedback.</p>
              <p style="text-align: center;">
                <a href="#" class="button">Leave a Review</a>
              </p>
              <p>Stay tuned for more exciting events!</p>
              <p>Best regards,<br>${organizerName}</p>
            </div>
            <div class="footer">
              <p>Powered by CROWD - Create memorable experiences</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Thank you for attending ${eventName}!

        Hi ${userName},

        Thank you for attending ${eventName} on ${eventDate}. Your presence made the event special!

        We hope you had an amazing experience and would love to hear your feedback.

        Stay tuned for more exciting events!

        Best regards,
        ${organizerName}

        Powered by CROWD - Create memorable experiences
      `
    };
  }

  getSurveyTemplate(data) {
    const { userName, eventName, surveyLink, organizerName } = data;

    return {
      subject: `We'd love your feedback on ${eventName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Event Feedback</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #7ED321; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; color: #666; }
            .button { display: inline-block; padding: 12px 24px; background: #7ED321; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Feedback Matters</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>We hope you enjoyed <strong>${eventName}</strong>! Your feedback is valuable to us and helps us create even better events.</p>
              <p>Could you take 2 minutes to share your experience?</p>
              <p style="text-align: center;">
                <a href="${surveyLink}" class="button">Take Survey</a>
              </p>
              <p>Thank you for helping us improve!</p>
              <p>Best regards,<br>${organizerName}</p>
            </div>
            <div class="footer">
              <p>Powered by CROWD - Create memorable experiences</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Your Feedback Matters

        Hi ${userName},

        We hope you enjoyed ${eventName}! Your feedback is valuable to us and helps us create even better events.

        Could you take 2 minutes to share your experience?

        Survey Link: ${surveyLink}

        Thank you for helping us improve!

        Best regards,
        ${organizerName}

        Powered by CROWD - Create memorable experiences
      `
    };
  }

  getReviewRequestTemplate(data) {
    const { userName, eventName, reviewLinks, organizerName } = data;

    return {
      subject: `Please review ${eventName} - Your opinion matters!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Review Request</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F5A623; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; color: #666; }
            .button { display: inline-block; padding: 12px 24px; background: #F5A623; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
            .buttons { text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Share Your Experience</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>We hope you had a fantastic time at <strong>${eventName}</strong>!</p>
              <p>Would you mind leaving us a quick review? It really helps other people discover great events like this one.</p>
              <div class="buttons">
                ${reviewLinks.google ? `<a href="${reviewLinks.google}" class="button">Review on Google</a>` : ''}
                ${reviewLinks.facebook ? `<a href="${reviewLinks.facebook}" class="button">Review on Facebook</a>` : ''}
                ${reviewLinks.crowd ? `<a href="${reviewLinks.crowd}" class="button">Review on CROWD</a>` : ''}
              </div>
              <p>Thank you for helping us spread the word!</p>
              <p>Best regards,<br>${organizerName}</p>
            </div>
            <div class="footer">
              <p>Powered by CROWD - Create memorable experiences</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Share Your Experience

        Hi ${userName},

        We hope you had a fantastic time at ${eventName}!

        Would you mind leaving us a quick review? It really helps other people discover great events like this one.

        ${reviewLinks.google ? `Google Review: ${reviewLinks.google}` : ''}
        ${reviewLinks.facebook ? `Facebook Review: ${reviewLinks.facebook}` : ''}
        ${reviewLinks.crowd ? `CROWD Review: ${reviewLinks.crowd}` : ''}

        Thank you for helping us spread the word!

        Best regards,
        ${organizerName}

        Powered by CROWD - Create memorable experiences
      `
    };
  }

  async sendThankYouEmail(recipientData) {
    const template = this.getThankYouTemplate(recipientData);
    return await this.sendEmail({
      to: recipientData.email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  async sendSurveyEmail(recipientData) {
    const template = this.getSurveyTemplate(recipientData);
    return await this.sendEmail({
      to: recipientData.email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  async sendReviewRequestEmail(recipientData) {
    const template = this.getReviewRequestTemplate(recipientData);
    return await this.sendEmail({
      to: recipientData.email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }
}

module.exports = new EmailService();