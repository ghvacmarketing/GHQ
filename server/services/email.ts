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
  jobNotes?: string;
  parts: Array<{
    id: string;
    partNumber: string;
    description: string;
    price: string;
    quantity?: number;
  }>;
  subtotal: string;
  labor: string;
  tax: string;
  status?: string;
  createdAt?: string;
}

export class EmailService {
  private config: EmailConfig;

  private resend: Resend;

  constructor() {
    this.config = {
      serviceProvider: process.env.EMAIL_SERVICE || 'resend',
      apiKey: process.env.RESEND_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'quotes@ghvac.work', // Using verified domain for external delivery
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

  private async sendWithGenericService(subject: string, htmlContent: string): Promise<boolean> {
    // Placeholder for other email services
    console.log('Email would be sent:', { subject, to: this.config.managerEmail });
    return true;
  }

  private generateQuoteEmailHtml(quoteData: QuoteEmailData): string {
    const formattedDate = quoteData.createdAt ? 
      new Date(quoteData.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      }) : new Date().toLocaleDateString();
    
    const partsRows = quoteData.parts.map(part => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-family: Arial, sans-serif;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${part.description}</div>
          <div style="font-size: 13px; color: #6b7280;">Part #: ${part.partNumber}</div>
        </td>
        <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-family: Arial, sans-serif;">${part.quantity || 1}</td>
        <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600; font-family: Arial, sans-serif;">$${part.price}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New HVAC Quote - ${quoteData.customerName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        
        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              
              <!-- Email Content -->
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 600px;">
                
                <!-- Header -->
                <tr>
                  <td style="background: #711419; padding: 30px; text-align: center; color: white;">
                    <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600; font-family: Arial, sans-serif;">New HVAC Quote</h1>
                    <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px; font-family: Arial, sans-serif;">Generated by ${quoteData.technician}</p>
                  </td>
                </tr>
                
                <!-- Customer & Total Header -->
                <tr>
                  <td style="padding: 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: top;">
                          <h2 style="margin: 0 0 8px 0; font-size: 22px; color: #1f2937; font-weight: 600; font-family: Arial, sans-serif;">${quoteData.customerName}</h2>
                          <span style="background: #f3f4f6; color: #6b7280; padding: 6px 12px; border-radius: 4px; font-size: 12px; text-transform: capitalize; font-family: Arial, sans-serif;">${quoteData.status || 'draft'}</span>
                        </td>
                        <td style="text-align: right; vertical-align: top;">
                          <div style="font-size: 32px; font-weight: 700; color: #991b1b; font-family: Arial, sans-serif;">$${quoteData.total}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Meta Information -->
                <tr>
                  <td style="padding: 0 24px 24px 24px;">
                    <div style="border-bottom: 2px solid #f3f4f6; padding-bottom: 16px;">
                      <table cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="color: #6b7280; font-size: 14px; padding-right: 15px; font-family: Arial, sans-serif;">👤 ${quoteData.technician}</td>
                          <td style="color: #6b7280; font-size: 14px; padding-right: 15px; font-family: Arial, sans-serif;">📅 ${formattedDate}</td>
                          <td style="color: #6b7280; font-size: 14px; font-family: Arial, sans-serif;">📦 ${quoteData.parts.length} part${quoteData.parts.length !== 1 ? 's' : ''}</td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
                
                ${quoteData.jobNotes ? `
                <!-- Job Notes -->
                <tr>
                  <td style="padding: 0 24px 24px 24px;">
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 4px 4px 0;">
                      <strong style="color: #92400e; font-family: Arial, sans-serif;">Job Notes:</strong><br>
                      <span style="color: #78350f; font-family: Arial, sans-serif; line-height: 1.5;">${quoteData.jobNotes}</span>
                    </div>
                  </td>
                </tr>
                ` : ''}
                
                <!-- Parts & Services -->
                <tr>
                  <td style="padding: 0 24px 24px 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937; font-weight: 600; font-family: Arial, sans-serif;">Parts & Services</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 6px; overflow: hidden;">
                      <tr style="background: #f3f4f6;">
                        <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-family: Arial, sans-serif;">Description</th>
                        <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; font-family: Arial, sans-serif;">Qty</th>
                        <th style="padding: 12px; text-align: right; font-weight: 600; color: #374151; font-family: Arial, sans-serif;">Price</th>
                      </tr>
                      ${partsRows || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #6b7280; font-style: italic; font-family: Arial, sans-serif;">No parts listed</td></tr>'}
                    </table>
                  </td>
                </tr>
                
                <!-- Quote Summary -->
                <tr>
                  <td style="padding: 0 24px 24px 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937; font-weight: 600; font-family: Arial, sans-serif;">Quote Summary</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 6px; padding: 16px;">
                      <tr>
                        <td style="padding: 8px 0; color: #374151; font-family: Arial, sans-serif;">Parts Subtotal:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151; font-family: Arial, sans-serif;">$${quoteData.subtotal}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 8px 0; color: #374151; font-family: Arial, sans-serif;">Labor:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151; font-family: Arial, sans-serif;">$${quoteData.labor}</td>
                      </tr>
                      <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 8px 0; color: #374151; font-family: Arial, sans-serif;">Tax:</td>
                        <td style="padding: 8px 0; text-align: right; color: #374151; font-family: Arial, sans-serif;">$${quoteData.tax}</td>
                      </tr>
                      <tr style="border-top: 2px solid #e5e7eb;">
                        <td style="padding: 12px 0 8px 0; font-weight: 600; font-size: 16px; color: #991b1b; font-family: Arial, sans-serif;">Total:</td>
                        <td style="padding: 12px 0 8px 0; text-align: right; font-weight: 600; font-size: 16px; color: #991b1b; font-family: Arial, sans-serif;">$${quoteData.total}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280;">
                    <p style="margin: 0; font-weight: 600; color: #374151; font-family: Arial, sans-serif;">Giesbrecht HVAC</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; font-family: Arial, sans-serif;">Professional Service Solutions</p>
                    <p style="margin: 8px 0 0 0; font-size: 12px; font-family: Arial, sans-serif;">Quote ID: ${quoteData.quoteId}</p>
                  </td>
                </tr>
                
              </table>
              
            </td>
          </tr>
        </table>
        
      </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();