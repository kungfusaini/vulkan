const fs = require('node:fs').promises;
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');
const CSV_FILE = path.join(DATA_DIR, 'financial_data.csv');
const HEADERS = 'Date,Name,Amount,Category,SubCategory,PaymentMethod,Notes';

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function ensureCsvFile() {
  await ensureDataDir();
  
  try {
    await fs.access(CSV_FILE);
  } catch {
    await fs.writeFile(CSV_FILE, HEADERS + '\n', 'utf8');
  }
}

function validateDate(date) {
  if (!date || typeof date !== 'string') {
    throw new Error('Date is required and must be a string');
  }
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }
  
  const parsedDate = new Date(date);
  const now = new Date();
  
  // Check if it's a valid date
  if (isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date');
  }
  
  // Check if date is not too far in the future or past (reasonable range)
  const maxFuture = new Date();
  maxFuture.setFullYear(maxFuture.getFullYear() + 1);
  const minPast = new Date();
  minPast.setFullYear(minPast.getFullYear() - 10);
  
  if (parsedDate > maxFuture) {
    throw new Error('Date cannot be more than 1 year in the future');
  }
  
  if (parsedDate < minPast) {
    throw new Error('Date cannot be more than 10 years in the past');
  }
  
  return true;
}

function validateName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Name is required and must be a string');
  }
  
  name = name.trim();
  if (name.length === 0) {
    throw new Error('Name cannot be empty');
  }
  
  if (name.length > 100) {
    throw new Error('Name cannot be longer than 100 characters');
  }
  
  return name.trim();
}

function validateAmount(amount) {
  if (amount === null || amount === undefined) {
    throw new Error('Amount is required');
  }
  
  // Convert to number if it's a string
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    throw new Error('Amount must be a valid number');
  }
  
  if (numAmount <= 0) {
    throw new Error('Amount must be positive');
  }
  
  if (numAmount > 999999.99) {
    throw new Error('Amount cannot exceed 999,999.99');
  }
  
  // Check decimal places
  const decimalPlaces = (numAmount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    throw new Error('Amount cannot have more than 2 decimal places');
  }
  
  return numAmount;
}

function validatePaymentMethod(paymentMethod) {
  if (!paymentMethod || typeof paymentMethod !== 'string') {
    throw new Error('Payment method is required and must be a string');
  }
  
  const validMethods = ['credit', 'debit'];
  const method = paymentMethod.toLowerCase().trim();
  
  if (!validMethods.includes(method)) {
    throw new Error('Payment method must be either "credit" or "debit"');
  }
  
  return method;
}

function escapeCsvField(field) {
  if (field === null || field === undefined) {
    return '';
  }
  
  const stringField = String(field);
  
  // If field contains comma, newline, or quotes, wrap in quotes and escape quotes
  if (stringField.includes(',') || stringField.includes('\n') || stringField.includes('"')) {
    return '"' + stringField.replace(/"/g, '""') + '"';
  }
  
  return stringField;
}

async function addEntry(entry) {
  const { date, name, amount, category, subcategory, payment_method, notes } = entry;
  
  // Validate all fields
  validateDate(date);
  const validName = validateName(name);
  const validAmount = validateAmount(amount);
  const validPaymentMethod = validatePaymentMethod(payment_method);
  
  // Category and subcategory validation should be done in the route
  // after checking with category manager
  
  // Notes is optional
  const validNotes = notes ? String(notes).trim() : '';
  
  await ensureCsvFile();
  
  // Create CSV line
  const csvLine = [
    escapeCsvField(date),
    escapeCsvField(validName),
    escapeCsvField(validAmount.toFixed(2)),
    escapeCsvField(category),
    escapeCsvField(subcategory),
    escapeCsvField(validPaymentMethod),
    escapeCsvField(validNotes)
  ].join(',');
  
  // Append to file
  await fs.appendFile(CSV_FILE, csvLine + '\n', 'utf8');
  
  // Return the exact line that was added (for preview)
  return csvLine;
}

async function getAllEntries() {
  try {
    await ensureCsvFile();
    const content = await fs.readFile(CSV_FILE, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await ensureCsvFile();
      return HEADERS + '\n';
    }
    throw error;
  }
}

async function getEntriesAsArray() {
  const content = await getAllEntries();
  const lines = content.trim().split('\n');
  
  if (lines.length <= 1) {
    return [];
  }
  
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      // Simple CSV parsing (assuming no escaped commas in this context)
      const fields = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      if (fields && fields.length === 7) {
        entries.push({
          date: fields[0].replace(/^"|"$/g, ''),
          name: fields[1].replace(/^"|"$/g, ''),
          amount: parseFloat(fields[2]),
          category: fields[3].replace(/^"|"$/g, ''),
          subcategory: fields[4].replace(/^"|"$/g, ''),
          payment_method: fields[5].replace(/^"|"$/g, ''),
          notes: fields[6].replace(/^"|"$/g, '')
        });
      }
    }
  }
  
  return entries;
}

module.exports = {
  addEntry,
  getAllEntries,
  getEntriesAsArray,
  validateDate,
  validateName,
  validateAmount,
  validatePaymentMethod
};