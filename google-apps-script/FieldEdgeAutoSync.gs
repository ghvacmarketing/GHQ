/**
 * FieldEdge Customer Auto-Sync Script
 * 
 * This script automatically syncs customer data from a Google Sheet to a web application.
 * The sheet is populated by a Python script every 10 minutes, and this script runs every 12 minutes
 * to push changes to the webapp's CSV import endpoint.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Save the project (Ctrl+S or Cmd+S)
 * 5. Go to Project Settings (gear icon) > Script Properties
 * 6. Add these properties:
 *    - WEBAPP_URL: Your webapp's base URL (e.g., "https://yourapp.replit.app")
 *    - API_TOKEN: Your admin API key (get this from the Replit secrets)
 * 7. To create the trigger: Go to Triggers (clock icon) > Add Trigger
 *    - Function: syncToWebapp
 *    - Event source: Time-driven
 *    - Type: Minutes timer
 *    - Interval: Every 10 minutes (or 15 minutes)
 * 8. Run syncToWebapp() manually once to grant permissions
 * 
 * TESTING:
 * 1. Run syncToWebapp() manually from the editor
 * 2. Check the Sync Settings sheet for status dashboard
 * 3. Check the Sync Log sheet for detailed history
 */

// ==================== CONFIGURATION ====================
const DATA_SHEET_NAME = 'Sheet1'; // Name of the sheet with customer data (adjust if different)
const SYNC_SETTINGS_SHEET = 'Sync Settings';
const SYNC_LOG_SHEET = 'Sync Log';
const MAX_LOG_ROWS = 100;
const FILENAME_FOR_UPLOAD = 'fieldedge_auto_sync.csv';

// ==================== MAIN SYNC FUNCTION ====================
function syncToWebapp() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Get configuration
    const webappUrl = props.getProperty('WEBAPP_URL');
    const apiToken = props.getProperty('API_TOKEN');
    
    if (!webappUrl || !apiToken) {
      throw new Error('Missing configuration. Set WEBAPP_URL and API_TOKEN in Script Properties.');
    }
    
    // Get data sheet
    const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
    if (!dataSheet) {
      throw new Error(`Data sheet "${DATA_SHEET_NAME}" not found. Check DATA_SHEET_NAME constant.`);
    }
    
    // Get all data including headers
    const data = dataSheet.getDataRange().getValues();
    if (data.length < 2) {
      logToSheet('NO_DATA', 'Sheet has no data rows (only headers or empty)');
      updateSyncSettings('no_data', { message: 'No data rows in sheet' });
      return;
    }
    
    // Calculate hash of current data
    const dataString = JSON.stringify(data);
    const currentHash = computeSHA256(dataString);
    const lastHash = props.getProperty('lastSyncHash');
    
    // Check if data has changed
    if (currentHash === lastHash) {
      logToSheet('NO_CHANGE', `Data unchanged (hash: ${currentHash.substring(0, 8)}...)`);
      updateSyncSettings('no_change', {});
      return;
    }
    
    // Convert data to CSV
    const csvContent = convertToCSV(data);
    
    // Create multipart form data payload
    const boundary = '----FormBoundary' + Utilities.getUuid();
    const payload = createMultipartPayload(boundary, csvContent, FILENAME_FOR_UPLOAD);
    
    // Make the API request
    const endpoint = webappUrl.replace(/\/$/, '') + '/api/customers/import';
    const options = {
      method: 'post',
      contentType: 'multipart/form-data; boundary=' + boundary,
      headers: {
        'Authorization': 'Bearer ' + apiToken
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(endpoint, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    // Handle response
    if (responseCode === 200) {
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { raw: responseText };
      }
      
      // Success - update hash and log
      props.setProperty('lastSyncHash', currentHash);
      
      const created = responseData.created || 0;
      const updated = responseData.updated || 0;
      const skipped = responseData.skipped || 0;
      const errors = responseData.errors || 0;
      const rowsProcessed = created + updated;
      
      const details = `Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`;
      logToSheet('SYNCED', details);
      updateSyncSettings('synced', { 
        rowsProcessed: rowsProcessed,
        created: created,
        updated: updated,
        skipped: skipped,
        errors: errors,
        totalRows: data.length - 1
      });
      
    } else if (responseCode === 401) {
      logToSheet('AUTH_ERROR', `HTTP ${responseCode}: Unauthorized - check API_TOKEN`);
      updateSyncSettings('error', { message: `Auth failed (401) - check API_TOKEN` });
      
    } else {
      logToSheet('HTTP_ERROR', `HTTP ${responseCode}: ${responseText.substring(0, 200)}`);
      updateSyncSettings('error', { message: `HTTP ${responseCode}` });
    }
    
  } catch (error) {
    const errorMsg = error.message || String(error);
    logToSheet('ERROR', errorMsg);
    updateSyncSettings('error', { message: errorMsg });
  }
}

// ==================== CSV CONVERSION ====================
function convertToCSV(data) {
  return data.map(function(row) {
    return row.map(function(cell) {
      // Convert to string
      let value = cell === null || cell === undefined ? '' : String(cell);
      
      // Escape double quotes by doubling them
      value = value.replace(/"/g, '""');
      
      // Handle dates
      if (cell instanceof Date) {
        value = Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      }
      
      // Wrap in quotes
      return '"' + value + '"';
    }).join(',');
  }).join('\r\n');
}

// ==================== MULTIPART PAYLOAD ====================
function createMultipartPayload(boundary, csvContent, filename) {
  // Build multipart body as byte array for binary safety
  const crlf = '\r\n';
  
  // Build the preamble (headers before the file content)
  const preamble = '--' + boundary + crlf +
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"' + crlf +
    'Content-Type: text/csv' + crlf + crlf;
  
  // Build the epilogue (closing boundary with required trailing CRLF)
  const epilogue = crlf + '--' + boundary + '--' + crlf;
  
  // Convert to byte arrays and concatenate for binary safety
  const preambleBytes = Utilities.newBlob(preamble).getBytes();
  const contentBytes = Utilities.newBlob(csvContent, 'text/csv').getBytes();
  const epilogueBytes = Utilities.newBlob(epilogue).getBytes();
  
  // Combine all byte arrays
  const allBytes = preambleBytes.concat(contentBytes).concat(epilogueBytes);
  
  return allBytes;
}

// ==================== HASH COMPUTATION ====================
function computeSHA256(input) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return digest.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

// ==================== SYNC SETTINGS DASHBOARD ====================
function updateSyncSettings(status, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SYNC_SETTINGS_SHEET);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SYNC_SETTINGS_SHEET);
    initializeSyncSettingsSheet(sheet);
  }
  
  const now = new Date();
  const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  
  // Get current daily counter
  let dailyCount = parseInt(sheet.getRange('B7').getValue()) || 0;
  const lastSyncDate = sheet.getRange('B8').getValue();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  
  // Reset counter if new day
  if (lastSyncDate !== today) {
    dailyCount = 0;
    sheet.getRange('B8').setValue(today);
  }
  
  // Update based on status
  switch (status) {
    case 'synced':
      sheet.getRange('B3').setValue(timestamp);
      sheet.getRange('B4').setValue(details.rowsProcessed + ' rows (' + details.created + ' new, ' + details.updated + ' updated)');
      sheet.getRange('B5').setValue(details.totalRows + ' total in sheet');
      dailyCount++;
      sheet.getRange('B7').setValue(dailyCount);
      sheet.getRange('B9').setValue('None');
      break;
      
    case 'no_change':
      sheet.getRange('B6').setValue(timestamp);
      break;
      
    case 'no_data':
      sheet.getRange('B6').setValue(timestamp + ' (no data)');
      break;
      
    case 'error':
      sheet.getRange('B9').setValue(timestamp + ' - ' + details.message);
      break;
  }
}

function initializeSyncSettingsSheet(sheet) {
  // Set up the dashboard layout
  const headers = [
    ['FieldEdge Auto-Sync Dashboard', ''],
    ['', ''],
    ['Last Successful Sync:', 'Never'],
    ['Rows Processed:', '-'],
    ['Sheet Row Count:', '-'],
    ['Last Check (No Changes):', 'Never'],
    ['Total Syncs Today:', '0'],
    ['Counter Date:', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')],
    ['Last Error:', 'None'],
    ['', ''],
    ['Configuration', ''],
    ['Data Sheet:', DATA_SHEET_NAME],
    ['Upload Filename:', FILENAME_FOR_UPLOAD],
  ];
  
  sheet.getRange(1, 1, headers.length, 2).setValues(headers);
  
  // Format header
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold');
  sheet.getRange('A3:A9').setFontWeight('bold');
  sheet.getRange('A11').setFontWeight('bold').setFontStyle('italic');
  
  // Set column widths
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 350);
  
  // Add borders
  sheet.getRange('A3:B9').setBorder(true, true, true, true, true, true);
}

// ==================== SYNC LOG ====================
function logToSheet(status, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SYNC_LOG_SHEET);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SYNC_LOG_SHEET);
    sheet.appendRow(['Timestamp', 'Status', 'Details']);
    sheet.getRange('1:1').setFontWeight('bold');
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 500);
  }
  
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  
  // Insert new row after header
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, 3).setValues([[timestamp, status, details]]);
  
  // Color code status
  const statusCell = sheet.getRange(2, 2);
  switch (status) {
    case 'SYNCED':
      statusCell.setBackground('#d4edda').setFontColor('#155724');
      break;
    case 'NO_CHANGE':
      statusCell.setBackground('#fff3cd').setFontColor('#856404');
      break;
    case 'ERROR':
    case 'HTTP_ERROR':
    case 'AUTH_ERROR':
      statusCell.setBackground('#f8d7da').setFontColor('#721c24');
      break;
    default:
      statusCell.setBackground('#e2e3e5').setFontColor('#383d41');
  }
  
  // Trim to MAX_LOG_ROWS
  const lastRow = sheet.getLastRow();
  if (lastRow > MAX_LOG_ROWS + 1) {
    sheet.deleteRows(MAX_LOG_ROWS + 2, lastRow - MAX_LOG_ROWS - 1);
  }
}

// ==================== UTILITY: Manual Trigger Setup ====================
function createTrigger() {
  // Delete existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncToWebapp') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new 12-minute trigger
  ScriptApp.newTrigger('syncToWebapp')
    .timeBased()
    .everyMinutes(10)
    .create();
    
  Logger.log('Trigger created: syncToWebapp will run every 10 minutes');
}

// ==================== UTILITY: Test Connection ====================
function testConnection() {
  const props = PropertiesService.getScriptProperties();
  const webappUrl = props.getProperty('WEBAPP_URL');
  const apiToken = props.getProperty('API_TOKEN');
  
  Logger.log('WEBAPP_URL: ' + (webappUrl ? webappUrl : 'NOT SET'));
  Logger.log('API_TOKEN: ' + (apiToken ? 'Set (' + apiToken.length + ' chars)' : 'NOT SET'));
  
  if (!webappUrl || !apiToken) {
    Logger.log('ERROR: Missing configuration. Set WEBAPP_URL and API_TOKEN in Script Properties.');
    return;
  }
  
  // Test the endpoint with a small request
  try {
    const endpoint = webappUrl.replace(/\/$/, '') + '/api/customers/import/history';
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + apiToken },
      muteHttpExceptions: true
    });
    
    Logger.log('Response code: ' + response.getResponseCode());
    Logger.log('Response: ' + response.getContentText().substring(0, 500));
    
    if (response.getResponseCode() === 200) {
      Logger.log('SUCCESS: Connection works!');
    } else if (response.getResponseCode() === 401) {
      Logger.log('ERROR: Authentication failed. Check your API_TOKEN.');
    } else {
      Logger.log('WARNING: Unexpected response code.');
    }
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
  }
}

// ==================== UTILITY: Clear Hash (Force Re-sync) ====================
function clearHashToForceSync() {
  PropertiesService.getScriptProperties().deleteProperty('lastSyncHash');
  Logger.log('Hash cleared. Next sync will process all data regardless of changes.');
}

// ==================== UTILITY: View Current Settings ====================
function viewSettings() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('=== Current Script Properties ===');
  Logger.log('WEBAPP_URL: ' + props.getProperty('WEBAPP_URL'));
  Logger.log('API_TOKEN: ' + (props.getProperty('API_TOKEN') ? '[SET]' : '[NOT SET]'));
  Logger.log('lastSyncHash: ' + (props.getProperty('lastSyncHash') || '[NOT SET]'));
}
