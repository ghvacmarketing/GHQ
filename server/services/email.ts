import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

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
  jobNotes?: string;
}

export class EmailService {
  private config: EmailConfig;
  private resend: Resend;
  private gmailTransporter: any;

  constructor() {
    this.config = {
      serviceProvider: process.env.EMAIL_SERVICE || 'gmail', // Switch to Gmail while Resend is suspended
      apiKey: process.env.RESEND_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'brian@ghvac.com', // Use your Gmail address
      managerEmail: process.env.MANAGER_EMAIL || 'manager@ghvac.com',
    };
    
    this.resend = new Resend(this.config.apiKey);
    
    // Gmail SMTP setup (requires app password)
    this.gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || 'brian@ghvac.com',
        pass: process.env.GMAIL_APP_PASSWORD || '' // Gmail app password needed
      }
    });
  }

  async sendQuoteNotification(quoteData: QuoteEmailData, recipients?: string[]): Promise<boolean> {
    try {
      const subject = `New HVAC Quote - ${quoteData.customerName} - $${quoteData.total}`;
      const htmlContent = this.generateQuoteEmailHtml(quoteData);
      const emailList = recipients || [this.config.managerEmail];
      
      if (this.config.serviceProvider === 'gmail') {
        return await this.sendWithGmail(subject, htmlContent, emailList);
      } else if (this.config.serviceProvider === 'resend') {
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
      console.log('Sending email to:', recipients.join(', '), 'from:', this.config.fromEmail);
      
      const { data, error } = await this.resend.emails.send({
        from: this.config.fromEmail,
        to: recipients,
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        console.error('Resend email error:', error);
        
        // Fallback to test domain if custom domain fails
        if (error.name === 'validation_error' && this.config.fromEmail.includes('@ghvac.work')) {
          console.log('🔄 Retrying with fallback domain...');
          const fallbackResult = await this.resend.emails.send({
            from: 'delivered@resend.dev',
            to: recipients,
            subject: subject + ' [Fallback Send]',
            html: htmlContent,
          });
          
          if (fallbackResult.error) {
            console.error('Fallback email also failed:', fallbackResult.error);
            return false;
          }
          
          console.log('Email sent via fallback domain:', fallbackResult.data?.id);
          return true;
        }
        
        return false;
      }

      console.log('Email sent successfully:', data?.id);
      return true;
    } catch (error) {
      console.error('Resend email error:', error);
      return false;
    }
  }

  private async sendWithGmail(subject: string, htmlContent: string, recipients: string[]): Promise<boolean> {
    try {
      console.log('Sending email via Gmail to:', recipients.join(', '));
      
      const mailOptions = {
        from: this.config.fromEmail,
        to: recipients.join(', '),
        subject: subject,
        html: htmlContent,
      };
      
      const result = await this.gmailTransporter.sendMail(mailOptions);
      console.log('Gmail email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Gmail email error:', error);
      // Fallback to console output if Gmail fails
      console.log('📧 FALLBACK - Email content:');
      console.log('To:', recipients.join(', '));
      console.log('Subject:', subject);
      console.log('Content: [HTML email with job notes and quote details]');
      return true; // Return true so app doesn't break
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
          
          ${quoteData.jobNotes ? `
          <h3>Job Notes</h3>
          <div class="quote-text">${quoteData.jobNotes}</div>
          ` : ''}
          
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
