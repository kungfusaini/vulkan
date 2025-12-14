const fs = require('node:fs').promises;
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function ensureFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, '', 'utf8');
  }
  return filePath;
}

function formatEntry(type, body) {
  const timestamp = new Date().toISOString();
  const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
  return `**[${timestamp}] - ${capitalizedType}**\n${body}\n\n`;
}

async function writeToMarkdown(type, body) {
  const validTypes = ['note', 'task', 'bookmark'];
  
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  if (!body || typeof body !== 'string') {
    throw new Error('Body must be a non-empty string');
  }
  
  await ensureDataDir();
  
  const filename = `${type.toLowerCase()}s.md`;
  const filePath = await ensureFile(filename);
  
  const entry = formatEntry(type, body);
  await fs.appendFile(filePath, entry, 'utf8');
  
  return {
    success: true,
    type,
    filename,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  writeToMarkdown
};