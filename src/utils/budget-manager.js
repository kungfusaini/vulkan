const fs = require('node:fs').promises;
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');
const BUDGET_FILE = path.join(DATA_DIR, 'budget.json');

let budgetData = null;
let loaded = false;

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function createExampleBudget() {
  const exampleBudget = {
    "2025-12": {
      "Housing": 1000,
      "Shopping": 100,
      "Transport": 50,
      "Health": 50,
      "Food": 200,
      "Admin": 10
    }
  };
  
  await ensureDataDir();
  await fs.writeFile(BUDGET_FILE, JSON.stringify(exampleBudget, null, 2), 'utf8');
  return exampleBudget;
}

async function loadBudget() {
  if (loaded && budgetData !== null) return budgetData;
  
  await ensureDataDir();
  
  try {
    const data = await fs.readFile(BUDGET_FILE, 'utf8');
    budgetData = JSON.parse(data);
    loaded = true;
    return budgetData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create example budget
      budgetData = await createExampleBudget();
      loaded = true;
      return budgetData;
    }
    throw error;
  }
}



async function writeBudgetFile(content) {
  await ensureDataDir();
  await fs.writeFile(BUDGET_FILE, content, 'utf8');
  // Clear cache to force reload on next access
  clearCache();
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function duplicateLastMonth(targetMonth = null) {
  const budget = await loadBudget();
  const months = Object.keys(budget).sort(); // Sort chronologically
  
  if (months.length === 0) {
    throw new Error('No budget data found to duplicate');
  }
  
  const lastMonth = months[months.length - 1];
  const currentMonth = targetMonth || getCurrentMonth();
  
  // Duplicate last month's data to current month
  budget[currentMonth] = { ...budget[lastMonth] };
  
  await writeBudgetFile(JSON.stringify(budget, null, 2));
  await loadBudget(); // Reload to update cache
  
  return {
    sourceMonth: lastMonth,
    targetMonth: currentMonth,
    duplicatedBudget: budget[currentMonth]
  };
}

function clearCache() {
  loaded = false;
  budgetData = null;
}

module.exports = {
  loadBudget,
  writeBudgetFile,
  duplicateLastMonth,
  getCurrentMonth,
  clearCache
};