// Generate realistic sample data based on research findings
// This can be used if scraping doesn't work

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.resolve(__dirname, 'metacritic-cache.json');

// Sample data based on research:
// - 1996-2001: Critics were harsher (avg -0.5)
// - 2002-2008: Critics were harsher (avg -0.3)  
// - 2009-2012: Gap reversed, critics more positive (avg +0.8)
// - 2013-2018: Gap widened, critics more positive (avg +1.8)
// Genre bias: Walking sims +0.95, Cinematic +0.8, Platformers -0.6, FPS -0.4

function generateSampleGames() {
  const games = [];
  
  // 1996-2001 era (critics harsher)
  for (let i = 0; i < 25; i++) {
    const year = 1996 + Math.floor(Math.random() * 6);
    const criticScore = 60 + Math.floor(Math.random() * 30);
    const userScore = criticScore + 0.3 + Math.random() * 0.7; // Users rated higher
    games.push({
      title: `Game ${year}-${i}`,
      criticScore,
      userScore: Math.round(userScore * 10) / 10,
      genre: ['Action', 'Adventure', 'RPG', 'Strategy'][Math.floor(Math.random() * 4)],
      releaseDate: `${year}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      scoreDifference: criticScore - (Math.round(userScore * 10) / 10),
    });
  }
  
  // 2002-2008 era (critics harsher, but less so)
  for (let i = 0; i < 30; i++) {
    const year = 2002 + Math.floor(Math.random() * 7);
    const criticScore = 65 + Math.floor(Math.random() * 25);
    const userScore = criticScore + 0.2 + Math.random() * 0.4;
    games.push({
      title: `Game ${year}-${i}`,
      criticScore,
      userScore: Math.round(userScore * 10) / 10,
      genre: ['Action-Adventure', 'FPS', 'RPG', 'Strategy'][Math.floor(Math.random() * 4)],
      releaseDate: `${year}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      scoreDifference: criticScore - (Math.round(userScore * 10) / 10),
    });
  }
  
  // 2009-2012 era (gap reverses)
  for (let i = 0; i < 30; i++) {
    const year = 2009 + Math.floor(Math.random() * 4);
    const userScore = 60 + Math.floor(Math.random() * 30);
    const criticScore = userScore + 0.5 + Math.random() * 1.1; // Critics more positive
    games.push({
      title: `Game ${year}-${i}`,
      criticScore: Math.min(100, Math.round(criticScore)),
      userScore: Math.round(userScore * 10) / 10,
      genre: ['Action-Adventure', 'Walking Simulator', 'RPG', 'Cinematic'][Math.floor(Math.random() * 4)],
      releaseDate: `${year}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      scoreDifference: Math.min(100, Math.round(criticScore)) - (Math.round(userScore * 10) / 10),
    });
  }
  
  // 2013-2018 era (gap widens significantly - target +1.8 average)
  for (let i = 0; i < 50; i++) {
    const year = 2013 + Math.floor(Math.random() * 6);
    const userScore = 60 + Math.floor(Math.random() * 30);
    const criticScore = userScore + 1.6 + Math.random() * 0.4; // Target ~1.8 average gap
    games.push({
      title: `Game ${year}-${i}`,
      criticScore: Math.min(100, Math.round(criticScore)),
      userScore: Math.round(userScore * 10) / 10,
      genre: ['Walking Simulator', 'Action-Adventure', 'Cinematic', '3D Platformer', 'FPS'][Math.floor(Math.random() * 5)],
      releaseDate: `${year}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      scoreDifference: Math.min(100, Math.round(criticScore)) - (Math.round(userScore * 10) / 10),
    });
  }
  
  // Add genre-specific bias (only adjust, don't override completely)
  games.forEach(game => {
    const yearMatch = game.releaseDate?.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;
    
    // Only apply genre bias to games from 2009 onwards (when bias became more pronounced)
    if (year >= 2009) {
      if (game.genre === 'Walking Simulator') {
        // Add +0.95 bias on top of existing difference
        game.criticScore = Math.min(100, Math.round((game.criticScore + 0.95) * 10) / 10);
        game.scoreDifference = game.criticScore - game.userScore;
      } else if (game.genre === 'Cinematic' || game.genre === 'Action-Adventure') {
        // Add +0.8 bias
        game.criticScore = Math.min(100, Math.round((game.criticScore + 0.8) * 10) / 10);
        game.scoreDifference = game.criticScore - game.userScore;
      } else if (game.genre === '3D Platformer') {
        // Subtract 0.6 (critics penalize)
        game.criticScore = Math.max(0, Math.round((game.criticScore - 0.6) * 10) / 10);
        game.scoreDifference = game.criticScore - game.userScore;
      } else if (game.genre === 'FPS') {
        // Subtract 0.4
        game.criticScore = Math.max(0, Math.round((game.criticScore - 0.4) * 10) / 10);
        game.scoreDifference = game.criticScore - game.userScore;
      }
    }
  });
  
  return games;
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
      const yearMatch = game.releaseDate.match(/(\d{4})/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        let yearRange;
        if (year >= 1996 && year <= 2001) yearRange = '1996-2001';
        else if (year >= 2002 && year <= 2008) yearRange = '2002-2008';
        else if (year >= 2009 && year <= 2012) yearRange = '2009-2012';
        else if (year >= 2013 && year <= 2018) yearRange = '2013-2018';
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
    if (game.genre) {
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

function main() {
  console.log('Generating sample Metacritic data based on research findings...\n');
  
  const games = generateSampleGames();
  console.log(`Generated ${games.length} sample games`);
  
  const stats = calculateStatistics(games);
  
  const cacheData = {
    timestamp: new Date().toISOString(),
    games,
    stats,
    isSample: true,
  };
  
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log(`\n✓ Sample data saved to: ${CACHE_FILE}`);
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

main();

