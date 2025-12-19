const packages = require('./attached_assets/pricebook-packages.json');
const components = require('./attached_assets/pricebook-components.json');

// Check for any pricing data
console.log('=== CHECKING FOR PRICE DATA ===');

const pkgWithPrice = packages.filter(p => p.monthlyPayment || p.totalInvestment);
console.log('Packages with pricing:', pkgWithPrice.length, 'of', packages.length);
if (pkgWithPrice.length > 0) {
  console.log('Sample package with price:', pkgWithPrice[0]);
}

const compWithPrice = components.filter(c => c.monthlyPayment || c.totalInvestment);
console.log('Components with pricing:', compWithPrice.length, 'of', components.length);
if (compWithPrice.length > 0) {
  console.log('Sample component with price:', compWithPrice[0]);
}

// Check all fields to see if prices might be in another field
console.log('\n=== ALL PACKAGE FIELDS ===');
console.log(Object.keys(packages[0]));
console.log('\n=== ALL COMPONENT FIELDS ===');
console.log(Object.keys(components[0]));
