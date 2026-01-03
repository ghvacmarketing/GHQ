export interface WorksheetInputs {
  hoursToInstall: number;
  topManHourlyRate: number;
  laborBenefitsPct: number;
  overheadPct: number;
  profitPct: number;
  financingPct: number;
  commissionPct: number;
  warrantyReserveDollar: number;
  crewDayHours: number;
  discountDollar: number;
}

export interface WorksheetLine {
  cost: number;
}

export interface WorksheetCalculations {
  laborPayroll: number;
  laborBenefits: number;
  linesTotal: number;
  directCost: number;
  sellPrice: number;
  grossProfit: number;
  grossMarginPct: number;
  crewDays: number;
  grossProfitPerCrewDay: number;
  discountedSellPrice: number;
  discountedGrossProfit: number;
  discountedGrossMarginPct: number;
  discountedGpPerCrewDay: number;
}

export function calcWorksheet(
  inputs: WorksheetInputs,
  lines: WorksheetLine[]
): WorksheetCalculations {
  const {
    hoursToInstall,
    topManHourlyRate,
    laborBenefitsPct,
    overheadPct,
    profitPct,
    financingPct,
    commissionPct,
    warrantyReserveDollar,
    crewDayHours,
    discountDollar,
  } = inputs;

  const laborPayroll = hoursToInstall * topManHourlyRate;
  const laborBenefits = laborPayroll * laborBenefitsPct;
  const linesTotal = lines.reduce((sum, line) => sum + line.cost, 0);
  const directCost =
    linesTotal + laborPayroll + laborBenefits + warrantyReserveDollar;
  const denom = 1 - overheadPct - profitPct - financingPct - commissionPct;
  const sellPrice = denom > 0 ? directCost / denom : 0;
  const grossProfit = sellPrice - directCost;
  const grossMarginPct = sellPrice > 0 ? 1 - directCost / sellPrice : 0;
  const crewDays = crewDayHours > 0 ? hoursToInstall / crewDayHours : 0;
  const grossProfitPerCrewDay = crewDays > 0 ? grossProfit / crewDays : 0;
  const discountedSellPrice = sellPrice - discountDollar;
  const discountedGrossProfit = discountedSellPrice - directCost;
  const discountedGrossMarginPct =
    discountedSellPrice > 0 ? 1 - directCost / discountedSellPrice : 0;
  const discountedGpPerCrewDay =
    crewDays > 0 ? discountedGrossProfit / crewDays : 0;

  return {
    laborPayroll: round2(laborPayroll),
    laborBenefits: round2(laborBenefits),
    linesTotal: round2(linesTotal),
    directCost: round2(directCost),
    sellPrice: round2(sellPrice),
    grossProfit: round2(grossProfit),
    grossMarginPct: round4(grossMarginPct),
    crewDays: round2(crewDays),
    grossProfitPerCrewDay: round2(grossProfitPerCrewDay),
    discountedSellPrice: round2(discountedSellPrice),
    discountedGrossProfit: round2(discountedGrossProfit),
    discountedGrossMarginPct: round4(discountedGrossMarginPct),
    discountedGpPerCrewDay: round2(discountedGpPerCrewDay),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
