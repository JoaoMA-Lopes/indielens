// Script to scrape Metacritic data and cache it
// Run this manually: node scrape-and-cache.js

import { scrapeMetacriticList, calculateStatistics } from './scrape-metacritic.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.resolve(__dirname, 'metacritic-cache.json');

// URLs to scrape (Metacritic game lists)
const SCRAPE_URLS = [
  'https://www.metacritic.com/browse/game/pc/all/all-time/metascore/',
  'https://www.metacritic.com/browse/game/pc/2024/metascore/',
  'https://www.metacritic.com/browse/game/pc/2023/metascore/',
];

async function main() {
  console.log('Starting Metacritic data scraping...');
  console.log('NOTE: This will respect rate limits (2 seconds between requests)');
  console.log('');

  const allGames = [];
  
  for (const url of SCRAPE_URLS) {
    console.log(`\nScraping: ${url}`);
    try {
      const games = await scrapeMetacriticList(url, 30); // Limit to 30 games per URL
      allGames.push(...games);
      console.log(`  ✓ Scraped ${games.length} games`);
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
  }

  if (allGames.length === 0) {
    console.error('\nNo games were scraped. Metacritic may have blocked the requests or changed their structure.');
    console.error('You can manually create metacritic-cache.json with sample data instead.');
    return;
  }

  console.log(`\nTotal games scraped: ${allGames.length}`);
  
  // Calculate statistics
  const stats = calculateStatistics(allGames);
  
  // Save to cache file
  const cacheData = {
    timestamp: new Date().toISOString(),
    games: allGames,
    stats
  };
  
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log(`\n✓ Data cached to: ${CACHE_FILE}`);
  console.log('\nStatistics:');
  console.log(`  Average Critic Score: ${stats.averageCriticScore.toFixed(1)}`);
  console.log(`  Average User Score: ${stats.averageUserScore.toFixed(1)}`);
  console.log(`  Average Difference: ${stats.averageDifference.toFixed(2)}`);
  console.log(`  Games by Year: ${Object.keys(stats.byYear).length}`);
  console.log(`  Games by Genre: ${Object.keys(stats.byGenre).length}`);
}

main().catch(console.error);

