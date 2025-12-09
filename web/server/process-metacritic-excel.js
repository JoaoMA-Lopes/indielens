// Process Excel file from "Metacritic scraped data" directory
// Converts it to the JSON format expected by the server

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Excel file (adjust if needed)
const EXCEL_FILE = path.resolve(__dirname, '../Metacritic scraped data/METACRITIC STUFF.xlsx');
const OUTPUT_FILE = path.resolve(__dirname, 'metacritic-cache.json');

function processExcelData() {
  console.log('Reading Excel file:', EXCEL_FILE);
  
  if (!fs.existsSync(EXCEL_FILE)) {
    console.error('Excel file not found at:', EXCEL_FILE);
    console.error('Please ensure the file exists at: web/Metacritic scraped data/METACRITIC STUFF.xlsx');
    process.exit(1);
  }

  // Read the workbook
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0]; // Use first sheet
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const rawData = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`Found ${rawData.length} rows in Excel file`);
  
  // Process the data - adjust column names based on your Excel structure
  const games = rawData.map((row, index) => {
    // Try to find the relevant columns - adjust these based on your Excel structure
    const title = row['Title'] || row['Game'] || row['Name'] || row['Game Title'] || `Game ${index}`;
    const criticScore = parseFloat(row['Critic Score'] || row['Metascore'] || row['Critic'] || row['MC Score'] || 0);
    const userScore = parseFloat(row['User Score'] || row['User'] || row['User Rating'] || 0);
    const genre = row['Genre'] || row['Category'] || 'Unknown';
    const releaseDate = row['Release Date'] || row['Date'] || row['Year'] || null;
    
    // Calculate score difference (critic - user)
    const scoreDifference = criticScore - userScore;
    
    return {
      title: String(title),
      criticScore: isNaN(criticScore) ? 0 : Math.round(criticScore * 10) / 10,
      userScore: isNaN(userScore) ? 0 : Math.round(userScore * 10) / 10,
      genre: String(genre),
      releaseDate: releaseDate ? String(releaseDate) : null,
      scoreDifference: isNaN(scoreDifference) ? 0 : Math.round(scoreDifference * 10) / 10,
    };
  }).filter(game => game.criticScore > 0 || game.userScore > 0); // Filter out invalid entries
  
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

