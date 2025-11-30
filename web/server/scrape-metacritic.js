// Metacritic data scraping utility
import https from 'https';
import http from 'http';
import * as cheerio from 'cheerio';

// Cache to avoid re-scraping the same pages
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Rate limiting - wait between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch HTML from URL
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirects
        return fetchHTML(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse Metacritic game page using cheerio
function parseMetacriticPage(html, url) {
  const $ = cheerio.load(html);
  const results = {
    criticScore: null,
    userScore: null,
    genre: null,
    releaseDate: null,
    publisher: null,
    title: null,
  };

  // Get game title
  results.title = $('h1').first().text().trim();

  // Get critic score
  const criticEl = $('.metascore_w.large.game').first();
  if (criticEl.length) {
    const criticText = criticEl.text().trim();
    const criticNum = parseInt(criticText);
    if (!isNaN(criticNum)) {
      results.criticScore = criticNum;
    }
  }

  // Get user score (usually in a different location)
  const userScoreEl = $('.metascore_w.user.large.game').first();
  if (userScoreEl.length) {
    const userText = userScoreEl.text().trim();
    const userNum = parseFloat(userText);
    if (!isNaN(userNum)) {
      results.userScore = userNum * 10; // Convert 0-10 scale to 0-100
    }
  }

  // Try alternative selectors
  if (!results.criticScore) {
    $('.metascore_w').each((i, el) => {
      const text = $(el).text().trim();
      const num = parseInt(text);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        if (!results.criticScore && $(el).closest('.metascore_anchor').length) {
          results.criticScore = num;
        }
      }
    });
  }

  // Get genre
  $('.summary_detail').each((i, el) => {
    const label = $(el).find('.label').text().trim();
    if (label.toLowerCase().includes('genre')) {
      results.genre = $(el).find('span').not('.label').text().trim();
    }
  });

  // Get release date
  $('.summary_detail').each((i, el) => {
    const label = $(el).find('.label').text().trim();
    if (label.toLowerCase().includes('release')) {
      results.releaseDate = $(el).find('span').not('.label').text().trim();
    }
  });

  // Get publisher
  $('.summary_detail').each((i, el) => {
    const label = $(el).find('.label').text().trim();
    if (label.toLowerCase().includes('publisher')) {
      results.publisher = $(el).find('span').not('.label').text().trim();
    }
  });

  return results;
}

// Get game data from Metacritic
export async function scrapeMetacriticGame(gameUrl) {
  // Check cache first
  const cacheKey = `game:${gameUrl}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    await delay(2000); // Rate limit: wait 2 seconds between requests
    
    const html = await fetchHTML(gameUrl);
    const data = parseMetacriticPage(html, gameUrl);
    
    // Cache result
    cache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
  } catch (error) {
    console.error(`Error scraping ${gameUrl}:`, error.message);
    return null;
  }
}

// Scrape multiple games from a Metacritic list page
export async function scrapeMetacriticList(listUrl, maxGames = 50) {
  try {
    await delay(2000);
    const html = await fetchHTML(listUrl);
    
    // Extract game URLs from list page
    const gameUrls = [];
    const urlRegex = /href="(\/game\/[^"]+)"[^>]*>/gi;
    let match;
    while ((match = urlRegex.exec(html)) !== null && gameUrls.length < maxGames) {
      const gamePath = match[1];
      if (gamePath && !gameUrls.includes(gamePath)) {
        gameUrls.push(`https://www.metacritic.com${gamePath}`);
      }
    }

    console.log(`Found ${gameUrls.length} games to scrape`);

    const results = [];
    for (let i = 0; i < Math.min(gameUrls.length, maxGames); i++) {
      const url = gameUrls[i];
      console.log(`Scraping game ${i + 1}/${gameUrls.length}: ${url}`);
      
      const gameData = await scrapeMetacriticGame(url);
      if (gameData && gameData.criticScore !== null && gameData.userScore !== null) {
        results.push({
          url,
          ...gameData,
          scoreDifference: gameData.criticScore - gameData.userScore,
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`Error scraping list ${listUrl}:`, error.message);
    return [];
  }
}

// Get aggregated statistics
export function calculateStatistics(games) {
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

    // Group by year
    if (game.releaseDate) {
      const yearMatch = game.releaseDate.match(/(\d{4})/);
      if (yearMatch) {
        const year = yearMatch[1];
        if (!stats.byYear[year]) {
          stats.byYear[year] = { count: 0, totalDiff: 0, games: [] };
        }
        stats.byYear[year].count++;
        stats.byYear[year].totalDiff += game.scoreDifference || 0;
        stats.byYear[year].games.push(game);
      }
    }

    // Group by genre
    if (game.genre) {
      const genres = game.genre.split(',').map(g => g.trim());
      genres.forEach(genre => {
        if (!stats.byGenre[genre]) {
          stats.byGenre[genre] = { count: 0, totalDiff: 0, games: [] };
        }
        stats.byGenre[genre].count++;
        stats.byGenre[genre].totalDiff += game.scoreDifference || 0;
        stats.byGenre[genre].games.push(game);
      });
    }
  });

  stats.averageCriticScore = totalCritic / games.length;
  stats.averageUserScore = totalUser / games.length;
  stats.averageDifference = totalDiff / games.length;

  // Calculate averages for year and genre groups
  Object.keys(stats.byYear).forEach(year => {
    stats.byYear[year].averageDifference = stats.byYear[year].totalDiff / stats.byYear[year].count;
  });

  Object.keys(stats.byGenre).forEach(genre => {
    stats.byGenre[genre].averageDifference = stats.byGenre[genre].totalDiff / stats.byGenre[genre].count;
  });

  return stats;
}

