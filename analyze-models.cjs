const packages = require('./attached_assets/pricebook-packages.json');

// Analyze all model number patterns
const models = [...new Set(packages.map(p => p.outdoorModel))];
console.log('Unique outdoor models:', models.length);
console.log('\nAll models:');
models.forEach(m => {
  // Try various tonnage patterns
  const patterns = [
    /0?(18|24|30|36|42|48|60)/,  // with or without leading zero
    /(\d{2})4/,  // 524, 536, 548 pattern
  ];
  let tonnage = null;
  for (const p of patterns) {
    const match = m.match(p);
    if (match) {
      const code = match[1] || match[0];
      const map = {
        '18': '1.5 Ton', '24': '2 Ton', '30': '2.5 Ton', '36': '3 Ton',
        '42': '3.5 Ton', '48': '4 Ton', '60': '5 Ton',
        '52': '2 Ton', '53': '3 Ton', '54': '4 Ton', '56': '5 Ton'
      };
      tonnage = map[code] || code;
      break;
    }
  }
  console.log(m, '->', tonnage || 'UNKNOWN');
});
