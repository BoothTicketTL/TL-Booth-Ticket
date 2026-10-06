const fs = require('fs');

// Function to format Date to YYYY-MM-DD
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Generate schedule dates for weekends
// League 1: 30 matchweeks starting from 2026-08-15 to 2027-05-16
const l1StartDate = new Date(2026, 7, 15); // Aug 15, 2026
const l1DatesByRound = {};
for (let r = 1; r <= 30; r++) {
  const dSat = new Date(l1StartDate.getTime() + (r - 1) * 7 * 86400000);
  const dSun = new Date(dSat.getTime() + 86400000);
  l1DatesByRound[r] = [formatDate(dSat), formatDate(dSun)];
}

// League 2: 34 matchweeks starting from 2026-08-14 to 2027-05-23
const l2StartDate = new Date(2026, 7, 14);
const l2DatesByRound = {};
for (let r = 1; r <= 34; r++) {
  const dFri = new Date(l2StartDate.getTime() + (r - 1) * 7 * 86400000);
  const dSat = new Date(dFri.getTime() + 86400000);
  const dSun = new Date(dFri.getTime() + 2 * 86400000);
  l2DatesByRound[r] = [formatDate(dFri), formatDate(dSat), formatDate(dSun)];
}

// League 3: Week 1 starts on Sep 19-20, 2026 (22 matchweeks)
const l3StartDate = new Date(2026, 8, 19); // Sep 19, 2026
const l3DatesByRound = {};
for (let r = 1; r <= 22; r++) {
  const dSat = new Date(l3StartDate.getTime() + (r - 1) * 7 * 86400000);
  const dSun = new Date(dSat.getTime() + 86400000);
  l3DatesByRound[r] = [formatDate(dSat), formatDate(dSun)];
}

console.log('L1 Round 1 dates:', l1DatesByRound[1]);
console.log('L3 Round 1 dates:', l3DatesByRound[1]);
