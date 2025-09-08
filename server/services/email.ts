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
    
    const partsHtml = quoteData.parts.map(part => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <div>
          <div style="font-weight: 500; color: #1f2937;">${part.description}</div>
          <div style="font-size: 14px; color: #6b7280;">Part #: ${part.partNumber}</div>
        </div>
        <div style="text-align: right; color: #1f2937;">$${part.price} x ${part.quantity || 1}</div>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>New HVAC Quote - ${quoteData.customerName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.5; 
            color: #1f2937; 
            background-color: #f9fafb; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 8px; 
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #711419 0%, #8b1c1c 100%); 
            color: white; 
            padding: 24px; 
            text-align: center; 
          }
          .header h1 { 
            font-size: 24px; 
            font-weight: 600; 
            margin-bottom: 8px; 
          }
          .header p { 
            font-size: 16px; 
            opacity: 0.9; 
          }
          .content { 
            padding: 24px; 
          }
          .quote-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            margin-bottom: 24px; 
            padding-bottom: 16px; 
            border-bottom: 2px solid #f3f4f6; 
          }
          .customer-info h2 { 
            font-size: 20px; 
            font-weight: 600; 
            color: #1f2937; 
            margin-bottom: 4px; 
          }
          .status-badge { 
            background: #f3f4f6; 
            color: #6b7280; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-size: 12px; 
            font-weight: 500; 
            text-transform: capitalize; 
          }
          .total-amount { 
            font-size: 24px; 
            font-weight: 700; 
            color: #991b1b; 
            text-align: right; 
          }
          .meta-info { 
            display: flex; 
            gap: 16px; 
            margin-bottom: 24px; 
            font-size: 14px; 
            color: #6b7280; 
          }
          .meta-info svg { 
            width: 14px; 
            height: 14px; 
            margin-right: 4px; 
            vertical-align: middle; 
          }
          .section { 
            margin-bottom: 24px; 
          }
          .section-title { 
            font-size: 18px; 
            font-weight: 600; 
            color: #1f2937; 
            margin-bottom: 12px; 
          }
          .parts-list { 
            background: #f9fafb; 
            border-radius: 6px; 
            padding: 16px; 
          }
          .summary-grid { 
            background: #f9fafb; 
            border-radius: 6px; 
            padding: 16px; 
          }
          .summary-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 8px 0; 
            border-bottom: 1px solid #e5e7eb; 
          }
          .summary-row:last-child { 
            border-bottom: none; 
            font-weight: 600; 
            font-size: 16px; 
            color: #991b1b; 
            padding-top: 12px; 
            border-top: 2px solid #e5e7eb; 
          }
          .footer { 
            background: #f3f4f6; 
            padding: 20px 24px; 
            text-align: center; 
            color: #6b7280; 
            font-size: 14px; 
          }
          .job-notes { 
            background: #fef3c7; 
            border-left: 4px solid #f59e0b; 
            padding: 12px 16px; 
            border-radius: 0 4px 4px 0; 
            margin-bottom: 16px; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New HVAC Quote</h1>
            <p>Generated by ${quoteData.technician}</p>
          </div>
          
          <div class="content">
            <div class="quote-header">
              <div class="customer-info">
                <h2>${quoteData.customerName}</h2>
                <span class="status-badge">${quoteData.status || 'draft'}</span>
              </div>
              <div class="total-amount">$${quoteData.total}</div>
            </div>
            
            <div class="meta-info">
              <div>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                ${quoteData.technician}
              </div>
              <div>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a1 1 0 011-1h6a1 1 0 011 1v4h3a1 1 0 011 1v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8a1 1 0 011-1h3z"></path>
                </svg>
                ${formattedDate}
              </div>
              <div>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
                ${quoteData.parts.length} part${quoteData.parts.length !== 1 ? 's' : ''}
              </div>
            </div>
            
            ${quoteData.jobNotes ? `
              <div class="job-notes">
                <strong>Job Notes:</strong><br>
                ${quoteData.jobNotes}
              </div>
            ` : ''}
            
            <div class="section">
              <h3 class="section-title">Parts & Services</h3>
              <div class="parts-list">
                ${partsHtml || '<div style="color: #6b7280; font-style: italic;">No parts listed</div>'}
              </div>
            </div>
            
            <div class="section">
              <h3 class="section-title">Quote Summary</h3>
              <div class="summary-grid">
                <div class="summary-row">
                  <span>Parts Subtotal:</span>
                  <span>$${quoteData.subtotal}</span>
                </div>
                <div class="summary-row">
                  <span>Labor:</span>
                  <span>$${quoteData.labor}</span>
                </div>
                <div class="summary-row">
                  <span>Tax:</span>
                  <span>$${quoteData.tax}</span>
                </div>
                <div class="summary-row">
                  <span>Total:</span>
                  <span>$${quoteData.total}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <p><strong>Giesbrecht HVAC</strong> - Professional Service Solutions</p>
            <p style="margin-top: 8px; font-size: 12px;">Quote ID: ${quoteData.quoteId}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
