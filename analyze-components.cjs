const components = require('./attached_assets/pricebook-components.json');

// Check tonnage field in components
console.log('=== COMPONENT TONNAGE ANALYSIS ===');
const byType = {};
components.forEach(c => {
  if (!byType[c.componentType]) byType[c.componentType] = { withTonnage: 0, withoutTonnage: 0, samples: [] };
  const hasTonnageField = c.tonnage && c.tonnage.trim() !== '';
  if (hasTonnageField) {
    byType[c.componentType].withTonnage++;
  } else {
    byType[c.componentType].withoutTonnage++;
  }
  if (byType[c.componentType].samples.length < 3) {
    byType[c.componentType].samples.push({ model: c.model, tonnage: c.tonnage, unitName: c.unitName });
  }
});

Object.entries(byType).forEach(([type, stats]) => {
  console.log(`\n${type}:`);
  console.log(`  With tonnage field: ${stats.withTonnage}`);
  console.log(`  Without tonnage field: ${stats.withoutTonnage}`);
  console.log('  Samples:', JSON.stringify(stats.samples, null, 2));
});

// Check unique brands by component type
console.log('\n=== BRANDS BY COMPONENT TYPE ===');
Object.keys(byType).forEach(type => {
  const brands = [...new Set(components.filter(c => c.componentType === type).map(c => c.brand))];
  console.log(`${type}: ${brands.join(', ')}`);
});
