export interface ContractTemplateData {
  customerName?: string;
  address?: string;
  date?: string;
  equipmentSummary?: string;
  totalPrice?: string;
  preparedFor?: string;
  projectName?: string;
}

export function applyTemplateVariables(templateBody: string, data: ContractTemplateData = {}): string {
  const today = data.date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const customerName = data.customerName || "[CLIENT NAME]";
  const preparedFor = data.preparedFor || customerName;
  const address = data.address || "[PROJECT ADDRESS]";
  const totalPrice = data.totalPrice || "[TOTAL INVESTMENT]";
  const equipmentSummary = data.equipmentSummary || "[EQUIPMENT DESCRIPTION]";
  const projectName = data.projectName || "[PROJECT NAME]";

  return templateBody
    .replace(/\{\{customerName\}\}/g, customerName)
    .replace(/\{\{preparedFor\}\}/g, preparedFor)
    .replace(/\{\{address\}\}/g, address)
    .replace(/\{\{totalPrice\}\}/g, totalPrice)
    .replace(/\{\{equipmentSummary\}\}/g, equipmentSummary)
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{date\}\}/g, today);
}

export function generateContractTemplate(data: ContractTemplateData = {}): string {
  const today = data.date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const customerName = data.customerName || "[CLIENT NAME]";
  const preparedFor = data.preparedFor || customerName;
  const address = data.address || "[PROJECT ADDRESS]";
  const totalPrice = data.totalPrice || "[TOTAL INVESTMENT]";
  const equipmentSummary = data.equipmentSummary || "[EQUIPMENT DESCRIPTION]";
  const projectName = data.projectName || "[PROJECT NAME]";

  return `
<h1>GIESBRECHT HVAC — INSTALLATION AGREEMENT</h1>
<p><strong>Project:</strong> ${projectName}</p>
<p><strong>Date:</strong> ${today}</p>
<p><strong>Prepared For:</strong> ${preparedFor}</p>
<p><strong>Project Address:</strong> ${address}</p>

<hr />

<h2>ABOUT GIESBRECHT HVAC</h2>
<p>Giesbrecht HVAC is a fully licensed, bonded, and insured heating and cooling contractor serving the Fresno and Central Valley area. Our team of NATE-certified technicians brings decades of combined experience to every installation. We are committed to delivering premium comfort solutions with the highest standards of craftsmanship and customer satisfaction.</p>
<ul>
  <li><strong>License #:</strong> [CONTRACTOR LICENSE NUMBER]</li>
  <li><strong>Insurance:</strong> General Liability &amp; Workers' Compensation</li>
  <li><strong>Certifications:</strong> NATE Certified Technicians, EPA 608 Certified</li>
</ul>

<hr />

<h2>SCOPE OF WORK</h2>
<p>Giesbrecht HVAC agrees to furnish all labor, materials, and equipment necessary to complete the following installation at the project address noted above:</p>
<ul>
  <li>${equipmentSummary}</li>
  <li>Complete system start-up, commissioning, and performance verification</li>
  <li>Removal and disposal of existing equipment (if applicable)</li>
  <li>All necessary electrical connections and refrigerant line work</li>
  <li>Programming and demonstration of thermostat/controls to homeowner</li>
</ul>

<h2>EQUIPMENT SPECIFICATIONS</h2>
<p>All equipment installed will be new, first-quality units from manufacturer. Specific model numbers will be confirmed upon order placement. Equipment specifications include:</p>
<ul>
  <li><strong>System Capacity:</strong> [SYSTEM CAPACITY] Tons</li>
  <li><strong>Efficiency Rating:</strong> [SEER/AFUE RATING]</li>
  <li><strong>Equipment Brand:</strong> [BRAND NAME]</li>
  <li><strong>Thermostat:</strong> [THERMOSTAT MODEL]</li>
</ul>

<hr />

<h2>TOTAL INVESTMENT</h2>
<p>The total investment for the complete installation described above is:</p>
<p><strong>Total: ${totalPrice}</strong></p>
<p>Financing options are available with approved credit. Monthly payment amounts are estimates based on standard financing terms and are subject to lender approval. Final financing terms will be provided by the financing institution.</p>

<hr />

<h2>WARRANTY COVERAGE</h2>
<p>All installed equipment and labor are covered by the following warranties:</p>
<ul>
  <li><strong>Manufacturer Parts Warranty:</strong> As specified by equipment manufacturer (typically 5–10 years on parts with registration)</li>
  <li><strong>Labor Warranty:</strong> 1 year from date of installation on all installation labor performed by Giesbrecht HVAC</li>
  <li><strong>Refrigerant:</strong> Any refrigerant leaks discovered within 30 days of installation will be repaired at no charge</li>
</ul>
<p><em>Note: Manufacturer warranties require equipment registration within 60 days of installation. Giesbrecht HVAC will assist with registration upon completion of the job.</em></p>

<hr />

<h2>INSTALLATION DETAILS</h2>
<p>Installation will be performed by licensed Giesbrecht HVAC technicians and will include:</p>
<ul>
  <li>Site protection — floor coverings and tarps used to protect the home during installation</li>
  <li>All work to meet or exceed local building codes and manufacturer specifications</li>
  <li>Permits pulled as required by local jurisdiction (permit fees included unless otherwise noted)</li>
  <li>Post-installation cleanup of all work areas</li>
  <li>Final system test and balance to confirm proper operation</li>
  <li>Walk-through with homeowner upon completion</li>
</ul>
<p><strong>Estimated Installation Timeline:</strong> [ESTIMATED TIMELINE — e.g., 1–2 days]</p>
<p><strong>Scheduled Installation Date:</strong> [SCHEDULED DATE]</p>

<hr />

<h2>EXCLUSIONS</h2>
<p>The following items are <strong>NOT</strong> included in this agreement unless separately itemized above:</p>
<ul>
  <li>Ductwork modifications, replacement, or new duct systems (unless quoted separately)</li>
  <li>Electrical panel upgrades or new circuit installations</li>
  <li>Gas line modifications or new gas line installations</li>
  <li>Structural modifications to accommodate equipment</li>
  <li>Painting, patching, or finishing of walls, ceilings, or floors disturbed during installation</li>
  <li>Permit fees beyond standard residential mechanical permits (unless included above)</li>
  <li>Any items not explicitly listed in the Scope of Work above</li>
</ul>

<hr />

<h2>TERMS AND CONDITIONS</h2>
<ol>
  <li><strong>Payment Terms:</strong> [PAYMENT TERMS — e.g., 50% deposit upon acceptance, balance due upon completion]. Accepted payment methods: check, ACH, major credit cards (credit card payments subject to 3% processing fee).</li>
  <li><strong>Change Orders:</strong> Any changes to the scope of work must be agreed upon in writing before additional work is performed. Change orders may affect the contract price and timeline.</li>
  <li><strong>Access:</strong> Customer agrees to provide reasonable access to the property for installation and any required inspections. If access is denied or delayed, Giesbrecht HVAC reserves the right to reschedule without penalty.</li>
  <li><strong>Site Conditions:</strong> This proposal is based on standard installation conditions. If unforeseen conditions are discovered during installation (e.g., asbestos, unsafe wiring, structural issues), Giesbrecht HVAC will notify the customer before proceeding. Additional costs may apply.</li>
  <li><strong>Cancellation:</strong> Customer may cancel this agreement within 3 business days of signing without penalty. After 3 business days, a cancellation fee of [CANCELLATION FEE] may apply to cover materials ordered and labor scheduled.</li>
  <li><strong>Dispute Resolution:</strong> Any disputes arising from this agreement shall first be addressed through good-faith negotiation. If unresolved, disputes shall be subject to binding arbitration in Fresno County, California.</li>
  <li><strong>Governing Law:</strong> This agreement is governed by the laws of the State of California.</li>
  <li><strong>Entire Agreement:</strong> This document constitutes the entire agreement between the parties and supersedes all prior discussions, representations, or agreements, whether written or oral.</li>
</ol>
`.trim();
}
