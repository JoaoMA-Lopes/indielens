// Process Excel file from "Metacritic scraped data" directory
// Converts it to the JSON format expected by the server

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Excel file - check multiple locations
const possiblePaths = [
  path.resolve(__dirname, '../Metacritic scraped data/METACRITIC STUFF.xlsx'),
  path.resolve(__dirname, 'METACRITIC STUFF.xlsx'),
  path.resolve(__dirname, '../Metacritic scraped data/METACRITIC STUFF.xlsx'),
];

const OUTPUT_FILE = path.resolve(__dirname, 'metacritic-cache.json');

function processExcelData() {
  // Find the Excel file
  let EXCEL_FILE = null;
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      EXCEL_FILE = filePath;
      break;
    }
  }
  
  if (!EXCEL_FILE) {
    console.error('Excel file not found. Tried:');
    possiblePaths.forEach(p => console.error('  -', p));
    console.error('\nPlease upload the Excel file to one of these locations.');
    process.exit(1);
  }
  
  console.log('Reading Excel file:', EXCEL_FILE);

  // Read the workbook
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0]; // Use first sheet
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const rawData = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`Found ${rawData.length} rows in Excel file`);
  
  // Debug: Show first row to see column names
  if (rawData.length > 0) {
    console.log('\nFirst row sample (to identify column names):');
    console.log(Object.keys(rawData[0]));
    console.log('Sample data:', JSON.stringify(rawData[0], null, 2));
  }
  
  // Find column names by trying common variations
  const firstRow = rawData[0] || {};
  const allKeys = Object.keys(firstRow);
  
  // Find title column
  const titleKey = allKeys.find(k => 
    /title|game|name/i.test(k) && !/score|rating|date|year|genre/i.test(k)
  ) || allKeys[0] || 'Title';
  
  // Find critic score column
  const criticKey = allKeys.find(k => 
    /critic|metascore|mc.*score/i.test(k)
  ) || allKeys.find(k => /score/i.test(k) && !/user/i.test(k)) || 'Critic Score';
  
  // Find user score column
  const userKey = allKeys.find(k => 
    /user.*score|user.*rating/i.test(k)
  ) || allKeys.find(k => /user/i.test(k)) || 'User Score';
  
  // Find genre column
  const genreKey = allKeys.find(k => 
    /genre|category|type/i.test(k)
  ) || 'Genre';
  
  // Find date/year column
  const dateKey = allKeys.find(k => 
    /date|year|release/i.test(k)
  ) || 'Release Date';
  
  console.log(`\nDetected columns:`);
  console.log(`  Title: ${titleKey}`);
  console.log(`  Critic Score: ${criticKey}`);
  console.log(`  User Score: ${userKey}`);
  console.log(`  Genre: ${genreKey}`);
  console.log(`  Date: ${dateKey}\n`);
  
  // Process the data
  const games = rawData.map((row, index) => {
    const title = row[titleKey] || `Game ${index}`;
    
    // Parse scores - handle various formats
    let criticScore = 0;
    let userScore = 0;
    
    const criticVal = row[criticKey];
    const userVal = row[userKey];
    
    if (criticVal !== null && criticVal !== undefined && criticVal !== '') {
      criticScore = parseFloat(criticVal);
      if (isNaN(criticScore)) criticScore = 0;
    }
    
    if (userVal !== null && userVal !== undefined && userVal !== '') {
      userScore = parseFloat(userVal);
      if (isNaN(userScore)) userScore = 0;
    }
    
    const genre = row[genreKey] || 'Unknown';
    
    // Parse date - handle Excel date numbers, strings, etc.
    let releaseDate = null;
    const dateVal = row[dateKey];
    if (dateVal !== null && dateVal !== undefined && dateVal !== '') {
      // If it's an Excel date number (like 44927)
      if (typeof dateVal === 'number' && dateVal > 1000 && dateVal < 100000) {
        // Convert Excel date number to date string
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + dateVal * 86400000);
        releaseDate = date.toISOString().split('T')[0];
      } else {
        // Try to parse as date string
        const dateStr = String(dateVal);
        // Try to extract year from various formats
        const yearMatch = dateStr.match(/(\d{4})/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          if (year >= 1990 && year <= 2030) {
            // If it's just a year, use Jan 1
            if (dateStr.match(/^\d{4}$/)) {
              releaseDate = `${year}-01-01`;
            } else {
              // Try to parse full date
              const parsed = new Date(dateStr);
              if (!isNaN(parsed.getTime())) {
                releaseDate = parsed.toISOString().split('T')[0];
              } else {
                releaseDate = `${year}-01-01`;
              }
            }
          }
        }
      }
    }
    
    // Calculate score difference (critic - user)
    const scoreDifference = criticScore - userScore;
    
    return {
      title: String(title),
      criticScore: Math.round(criticScore * 10) / 10,
      userScore: Math.round(userScore * 10) / 10,
      genre: String(genre),
      releaseDate: releaseDate,
      scoreDifference: Math.round(scoreDifference * 10) / 10,
    };
  }).filter(game => game.criticScore > 0); // Only keep games with valid critic scores
  
  console.log(`Processed ${games.length} valid games`);
  
  // Calculate statistics
  const stats = calculateStatistics(games);
  
  const cacheData = {
    timestamp: new Date().toISOString(),
    games,
    stats,
    isSample: false,
    source: 'Metacritic Excel Data',
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cacheData, null, 2));
  console.log(`\n✓ Processed data saved to: ${OUTPUT_FILE}`);
  console.log('\nStatistics:');
  console.log(`  Average Critic Score: ${stats.averageCriticScore.toFixed(1)}`);
  console.log(`  Average User Score: ${stats.averageUserScore.toFixed(1)}`);
  console.log(`  Average Difference: ${stats.averageDifference.toFixed(2)}`);
  console.log(`  Games by Year Range: ${Object.keys(stats.byYear).length}`);
  Object.keys(stats.byYear).forEach(range => {
    console.log(`    ${range}: ${stats.byYear[range].averageDifference > 0 ? '+' : ''}${stats.byYear[range].averageDifference.toFixed(2)} (${stats.byYear[range].count} games)`);
  });
  console.log(`  Games by Genre: ${Object.keys(stats.byGenre).length}`);
  Object.keys(stats.byGenre).forEach(genre => {
    console.log(`    ${genre}: ${stats.byGenre[genre].averageDifference > 0 ? '+' : ''}${stats.byGenre[genre].averageDifference.toFixed(2)} (${stats.byGenre[genre].count} games)`);
  });
}

function calculateStatistics(games) {
  const stats = {
    totalGames: games.length,
    averageCriticScore: 0,
    averageUserScore: 0,
    averageDifference: 0,
    byYear: {},
    byGenre: {},
  };

  if (games.length === 0) return stats;

  let totalCritic = 0;
  let totalUser = 0;
  let totalDiff = 0;

  games.forEach(game => {
    if (game.criticScore !== null) totalCritic += game.criticScore;
    if (game.userScore !== null) totalUser += game.userScore;
    if (game.scoreDifference !== null) totalDiff += game.scoreDifference;

    // Group by year range
    if (game.releaseDate) {
      // Try to extract year from various date formats
      let year = null;
      const yearMatch = String(game.releaseDate).match(/(\d{4})/);
      if (yearMatch) {
        year = parseInt(yearMatch[1]);
      }
      
      if (year) {
        let yearRange;
        if (year >= 1996 && year <= 2001) yearRange = '1996-2001';
        else if (year >= 2002 && year <= 2008) yearRange = '2002-2008';
        else if (year >= 2009 && year <= 2012) yearRange = '2009-2012';
        else if (year >= 2013 && year <= 2018) yearRange = '2013-2018';
        else if (year >= 2019 && year <= 2024) yearRange = '2019-2024';
        else yearRange = year.toString();
        
        if (!stats.byYear[yearRange]) {
          stats.byYear[yearRange] = { count: 0, totalDiff: 0, games: [] };
        }
        stats.byYear[yearRange].count++;
        stats.byYear[yearRange].totalDiff += game.scoreDifference || 0;
        stats.byYear[yearRange].games.push(game);
      }
    }

    // Group by genre
    if (game.genre && game.genre !== 'Unknown') {
      const genre = game.genre;
      if (!stats.byGenre[genre]) {
        stats.byGenre[genre] = { count: 0, totalDiff: 0, games: [] };
      }
      stats.byGenre[genre].count++;
      stats.byGenre[genre].totalDiff += game.scoreDifference || 0;
      stats.byGenre[genre].games.push(game);
    }
  });

  stats.averageCriticScore = totalCritic / games.length;
  stats.averageUserScore = totalUser / games.length;
  stats.averageDifference = totalDiff / games.length;

  // Calculate averages for year and genre groups
  Object.keys(stats.byYear).forEach(yearRange => {
    stats.byYear[yearRange].averageDifference = stats.byYear[yearRange].totalDiff / stats.byYear[yearRange].count;
  });

  Object.keys(stats.byGenre).forEach(genre => {
    stats.byGenre[genre].averageDifference = stats.byGenre[genre].totalDiff / stats.byGenre[genre].count;
  });

  return stats;
}

// Run the processor
try {
  processExcelData();
} catch (error) {
  console.error('Error processing Excel file:', error);
  console.error('\nPlease check:');
  console.error('1. The Excel file exists at: web/Metacritic scraped data/METACRITIC STUFF.xlsx');
  console.error('2. The xlsx package is installed: npm install xlsx');
  console.error('3. The Excel file has the expected column names (Title, Critic Score, User Score, Genre, Release Date)');
  process.exit(1);
}

