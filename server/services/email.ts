interface EmailConfig {
  serviceProvider: string;
  apiKey: string;
  fromEmail: string;
  managerEmail: string;
}

interface QuoteEmailData {
  customerName: string;
  technician: string;
  total: string;
  quoteText: string;
  quoteId: string;
}

export class EmailService {
  private config: EmailConfig;

  constructor() {
    this.config = {
      serviceProvider: process.env.EMAIL_SERVICE || 'sendgrid',
      apiKey: process.env.EMAIL_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'quotes@ghvac.com',
      managerEmail: process.env.MANAGER_EMAIL || 'manager@ghvac.com',
    };
  }

  async sendQuoteNotification(quoteData: QuoteEmailData): Promise<boolean> {
    try {
      const subject = `New HVAC Quote - ${quoteData.customerName} - $${quoteData.total}`;
      const htmlContent = this.generateQuoteEmailHtml(quoteData);
      
      if (this.config.serviceProvider === 'sendgrid') {
        return await this.sendWithSendGrid(subject, htmlContent);
      } else {
        // Fallback to basic email service
        return await this.sendWithGenericService(subject, htmlContent);
      }
    } catch (error) {
      console.error('Error sending quote notification:', error);
      return false;
    }
  }

  private async sendWithSendGrid(subject: string, htmlContent: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: this.config.managerEmail }],
            subject: subject,
          }],
          from: { email: this.config.fromEmail },
          content: [{
            type: 'text/html',
            value: htmlContent,
          }],
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('SendGrid email error:', error);
      return false;
    }
  }

  private async sendWithGenericService(subject: string, htmlContent: string): Promise<boolean> {
    // Placeholder for other email services
    console.log('Email would be sent:', { subject, to: this.config.managerEmail });
    return true;
  }

  private generateQuoteEmailHtml(quoteData: QuoteEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New HVAC Quote</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #711419; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .quote-details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .quote-text { background-color: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 5px; font-family: monospace; white-space: pre-line; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>New HVAC Quote Generated</h1>
        </div>
        <div class="content">
          <h2>Quote Details</h2>
          <div class="quote-details">
            <p><strong>Customer:</strong> ${quoteData.customerName}</p>
            <p><strong>Technician:</strong> ${quoteData.technician}</p>
            <p><strong>Total Amount:</strong> $${quoteData.total}</p>
            <p><strong>Quote ID:</strong> ${quoteData.quoteId}</p>
          </div>
          
          <h3>Full Quote Text</h3>
          <div class="quote-text">${quoteData.quoteText}</div>
          
          <p>This quote has been automatically generated through the GHVAC field quote system.</p>
        </div>
        <div class="footer">
          <p>Giesbrecht HVAC - Professional Service Solutions</p>
        </div>
      </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
