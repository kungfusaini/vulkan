const fs = require('node:fs').promises;
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

let categoryMap = new Map();
let loaded = false;

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadCategories() {
  if (loaded) return categoryMap;
  
  await ensureDataDir();
  
  try {
    const data = await fs.readFile(CATEGORIES_FILE, 'utf8');
    const categories = JSON.parse(data);
    
    categoryMap = new Map();
    for (const [category, subcategories] of Object.entries(categories)) {
      categoryMap.set(category, Array.isArray(subcategories) ? subcategories : []);
    }
  } catch (error) {
    // File doesn't exist or is corrupted, start with empty map
    categoryMap = new Map();
    await saveCategories();
  }
  
  loaded = true;
  return categoryMap;
}

async function saveCategories() {
  console.log('saveCategories called, categoryMap size:', categoryMap.size);
  try {
    await ensureDataDir();
    console.log('Data directory ensured');
    
    const categories = {};
    for (const [category, subcategories] of categoryMap.entries()) {
      categories[category] = subcategories;
    }
    console.log('Categories object to save:', JSON.stringify(categories));
    
    const categoriesJson = JSON.stringify(categories, null, 2);
    console.log('About to write to file:', CATEGORIES_FILE);
    
    await fs.writeFile(CATEGORIES_FILE, categoriesJson, 'utf8');
    console.log('File write completed successfully');
  } catch (error) {
    console.error('ERROR in saveCategories:', error);
    console.error('Save error details:', error.message);
    console.error('Save error code:', error.code);
    console.error('Save error stack:', error.stack);
    throw error;
  }
}

async function addCategory(category) {
  console.log('addCategory called with:', category);
  
  try {
    if (!category || typeof category !== 'string') {
      throw new Error('Category name is required and must be a string');
    }
    
    category = category.trim();
    if (category.length === 0) {
      throw new Error('Category name cannot be empty');
    }
    
    console.log('About to loadCategories...');
    await loadCategories();
    console.log('Categories loaded, current map size:', categoryMap.size);
    
    if (categoryMap.has(category)) {
      throw new Error(`Category "${category}" already exists`);
    }
    
    categoryMap.set(category, []);
    console.log('About to saveCategories...');
    
    try {
      await saveCategories();
      console.log('Categories saved successfully');
    } catch (saveError) {
      console.error('ERROR saving categories:', saveError);
      console.error('Save error stack:', saveError.stack);
      throw saveError;
    }
    
    return { category, subcategories: [] };
  } catch (error) {
    console.error('ERROR in addCategory:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

async function addSubcategory(category, subcategory) {
  if (!category || typeof category !== 'string') {
    throw new Error('Category name is required and must be a string');
  }
  
  if (!subcategory || typeof subcategory !== 'string') {
    throw new Error('Subcategory name is required and must be a string');
  }
  
  category = category.trim();
  subcategory = subcategory.trim();
  
  if (category.length === 0) {
    throw new Error('Category name cannot be empty');
  }
  
  if (subcategory.length === 0) {
    throw new Error('Subcategory name cannot be empty');
  }
  
  await loadCategories();
  
  if (!categoryMap.has(category)) {
    throw new Error(`Category "${category}" does not exist`);
  }
  
  const subcategories = categoryMap.get(category);
  if (subcategories.includes(subcategory)) {
    throw new Error(`Subcategory "${subcategory}" already exists in category "${category}"`);
  }
  
  subcategories.push(subcategory);
  categoryMap.set(category, subcategories);
  await saveCategories();
  
  return { category, subcategory };
}

async function getCategories() {
  await loadCategories();
  
  const categories = {};
  for (const [category, subcategories] of categoryMap.entries()) {
    categories[category] = [...subcategories];
  }
  
  return categories;
}

async function validateCategory(category) {
  await loadCategories();
  return categoryMap.has(category);
}

async function validateSubcategory(category, subcategory) {
  await loadCategories();
  return categoryMap.has(category) && categoryMap.get(category).includes(subcategory);
}

async function writeCategoriesFile(content) {
  await ensureDataDir();
  await fs.writeFile(CATEGORIES_FILE, content, 'utf8');
}

function clearCache() {
  loaded = false;
  categoryMap = new Map();
}

module.exports = {
  loadCategories,
  addCategory,
  addSubcategory,
  getCategories,
  validateCategory,
  validateSubcategory,
  clearCache,
  writeCategoriesFile
};