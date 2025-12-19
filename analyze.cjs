const packages = require('./attached_assets/pricebook-packages.json');
const components = require('./attached_assets/pricebook-components.json');

// Check if any have pricing
const packagesWithPrice = packages.filter(p => p.monthlyPayment || p.totalInvestment);
console.log('Packages with pricing:', packagesWithPrice.length, 'of', packages.length);

const componentsWithPrice = components.filter(c => c.monthlyPayment || c.totalInvestment);
console.log('Components with pricing:', componentsWithPrice.length, 'of', components.length);

// Analyze tonnage patterns in model numbers
// AC model numbers typically have tonnage encoded: 024=2ton, 036=3ton, 048=4ton, 060=5ton
console.log('\n=== TONNAGE ANALYSIS ===');
const tonnageMap = {
  '018': '1.5 Ton',
  '024': '2 Ton',
  '030': '2.5 Ton',
  '036': '3 Ton',
  '042': '3.5 Ton',
  '048': '4 Ton',
  '060': '5 Ton'
};

const uniqueModels = [...new Set(packages.map(p => p.outdoorModel))];
uniqueModels.slice(0, 20).forEach(model => {
  const tonnage = Object.keys(tonnageMap).find(code => model.includes(code));
  console.log(model, '->', tonnage ? tonnageMap[tonnage] : 'Unknown');
});

// Group packages by UnitType + Tier + Tonnage
console.log('\n=== PACKAGE GROUPINGS ===');
const groups = {};
packages.forEach(p => {
  // Extract tonnage from outdoor model
  const tonnageCode = Object.keys(tonnageMap).find(code => p.outdoorModel.includes(code));
  const tonnage = tonnageCode ? tonnageMap[tonnageCode] : 'Unknown';
  const key = `${p.unitType}|${p.tier}|${tonnage}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(p);
});

Object.entries(groups).slice(0, 15).forEach(([key, items]) => {
  console.log(`${key}: ${items.length} packages (${items.map(i => i.packageLevel).join(', ')})`);
});
