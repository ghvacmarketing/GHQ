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
    parts: any[];
    quoteId: string;
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
    quoteId: string;
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
    const partsList = quoteData.parts.map((part: any) => 
      `- ${part.description} (${part.partNumber}) - Qty: ${part.quantity || 1}`
    ).join('\n');

    return `Customer: ${quoteData.customerName}
Technician: ${quoteData.technician}
Quote ID: ${quoteData.quoteId}
Total: $${quoteData.total}

Parts to Order:
${partsList}

Status: Quote Accepted - Parts Need Ordering`;
  }

  private generateFollowupDescription(quoteData: any): string {
    return `Customer: ${quoteData.customerName}
Technician: ${quoteData.technician}
Quote ID: ${quoteData.quoteId}
Total: $${quoteData.total}

Status: Quote Pending - Follow-up Required

Action Items:
- Contact customer to discuss quote
- Address any questions or concerns
- Schedule installation if accepted`;
  }
}

export const trelloService = new TrelloService();
