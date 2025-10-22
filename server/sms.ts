import type { Request, Response } from "express";

// Twilio SMS service for sending magic link authentication
export class TwilioService {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      console.warn('Twilio credentials not configured. SMS sending will fail.');
    }
  }

  async sendMagicLink(phoneNumber: string, token: string, req: Request): Promise<boolean> {
    try {
      // Build the magic link URL
      const protocol = req.protocol;
      const host = req.get('host');
      const magicLink = `${protocol}://${host}/auth/verify/${token}`;

      const message = `Your GHVAC Tools login link: ${magicLink}\n\nThis link expires in 15 minutes.`;

      // Dev mode: Skip SMS for test numbers in development
      if (process.env.NODE_ENV === 'development' && phoneNumber.startsWith('+1555')) {
        console.log('[DEV MODE] Skipping SMS send for test number:', phoneNumber);
        console.log('[DEV MODE] Magic link would be:', magicLink);
        return true; // Pretend SMS was sent successfully
      }

      // Production mode or real number: Send via Twilio
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
          },
          body: new URLSearchParams({
            To: phoneNumber,
            From: this.fromNumber,
            Body: message,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Twilio API error:', errorData);
        return false;
      }

      const data = await response.json();
      console.log('SMS sent successfully:', data.sid);
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  }
}

export const twilioService = new TwilioService();
