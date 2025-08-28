// Client-side Google Sheets integration helpers
// Note: Most Google Sheets operations should be done server-side for security

export interface SheetsData {
  parts: any[];
  settings: any;
}

export async function fetchSheetsData(): Promise<SheetsData> {
  try {
    const [partsResponse, settingsResponse] = await Promise.all([
      fetch('/api/parts'),
      fetch('/api/settings')
    ]);

    const parts = await partsResponse.json();
    const settings = await settingsResponse.json();

    return { parts, settings };
  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    throw new Error('Failed to fetch pricing data');
  }
}

export async function refreshPricing(): Promise<boolean> {
  try {
    const response = await fetch('/api/sheets/refresh', {
      method: 'POST',
    });
    return response.ok;
  } catch (error) {
    console.error('Error refreshing pricing:', error);
    return false;
  }
}
