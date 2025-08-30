import { Resend } from 'resend';

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

  private resend: Resend;

  constructor() {
    this.config = {
      serviceProvider: process.env.EMAIL_SERVICE || 'resend',
      apiKey: process.env.RESEND_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      managerEmail: process.env.MANAGER_EMAIL || 'manager@ghvac.com',
    };
    
    this.resend = new Resend(this.config.apiKey);
  }

  async sendQuoteNotification(quoteData: QuoteEmailData, recipients?: string[]): Promise<boolean> {
    try {
      const subject = `New HVAC Quote - ${quoteData.customerName} - $${quoteData.total}`;
      const htmlContent = this.generateQuoteEmailHtml(quoteData);
      const emailList = recipients || [this.config.managerEmail];
      
      if (this.config.serviceProvider === 'resend') {
        return await this.sendWithResend(subject, htmlContent, emailList);
      } else {
        // Fallback to basic email service
        return await this.sendWithGenericService(subject, htmlContent);
      }
    } catch (error) {
      console.error('Error sending quote notification:', error);
      return false;
    }
  }

  private async sendWithResend(subject: string, htmlContent: string, recipients: string[]): Promise<boolean> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.config.fromEmail,
        to: recipients,
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        console.error('Resend email error:', error);
        return false;
      }

      console.log('Email sent successfully:', data?.id);
      return true;
    } catch (error) {
      console.error('Resend email error:', error);
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
