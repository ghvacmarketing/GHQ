const AdmZip = require('adm-zip');
const fs = require('fs');

const xlsxPath = 'attached_assets/Giesbrecht_Sales_Pricebook_By_UnitType_1766176604064.xlsx';
const zip = new AdmZip(xlsxPath);
const entries = zip.getEntries();

function parseSheet(sheetEntry) {
  const content = sheetEntry.getData().toString('utf8');
  // Match rows - this file uses different namespace
  const rows = content.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
  
  return rows.map(row => {
    const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
    const rowData = {};
    cells.forEach(cell => {
      const colRef = cell.match(/r="([A-Z]+)/)?.[1];
      // Get inline string value
      const inlineStr = cell.match(/<t>([^<]*)<\/t>/)?.[1];
      // Get numeric value
      const numValue = cell.match(/<v>([^<]*)<\/v>/)?.[1];
      if (colRef) {
        rowData[colRef] = inlineStr || numValue || '';
      }
    });
    return rowData;
  });
}

// Parse Packages sheet (sheet2)
const sheet2 = entries.find(e => e.entryName === 'xl/worksheets/sheet2.xml');
if (sheet2) {
  const rows = parseSheet(sheet2);
  console.log('=== PACKAGES SHEET ===');
  console.log('Row count:', rows.length);
  console.log('\nHeaders:', rows[0]);
  console.log('\nSample rows with prices:');
  rows.slice(1, 10).forEach((r, i) => {
    console.log(`Row ${i+2}: UnitType=${r.A}, Tier=${r.B}, Tonnage=${r.C}, Level=${r.D}, Monthly=${r.E}, Total=${r.F}, Brand=${r.G}`);
  });
  
  // Save packages with prices
  const packages = rows.slice(1).filter(r => r.A).map(r => ({
    unitType: r.A || '',
    tier: r.B || '',
    tonnage: r.C || '',
    packageLevel: r.D || '',
    monthlyPayment: r.E || '',
    totalInvestment: r.F || '',
    outdoorBrand: r.G || '',
    outdoorModel: r.H || '',
    outdoorName: r.I || '',
    coilModel: r.J || '',
    coilName: r.K || '',
    indoorHeatModel: r.L || '',
    indoorHeatName: r.M || '',
    thermostatModel: r.N || '',
    thermostatName: r.O || '',
    accessoryModels: r.P || ''
  }));
  
  fs.writeFileSync('attached_assets/pricebook-packages.json', JSON.stringify(packages, null, 2));
  console.log('\nSaved', packages.length, 'packages to pricebook-packages.json');
  
  // Show some with prices
  const withPrices = packages.filter(p => p.totalInvestment);
  console.log('Packages with prices:', withPrices.length);
}

// Parse Components sheet (sheet3)
const sheet3 = entries.find(e => e.entryName === 'xl/worksheets/sheet3.xml');
if (sheet3) {
  const rows = parseSheet(sheet3);
  console.log('\n=== COMPONENTS SHEET ===');
  console.log('Row count:', rows.length);
  console.log('\nHeaders:', rows[0]);
  console.log('\nSample rows:');
  rows.slice(1, 10).forEach((r, i) => {
    console.log(`Row ${i+2}: Type=${r.A}, Tier=${r.B}, Tonnage=${r.C}, CompType=${r.E}, Brand=${r.F}, Monthly=${r.J}, Total=${r.K}`);
  });
  
  // Save components
  const components = rows.slice(1).filter(r => r.A).map(r => ({
    unitType: r.A || '',
    tier: r.B || '',
    tonnage: r.C || '',
    packageLevel: r.D || '',
    componentType: r.E || '',
    brand: r.F || '',
    unitName: r.G || '',
    model: r.H || '',
    description: r.I || '',
    monthlyPayment: r.J || '',
    totalInvestment: r.K || '',
    sourcePage: r.L || ''
  }));
  
  fs.writeFileSync('attached_assets/pricebook-components.json', JSON.stringify(components, null, 2));
  console.log('\nSaved', components.length, 'components to pricebook-components.json');
  
  const withPrices = components.filter(c => c.totalInvestment);
  console.log('Components with prices:', withPrices.length);
}
