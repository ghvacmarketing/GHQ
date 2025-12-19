const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const xlsxPath = 'attached_assets/Giesbrecht_Sales_Pricebook_Parsed_1766174748101.xlsx';
const zip = new AdmZip(xlsxPath);
const entries = zip.getEntries();

// Find shared strings
let sharedStrings = [];
const ssEntry = entries.find(e => e.entryName.includes('sharedStrings.xml'));
if (ssEntry) {
  const content = ssEntry.getData().toString('utf8');
  const matches = content.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
  sharedStrings = matches.map(m => m.replace(/<t[^>]*>|<\/t>/g, ''));
}

// Find sheet1
const sheetEntry = entries.find(e => e.entryName.includes('sheet1.xml'));
if (sheetEntry) {
  const content = sheetEntry.getData().toString('utf8');
  const rows = content.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  
  console.log('=== PRICEBOOK DATA ===');
  console.log('Total rows:', rows.length);
  console.log('');
  
  rows.slice(0, 30).forEach((row, idx) => {
    const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
    const rowData = cells.map(cell => {
      const type = cell.match(/t="([^"]*)"/)?.[1];
      const value = cell.match(/<v>([^<]*)<\/v>/)?.[1];
      if (type === 's' && value) {
        return sharedStrings[parseInt(value)] || value;
      }
      return value || '';
    });
    console.log(`Row ${idx + 1}:`, rowData.join(' | '));
  });
}
