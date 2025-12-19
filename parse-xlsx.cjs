const AdmZip = require('adm-zip');
const fs = require('fs');

const xlsxPath = 'attached_assets/Giesbrecht_Sales_Pricebook_Parsed_1766174748101.xlsx';
const zip = new AdmZip(xlsxPath);
const entries = zip.getEntries();

function parseSheet(sheetEntry) {
  const content = sheetEntry.getData().toString('utf8');
  const rows = content.match(/<x:row[^>]*>[\s\S]*?<\/x:row>/g) || [];
  
  return rows.map(row => {
    const cells = row.match(/<x:c[^>]*>[\s\S]*?<\/x:c>/g) || [];
    const rowData = {};
    cells.forEach(cell => {
      const colRef = cell.match(/r="([A-Z]+)/)?.[1];
      const value = cell.match(/<x:t[^>]*>([^<]*)<\/x:t>/)?.[1] || '';
      if (colRef) rowData[colRef] = value.trim();
    });
    return rowData;
  });
}

// Sheet 2: Packages
const sheet2 = entries.find(e => e.entryName === 'xl/worksheets/sheet2.xml');
const packages = parseSheet(sheet2).slice(1).map(r => ({
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
})).filter(p => p.unitType && p.outdoorModel);

// Sheet 3: Components
const sheet3 = entries.find(e => e.entryName === 'xl/worksheets/sheet3.xml');
const components = parseSheet(sheet3).slice(1).map(r => ({
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
})).filter(c => c.unitType && c.model);

// Analyze data
console.log('=== PACKAGES ANALYSIS ===');
console.log('Total packages:', packages.length);
const unitTypes = [...new Set(packages.map(p => p.unitType))];
const tiers = [...new Set(packages.map(p => p.tier))];
const levels = [...new Set(packages.map(p => p.packageLevel))];
console.log('Unit Types:', unitTypes);
console.log('Tiers:', tiers);
console.log('Package Levels:', levels);

console.log('\n=== COMPONENTS ANALYSIS ===');
console.log('Total components:', components.length);
const compTypes = [...new Set(components.map(c => c.componentType))];
const brands = [...new Set(components.map(c => c.brand))];
console.log('Component Types:', compTypes);
console.log('Brands:', brands);

// Save to JSON for use in the app
fs.writeFileSync('attached_assets/pricebook-packages.json', JSON.stringify(packages, null, 2));
fs.writeFileSync('attached_assets/pricebook-components.json', JSON.stringify(components, null, 2));
console.log('\nSaved to attached_assets/pricebook-packages.json and pricebook-components.json');
