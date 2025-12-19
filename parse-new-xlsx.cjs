const AdmZip = require('adm-zip');
const fs = require('fs');

const xlsxPath = 'attached_assets/Giesbrecht_Sales_Pricebook_By_UnitType_1766176604064.xlsx';
const zip = new AdmZip(xlsxPath);
const entries = zip.getEntries();

// Check workbook for sheet names
const workbookEntry = entries.find(e => e.entryName === 'xl/workbook.xml');
if (workbookEntry) {
  const content = workbookEntry.getData().toString('utf8');
  console.log('=== WORKBOOK ===');
  const sheets = content.match(/<sheet[^>]*\/>/g) || [];
  sheets.forEach(s => console.log(s));
}

// Check sheet1 content directly
const sheet2 = entries.find(e => e.entryName === 'xl/worksheets/sheet2.xml');
if (sheet2) {
  const content = sheet2.getData().toString('utf8');
  console.log('\n=== SHEET2 STRUCTURE (first 3000 chars) ===');
  console.log(content.substring(0, 3000));
}
