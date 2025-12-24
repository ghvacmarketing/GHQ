interface TrelloConfig {
  apiKey: string;
  token: string;
  boardId: string;
  ordersListId: string;
  followupListId: string;
}

interface TrelloCard {
  name: string;
  desc: string;
  idList: string;
  labels?: string[];
}

export class TrelloService {
  private config: TrelloConfig;
  private baseUrl = 'https://api.trello.com/1';

  constructor() {
    this.config = {
      apiKey: process.env.TRELLO_API_KEY || '',
      token: process.env.TRELLO_TOKEN || '',
      boardId: process.env.TRELLO_BOARD_ID || '',
      ordersListId: process.env.TRELLO_ORDERS_LIST_ID || '',
      followupListId: process.env.TRELLO_FOLLOWUP_LIST_ID || '',
    };
  }

  async createOrderCard(quoteData: {
    customerName: string;
    technician: string;
    total: string;
    subtotal: string;
    labor: string;
    tax: string;
    parts: any[];
    quoteId: string;
    jobNotes?: string;
    ghvacInstalled?: boolean;
    yearsSinceInstallation?: string;
  }): Promise<string | null> {
    try {
      const cardData: TrelloCard = {
        name: `Order - ${quoteData.customerName} - $${quoteData.total}`,
        desc: this.generateOrderDescription(quoteData),
        idList: this.config.ordersListId,
      };

      const response = await this.createCard(cardData);
      return response?.id || null;
    } catch (error) {
      console.error('Error creating Trello order card:', error);
      return null;
    }
  }

  async createFollowupCard(quoteData: {
    customerName: string;
    technician: string;
    total: string;
    subtotal: string;
    labor: string;
    tax: string;
    parts: any[];
    quoteId: string;
    jobNotes?: string;
    ghvacInstalled?: boolean;
    yearsSinceInstallation?: string;
  }): Promise<string | null> {
    try {
      const cardData: TrelloCard = {
        name: `Follow-up - ${quoteData.customerName} - $${quoteData.total}`,
        desc: this.generateFollowupDescription(quoteData),
        idList: this.config.followupListId,
      };

      const response = await this.createCard(cardData);
      return response?.id || null;
    } catch (error) {
      console.error('Error creating Trello follow-up card:', error);
      return null;
    }
  }

  private async createCard(cardData: TrelloCard): Promise<any> {
    const url = `${this.baseUrl}/cards?key=${this.config.apiKey}&token=${this.config.token}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cardData),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Trello API error: ${response.statusText} - ${errorBody}`);
    }

    return await response.json();
  }

  private generateOrderDescription(quoteData: any): string {
    const partsList = quoteData.parts.map((part: any) => {
      const price = typeof part.price === 'string' ? part.price : part.price.toString();
      const qty = part.quantity || 1;
      const warranty = part.warranty ? ' [Warranty]' : '';
      const custom = part.isCustom ? ' [Custom Part]' : '';
      return `- ${part.description} (${part.partNumber})${warranty}${custom}\n  Qty: ${qty} @ $${price} each = $${(parseFloat(price) * qty).toFixed(2)}`;
    }).join('\n');

    const ghvacInfo = quoteData.ghvacInstalled 
      ? `GHVAC Previously Installed: Yes (${quoteData.yearsSinceInstallation || 'N/A'} years ago)` 
      : 'GHVAC Previously Installed: No';

    const notesSection = quoteData.jobNotes ? `\n\nJOB NOTES:\n${quoteData.jobNotes}` : '';

    return `CUSTOMER: ${quoteData.customerName}
TECHNICIAN: ${quoteData.technician}
QUOTE ID: ${quoteData.quoteId}

${ghvacInfo}

PARTS TO ORDER:
${partsList}

PRICING BREAKDOWN:
Parts Subtotal: $${quoteData.subtotal}
Labor: $${quoteData.labor}
Tax: $${quoteData.tax}
TOTAL: $${quoteData.total}${notesSection}

STATUS: Quote Accepted`;
  }

  private generateFollowupDescription(quoteData: any): string {
    const partsList = quoteData.parts.map((part: any) => {
      const price = typeof part.price === 'string' ? part.price : part.price.toString();
      const qty = part.quantity || 1;
      const warranty = part.warranty ? ' [Warranty]' : '';
      return `- ${part.description} (${part.partNumber})${warranty} - Qty: ${qty} @ $${price}`;
    }).join('\n');

    const ghvacInfo = quoteData.ghvacInstalled 
      ? `GHVAC Previously Installed: Yes (${quoteData.yearsSinceInstallation || 'N/A'} years ago)` 
      : 'GHVAC Previously Installed: No';

    const notesSection = quoteData.jobNotes ? `\n\nJOB NOTES:\n${quoteData.jobNotes}` : '';

    return `CUSTOMER: ${quoteData.customerName}
TECHNICIAN: ${quoteData.technician}
QUOTE ID: ${quoteData.quoteId}

${ghvacInfo}

QUOTED PARTS:
${partsList}

PRICING BREAKDOWN:
Parts Subtotal: $${quoteData.subtotal}
Labor: $${quoteData.labor}
Tax: $${quoteData.tax}
TOTAL: $${quoteData.total}${notesSection}

STATUS: Quote Pending - Follow-up Required`;
  }

  async getCard(cardId: string): Promise<any> {
    const url = `${this.baseUrl}/cards/${cardId}?key=${this.config.apiKey}&token=${this.config.token}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.statusText}`);
    }
    return await response.json();
  }

  async getCardAttachments(cardId: string): Promise<any[]> {
    const url = `${this.baseUrl}/cards/${cardId}/attachments?key=${this.config.apiKey}&token=${this.config.token}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.statusText}`);
    }
    return await response.json();
  }

  async downloadAttachment(url: string): Promise<Buffer> {
    // Use OAuth header for authenticated attachment download (required by Trello)
    const response = await fetch(url, {
      headers: {
        'Authorization': `OAuth oauth_consumer_key="${this.config.apiKey}", oauth_token="${this.config.token}"`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getBoardLists(boardId?: string): Promise<any[]> {
    const bid = boardId || this.config.boardId;
    const url = `${this.baseUrl}/boards/${bid}/lists?key=${this.config.apiKey}&token=${this.config.token}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.statusText}`);
    }
    return await response.json();
  }

  async moveCardToList(cardId: string, listId: string): Promise<any> {
    const url = `${this.baseUrl}/cards/${cardId}?key=${this.config.apiKey}&token=${this.config.token}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idList: listId }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Trello API error moving card: ${response.statusText} - ${errorBody}`);
    }
    return await response.json();
  }
}

export const trelloService = new TrelloService();
