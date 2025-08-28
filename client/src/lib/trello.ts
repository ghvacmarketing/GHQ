// Client-side Trello integration helpers
// All Trello operations are handled server-side for security

export interface TrelloCard {
  id: string;
  name: string;
  url: string;
}

export async function createOrderCard(quoteId: string): Promise<TrelloCard | null> {
  try {
    const response = await fetch(`/api/quotes/${quoteId}/trello/order`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error('Failed to create Trello card');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating Trello order card:', error);
    return null;
  }
}

export async function createFollowupCard(quoteId: string): Promise<TrelloCard | null> {
  try {
    const response = await fetch(`/api/quotes/${quoteId}/trello/followup`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error('Failed to create Trello card');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating Trello follow-up card:', error);
    return null;
  }
}
