import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mysql from 'mysql2/promise';

// Lazy load bcrypt to avoid crashing if not installed
let bcryptCache = { loaded: false, module: null, promise: null };

async function getBcrypt() {
  if (bcryptCache.loaded) {
    return bcryptCache.module;
  }
  
  if (bcryptCache.promise === null) {
    bcryptCache.promise = (async () => {
      try {
        const bcryptModule = await import('bcrypt');
        const bcrypt = bcryptModule.default || bcryptModule;
        bcryptCache.module = bcrypt;
        bcryptCache.loaded = true;
        return bcrypt;
      } catch (e) {
        console.error('WARNING: bcrypt module not found. Please run: npm install bcrypt');
        console.error('Registration and login features will not work without bcrypt.');
        bcryptCache.module = null;
        bcryptCache.loaded = true;
        return null;
      }
    })();
  }
  
  return await bcryptCache.promise;
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
// Serve genre title images
app.use('/genre-images', express.static(path.resolve(__dirname, '../Genretitles')));

const PORT = process.env.PORT || 5179;
const exePath = process.env.INDIELENS_EXE || path.resolve(__dirname, '../../cpp/ConsoleApplication1/x64/Release/ConsoleApplication1.exe');
const cfgPath = process.env.INDIELENS_CONFIG || path.resolve(__dirname, '../../cpp/config.json');
let dbPool = null;
try {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  dbPool = mysql.createPool({
    host: cfg.mysql.host || '127.0.0.1',
    port: 3306,
    user: cfg.mysql.user,
    password: cfg.mysql.password,
    database: cfg.mysql.schema,
    waitForConnections: true,
    connectionLimit: 5
  });
} catch (e) {
  console.warn('DB pool not initialized, browse names may be missing:', e.message);
}

const scoresPath = path.resolve(__dirname, './scores.json');
function readScores() {
  try { return JSON.parse(fs.readFileSync(scoresPath, 'utf-8')); } catch { return {}; }
}
function writeScores(obj) {
  fs.writeFileSync(scoresPath, JSON.stringify(obj));
}

// Calculate weighted mean score from database user_ratings table
// Returns { score: number, popularity: number } or null if no ratings exist
async function getGameScoreFromDB(appid) {
  if (!dbPool) return null;
  
  try {
    await initUserRatingsTable();
    const [rows] = await dbPool.query(
      `SELECT 
        SUM(weight) as sum_weights,
        SUM(rating * weight) as sum_weighted,
        COUNT(*) as rating_count
      FROM user_ratings
      WHERE appid = ?`,
      [appid]
    );
    
    if (rows.length === 0 || !rows[0].sum_weights || rows[0].sum_weights === 0) {
      return null; // No ratings
    }
    
    const sumWeights = parseFloat(rows[0].sum_weights);
    const sumWeighted = parseFloat(rows[0].sum_weighted);
    const ratingCount = parseInt(rows[0].rating_count);
    
    return {
      score: sumWeighted / sumWeights,
      popularity: sumWeights,
      ratingCount: ratingCount
    };
  } catch (e) {
    console.error(`[ERROR] getGameScoreFromDB(${appid}):`, e.message);
    return null;
  }
}

function extractJson(text) {
  // Try strict parse first
  try { return JSON.parse(text); } catch {}
  // Heuristic: take the last JSON object in the output
  const lastOpen = text.lastIndexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (lastOpen !== -1 && lastClose !== -1 && lastClose > lastOpen) {
    const candidate = text.slice(lastOpen, lastClose + 1);
    try { return JSON.parse(candidate); } catch {}
  }
  // Try line-by-line
  const lines = text.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try { return JSON.parse(trimmed); } catch {}
    }
  }
  throw new Error('Failed to parse JSON from CLI output');
}

function runCli(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { cwd: path.resolve(__dirname, '../../cpp/ConsoleApplication1/ConsoleApplication1') });
    let out = '';
    let err = '';
    let timeoutId = null;
    
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }
    
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', code => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!out.trim() && err) return reject(new Error(err));
      try {
        const json = extractJson(out.trim());
        resolve(json);
      } catch (e) {
        reject(new Error(out || err || e.message));
      }
    });
    child.on('error', e => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(e);
    });
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/ingest', async (req, res) => {
  try {
    const { steamId } = req.body;
    if (!steamId) return res.status(400).json({ error: 'steamId required' });
    const result = await runCli(['--ingest', String(steamId)]);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Initialize user_accounts table if it doesn't exist
async function initUserAccountsTable() {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        steam_friend_code VARCHAR(20),
        steamid BIGINT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_username (username),
        INDEX idx_steamid (steamid)
      ) ENGINE=InnoDB
    `);
  } catch (e) {
    console.warn('Could not create user_accounts table:', e.message);
  }
}

// Register new user account
app.post('/register', async (req, res) => {
  try {
    const bcrypt = await getBcrypt();
    if (!bcrypt) {
      return res.status(500).json({ error: 'Server error: bcrypt module not installed. Please run: npm install bcrypt' });
    }
    
    const { email, username, password, steamFriendCode } = req.body;
    
    console.log(`[DEBUG] Registration attempt: email=${email}, username=${username}, steamFriendCode=${steamFriendCode}`);
    
    if (!email || !username || !password || !steamFriendCode) {
      console.log(`[DEBUG] Registration missing fields: email=${!!email}, username=${!!username}, password=${!!password}, steamFriendCode=${!!steamFriendCode}`);
      return res.status(400).json({ error: 'Email, username, password, and Steam friend code are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate username (15 chars max, letters and numbers only)
    if (username.length > 15 || !/^[a-zA-Z0-9]+$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 15 characters max, letters and numbers only' });
    }
    
    // Validate password (at least 6 characters with 1 number and special character)
    if (password.length < 6 || !/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters with 1 number and special character' });
    }
    
    // Convert friend code to SteamID64
    const base = BigInt('76561197960265728');
    let steamId;
    try {
      steamId = (BigInt(steamFriendCode) + base).toString();
    } catch (e) {
      return res.status(400).json({ error: 'Invalid Steam friend code' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert user account
    if (!dbPool) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    await initUserAccountsTable();
    
    try {
      // Check if steamId already exists
      const [existingRows] = await dbPool.query(
        'SELECT id, username, email FROM user_accounts WHERE steamid = ?',
        [steamId]
      );
      
      if (existingRows.length > 0) {
        const existing = existingRows[0];
        return res.status(400).json({ 
          error: `This Steam account is already registered as "${existing.username}" (${existing.email}). Please log in instead.` 
        });
      }
      
      console.log(`[DEBUG] Inserting user: email=${email}, username=${username}, steamFriendCode=${steamFriendCode}, steamId=${steamId}`);
      const [result] = await dbPool.query(
        'INSERT INTO user_accounts (email, username, password_hash, steam_friend_code, steamid) VALUES (?, ?, ?, ?, ?)',
        [email, username, passwordHash, steamFriendCode, steamId]
      );
      console.log(`[DEBUG] User inserted successfully with ID: ${result.insertId}`);
      
      // Verify the friend code was stored
      const [verifyRows] = await dbPool.query(
        'SELECT steam_friend_code FROM user_accounts WHERE id = ?',
        [result.insertId]
      );
      console.log(`[DEBUG] Verified stored friend code: ${verifyRows[0]?.steam_friend_code}`);
      
      console.log(`[DEBUG] Registration successful: steamId=${steamId}, username=${username}, email=${email}, steamFriendCode=${steamFriendCode}`);
      
      // Ensure steamId is returned as a string (same format as login endpoint)
      res.json({ status: 'ok', message: 'Registration successful', steamId: String(steamId), username });
      
      // Ingest user's Steam library asynchronously (don't wait for it)
      // This prevents the registration from hanging if ingestion takes too long
      runCli(['--ingest', steamId]).catch(e => {
        console.warn('Steam ingestion failed during registration (async):', e.message);
      });
    } catch (dbError) {
      if (dbError.code === 'ER_DUP_ENTRY') {
        if (dbError.message.includes('email')) {
          return res.status(400).json({ error: 'Email already registered' });
        } else if (dbError.message.includes('username')) {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }
      throw dbError;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login with email and password
app.post('/login', async (req, res) => {
  try {
    const bcrypt = await getBcrypt();
    if (!bcrypt) {
      return res.status(500).json({ error: 'Server error: bcrypt module not installed. Please run: npm install bcrypt' });
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database not available' });
    }
    
    await initUserAccountsTable();
    
    // Find user by email
    const [rows] = await dbPool.query(
      'SELECT id, email, username, password_hash, steamid, steam_friend_code FROM user_accounts WHERE email = ?',
      [email]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = rows[0];
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Return steamId for the frontend
    res.json({ 
      status: 'ok', 
      steamId: user.steamid.toString(),
      username: user.username
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Owned games list (via CLI --owned)
app.get('/owned', async (req, res) => {
  try {
    const { steamId } = req.query;
    if (!steamId) return res.status(400).json({ error: 'steamId required' });
    const result = await runCli(['--owned', String(steamId)]);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Preview weighting breakdown without saving
app.post('/preview-weighting', async (req, res) => {
  try {
    const { steamId, appid, rating } = req.body;
    if (!steamId || !appid || rating == null) return res.status(400).json({ status: 'error', error: 'steamId, appid, rating required' });
    
    console.log(`[DEBUG] /preview-weighting called: steamId=${steamId}, appid=${appid}, rating=${rating}`);
    
    let result;
    try {
      result = await runCli(['--rate', String(steamId), String(appid), String(rating)]);
      console.log(`[DEBUG] /preview-weighting: C++ backend returned result`);
    } catch (e) {
      // C++ backend unavailable, use fallback calculation
      // Only log if it's not the expected ENOENT error (executable not found)
      if (!e.message.includes('ENOENT') && !e.message.includes('spawn')) {
        console.warn('[WARN] C++ backend unavailable for preview, using fallback weight calculation:', e.message);
      } else {
        console.log(`[DEBUG] /preview-weighting: C++ backend not found, using fallback calculation`);
      }
      const fallback = await calculateWeightFallback(steamId, appid);
      result = {
        raw: Number(rating),
        breakdown: {
          weight: fallback.weight,
          profileMatch: fallback.profileMatch,
          engagement: fallback.engagement,
          penaltyAPH: fallback.penaltyAPH
        }
      };
      console.log(`[DEBUG] /preview-weighting: Fallback result: weight=${result.breakdown.weight}, engagement=${result.breakdown.engagement}`);
    }
    
    // Return the breakdown without updating scores
    res.json({ 
      status: 'ok',
      breakdown: result.breakdown || {},
      raw: Number(rating),
      weight: result.breakdown?.weight ?? 0,
      weightedScore: (Number(rating) * (result.breakdown?.weight ?? 0)).toFixed(1)
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Initialize user ratings table
async function initUserRatingsTable() {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_ratings (
        steamid BIGINT UNSIGNED NOT NULL,
        appid INT UNSIGNED NOT NULL,
        rating INT NOT NULL,
        review_text TEXT,
        weight DECIMAL(10, 4) NOT NULL,
        weighted_score DECIMAL(10, 2) NOT NULL,
        profile_match DECIMAL(5, 4),
        engagement DECIMAL(5, 4),
        achievement_penalty DECIMAL(5, 4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (steamid, appid),
        INDEX idx_appid (appid),
        INDEX idx_steamid (steamid)
      ) ENGINE=InnoDB
    `);
  } catch (e) {
    console.warn('Could not create user_ratings table:', e.message);
  }
}

// Simplified weight calculation when C++ backend is unavailable
async function calculateWeightFallback(steamId, appid) {
  if (!dbPool) {
    console.log(`[DEBUG] calculateWeightFallback: No dbPool for steamId=${steamId}, appid=${appid}`);
    return { weight: 0.5, profileMatch: 0.75, engagement: 0.5, penaltyAPH: 1.0 };
  }
  
  try {
    // Get user's playtime and achievements for this game
    const [gameRows] = await dbPool.query(
      `SELECT ug.playtime_forever,
              (SELECT COUNT(*) FROM user_achievements ua WHERE ua.steamid = ? AND ua.appid = ?) as unlocked_count,
              (SELECT COUNT(*) FROM game_achievements ga WHERE ga.appid = ?) as total_achievements
       FROM user_games ug
       WHERE ug.steamid = ? AND ug.appid = ?`,
      [steamId, appid, appid, steamId, appid]
    );
    
    console.log(`[DEBUG] calculateWeightFallback: steamId=${steamId}, appid=${appid}, found ${gameRows.length} rows`);
    
    if (gameRows.length === 0) {
      console.log(`[DEBUG] calculateWeightFallback: No game data found, using defaults`);
      return { weight: 0.5, profileMatch: 0.75, engagement: 0.5, penaltyAPH: 1.0 };
    }
    
    const row = gameRows[0];
    const hours = Math.max(0, (row.playtime_forever || 0) / 60.0);
    const totalAch = row.total_achievements || 0;
    const unlockedAch = row.unlocked_count || 0;
    const achievementPct = totalAch > 0 ? unlockedAch / totalAch : 0;
    
    console.log(`[DEBUG] calculateWeightFallback: hours=${hours.toFixed(2)}, totalAch=${totalAch}, unlockedAch=${unlockedAch}, achievementPct=${(achievementPct * 100).toFixed(1)}%`);
    
    // Calculate engagement using same formula as C++
    const hhalf = 20;
    const nonlinearhours = hours / (hours + hhalf);
    
    let raw_engagement;
    if (totalAch === 0) {
      // Games with no achievements: use only hours (nonlinear)
      raw_engagement = nonlinearhours;
    } else {
      // Games with achievements: use weighted combination
      const a = 0.5;
      raw_engagement = (a * nonlinearhours) + ((1.0 - a) * achievementPct);
    }
    
    console.log(`[DEBUG] calculateWeightFallback: nonlinearhours=${nonlinearhours.toFixed(3)}, raw_engagement=${raw_engagement.toFixed(3)}`);
    
    // Scale engagement to achieve 12x ratio: 200h+100% = 12x weight of 2h+2%
    // For 213h+92%: raw_engagement ≈ 0.917, should give much higher engagement
    // Use a scaling that properly rewards high engagement
    const base_raw = 0.0555;  // 2h+2% baseline
    const target_raw = 0.9545; // 200h+100% target
    const base_engagement = 0.01;  // Minimum engagement (2h+2%)
    // For 200h+100%, engagement should be 12x base = 0.12
    // But we want higher values for very engaged players, so scale more aggressively
    const target_engagement = 0.50; // Higher target for 200h+100% (allows room for 213h+92%)
    
    let engagement;
    if (raw_engagement <= base_raw) {
      engagement = base_engagement;
    } else if (raw_engagement >= target_raw) {
      // For very high engagement (above 200h+100%), scale up to near maximum
      const excess = (raw_engagement - target_raw) / (1.0 - target_raw);
      engagement = target_engagement + excess * (0.90 - target_engagement);
    } else {
      // Interpolate between base and target
      const ratio = (raw_engagement - base_raw) / (target_raw - base_raw);
      // Use a curve that accelerates for higher values
      const curvedRatio = Math.pow(ratio, 0.7);
      engagement = base_engagement + curvedRatio * (target_engagement - base_engagement);
    }
    
    // Clamp to reasonable bounds [0.01, 1.0]
    if (engagement < 0.01) engagement = 0.01;
    if (engagement > 1.0) engagement = 1.0;
    
    console.log(`[DEBUG] calculateWeightFallback: engagement=${(engagement * 100).toFixed(1)}%`);
    
    // Calculate profile match: check how many similar games user has
    // Similar = same genre or tag overlap
    let profileMatch = 0.75; // Default neutral-positive
    try {
      const [similarRows] = await dbPool.query(
        `SELECT COUNT(DISTINCT ug2.appid) as similar_count
         FROM user_games ug2
         INNER JOIN game_genres gg1 ON gg1.appid = ?
         INNER JOIN game_genres gg2 ON gg2.appid = ug2.appid AND gg2.genre = gg1.genre
         WHERE ug2.steamid = ? AND ug2.appid != ?
         UNION ALL
         SELECT COUNT(DISTINCT ug2.appid) as similar_count
         FROM user_games ug2
         INNER JOIN game_tags gt1 ON gt1.appid = ?
         INNER JOIN game_tags gt2 ON gt2.appid = ug2.appid AND gt2.tag = gt1.tag
         WHERE ug2.steamid = ? AND ug2.appid != ?`,
        [appid, steamId, appid, appid, steamId, appid]
      );
      
      // If user has similar games, increase profile match
      // Scale: 0 similar = 0.5, 5+ similar = 0.9, 10+ similar = 1.0
      const similarCount = similarRows.reduce((sum, r) => sum + (r.similar_count || 0), 0);
      if (similarCount > 0) {
        profileMatch = Math.min(0.5 + (similarCount * 0.08), 1.0);
      } else {
        // If no similar games but high hours, still give decent match
        profileMatch = hours > 50 ? 0.7 : 0.5;
      }
    } catch (e) {
      // If profile match calculation fails, use hours-based estimate
      profileMatch = hours > 100 ? 0.85 : hours > 50 ? 0.75 : 0.65;
    }
    
    // Achievement penalty: if user has very low achievement rate compared to hours, apply penalty
    let penaltyAPH = 1.0;
    if (totalAch > 0 && hours > 2) {
      const achievementsPerHour = achievementPct / hours;
      // If achievements per hour is very low (< 0.01), apply gentle penalty
      if (achievementsPerHour < 0.01 && hours > 10) {
        penaltyAPH = Math.max(0.8, achievementsPerHour * 100);
      }
    }
    
    const weight = profileMatch * engagement * penaltyAPH;
    
    console.log(`[DEBUG] calculateWeightFallback: profileMatch=${(profileMatch * 100).toFixed(1)}%, penaltyAPH=${(penaltyAPH * 100).toFixed(1)}%, final_weight=${weight.toFixed(4)}`);
    
    return { weight, profileMatch, engagement, penaltyAPH };
  } catch (e) {
    console.error('[ERROR] calculateWeightFallback:', e.message);
    return { weight: 0.5, profileMatch: 0.75, engagement: 0.5, penaltyAPH: 1.0 };
  }
}

app.post('/rate', async (req, res) => {
  try {
    const { steamId, appid, rating, reviewText } = req.body;
    if (!steamId || !appid || rating == null) return res.status(400).json({ error: 'steamId, appid, rating required' });
    
    let result;
    try {
      result = await runCli(['--rate', String(steamId), String(appid), String(rating)]);
    } catch (e) {
      // C++ backend unavailable, use fallback calculation
      // Only log if it's not the expected ENOENT error (executable not found)
      if (!e.message.includes('ENOENT') && !e.message.includes('spawn')) {
        console.warn('[WARN] C++ backend unavailable, using fallback weight calculation:', e.message);
      }
      const fallback = await calculateWeightFallback(steamId, appid);
      result = {
        raw: Number(rating),
        breakdown: {
          weight: fallback.weight,
          profileMatch: fallback.profileMatch,
          engagement: fallback.engagement,
          penaltyAPH: fallback.penaltyAPH
        }
      };
    }
    
    // Store rating in database
    if (dbPool) {
      await initUserRatingsTable();
      const weight = result?.breakdown?.weight ?? 0;
      const raw = result?.raw ?? rating;
      const weightedScore = raw * weight;
      
      // Add review_text column if it doesn't exist (for existing tables)
      try {
        await dbPool.query('ALTER TABLE user_ratings ADD COLUMN review_text TEXT');
      } catch (e) {
        // Column already exists, ignore
        if (!e.message.includes('Duplicate column name')) {
          console.warn('Could not add review_text column:', e.message);
        }
      }
      
      await dbPool.query(
        `INSERT INTO user_ratings 
         (steamid, appid, rating, review_text, weight, weighted_score, profile_match, engagement, achievement_penalty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         review_text = VALUES(review_text),
         weight = VALUES(weight),
         weighted_score = VALUES(weighted_score),
         profile_match = VALUES(profile_match),
         engagement = VALUES(engagement),
         achievement_penalty = VALUES(achievement_penalty),
         updated_at = CURRENT_TIMESTAMP`,
        [
          steamId,
          appid,
          raw,
          reviewText && reviewText.trim() ? reviewText.trim() : null,
          weight,
          weightedScore,
          result?.breakdown?.profileMatch ?? null,
          result?.breakdown?.engagement ?? null,
          result?.breakdown?.penaltyAPH ?? result?.breakdown?.softPenaltyAPH ?? null
        ]
      );
    }
    
    // Calculate aggregate score from database (weighted mean of all ratings)
    let aggregateScore = null;
    if (dbPool) {
      const scoreData = await getGameScoreFromDB(appid);
      if (scoreData) {
        aggregateScore = scoreData.score;
      }
    }
    
    res.json({ 
      ...result, 
      aggregate: { 
        score: aggregateScore !== null ? aggregateScore : null  // Only show score if ratings exist
      } 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Browse top indie IDs
app.get('/browse', async (req, res) => {
  try {
    const idsPath = path.resolve(__dirname, '../../cpp/ConsoleApplication1/ConsoleApplication1/top1000_indie_ids.txt');
    const text = fs.readFileSync(idsPath, 'utf-8');
    const appids = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 1000);

    let rows = [];
    let genreRows = [];
    let tagRows = [];
    if (dbPool) {
      const [r] = await dbPool.query('SELECT appid, name, developer FROM games WHERE appid IN (' + appids.map(()=>'?' ).join(',') + ')', appids);
      rows = r;
      const [g] = await dbPool.query('SELECT appid, GROUP_CONCAT(genre) AS genres FROM game_genres WHERE appid IN (' + appids.map(()=>'?' ).join(',') + ') GROUP BY appid', appids);
      genreRows = g;
      const [t] = await dbPool.query('SELECT appid, GROUP_CONCAT(tag) AS tags FROM game_tags WHERE appid IN (' + appids.map(()=>'?' ).join(',') + ') GROUP BY appid', appids);
      tagRows = t;
    }
    const nameById = new Map(rows.map(r => [String(r.appid), r.name]));
    const developerById = new Map(rows.map(r => [String(r.appid), r.developer]));
    const genresById = new Map(genreRows.map(r => [String(r.appid), (r.genres||'').split(',').map(g => g.trim()).filter(Boolean)]));
    const tagsById = new Map(tagRows.map(r => [String(r.appid), (r.tags||'').split(',').map(t => t.trim()).filter(Boolean)]));

    const q = (req.query.q || '').toString().toLowerCase();
    const genreFilter = (req.query.genre || '').toString().trim().toLowerCase();
    const tagFilter = (req.query.tag || '').toString().trim().toLowerCase();

    // Get scores from database for all games in a single query
    let scoresById = new Map();
    if (dbPool) {
      try {
        await initUserRatingsTable();
        const [scoreRows] = await dbPool.query(
          `SELECT 
            appid,
            SUM(weight) as sum_weights,
            SUM(rating * weight) as sum_weighted,
            COUNT(*) as rating_count
          FROM user_ratings
          WHERE appid IN (${appids.map(() => '?').join(',')})
          GROUP BY appid`,
          appids
        );
        
        for (const row of scoreRows) {
          if (row.sum_weights && row.sum_weights > 0) {
            scoresById.set(row.appid, {
              score: parseFloat(row.sum_weighted) / parseFloat(row.sum_weights),
              popularity: parseFloat(row.sum_weights),
              ratingCount: parseInt(row.rating_count)
            });
          }
        }
      } catch (e) {
        console.error('[ERROR] Failed to fetch scores from DB:', e.message);
      }
    }

    const items = appids.map((id) => {
      const scoreData = scoresById.get(Number(id));
      const score = scoreData ? scoreData.score : null; // null if no ratings
      const popularity = scoreData ? scoreData.popularity : 0;
      const name = nameById.get(String(id)) || null;
      const developer = developerById.get(String(id)) || null;
      const gameGenres = genresById.get(String(id)) || [];
      const gameTags = tagsById.get(String(id)) || [];
      const imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
      return { appid: Number(id), name, developer, score, popularity, genres: gameGenres, tags: gameTags, imageUrl };
    });
    const filtered = items.filter(it => {
      const okQ = q ? (it.name||'').toLowerCase().includes(q) : true;
      const okG = genreFilter ? (it.genres||[]).some(g=>g.trim().toLowerCase()===genreFilter) : true;
      const okT = tagFilter ? (it.tags||[]).some(t=>t.trim().toLowerCase()===tagFilter) : true;
      return okQ && okG && okT;
    });
    
    // Apply sorting (default to score if not specified)
    const sortBy = (req.query.sort || 'score').toString().toLowerCase();
    if (sortBy === 'popular') {
      filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else {
      // Default to score sorting
      filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
    
    res.json({ items: filtered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/genres', async (_req, res) => {
  try {
    if (!dbPool) return res.json({ genres: [] });
    // Get genres ordered by number of games (most popular first)
    const [rows] = await dbPool.query(`
      SELECT genre, COUNT(*) as game_count 
      FROM game_genres 
      GROUP BY genre 
      ORDER BY game_count DESC, genre ASC
    `);
    res.json({ genres: rows.map(r => r.genre) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/tags', async (req, res) => {
  try {
    if (!dbPool) return res.json({ tags: [] });
    const genre = (req.query.genre || '').toString().trim();
    let rows;
    if (genre) {
      // Get tags for games that have this genre, ordered by game count
      try {
        const [r] = await dbPool.query(`
          SELECT gt.tag, COUNT(DISTINCT gt.appid) as game_count 
          FROM game_tags gt
          INNER JOIN game_genres gg ON gt.appid = gg.appid
          WHERE LOWER(gg.genre) = LOWER(?)
          GROUP BY gt.tag
          ORDER BY game_count DESC, gt.tag ASC
        `, [genre]);
        rows = r;
      } catch (e1) {
        // Maybe it's tag_id with a join to tags table
        try {
          const [r] = await dbPool.query(`
            SELECT t.tag_name as tag, COUNT(DISTINCT gt.appid) as game_count
            FROM game_tags gt
            INNER JOIN tags t ON gt.tag_id = t.tag_id
            INNER JOIN game_genres gg ON gt.appid = gg.appid
            WHERE LOWER(gg.genre) = LOWER(?)
            GROUP BY t.tag_name
            ORDER BY game_count DESC, t.tag_name ASC
          `, [genre]);
          rows = r;
        } catch (e2) {
          // If game_genres doesn't exist, try to get tags from games that have the genre in their genres array
          // This is a fallback - get all tags and let client filter
          try {
            const [r] = await dbPool.query(`
              SELECT tag, COUNT(DISTINCT appid) as game_count 
              FROM game_tags 
              GROUP BY tag 
              ORDER BY game_count DESC, tag ASC
            `);
            rows = r;
          } catch (e3) {
            try {
              const [r] = await dbPool.query(`
                SELECT t.tag_name as tag, COUNT(DISTINCT gt.appid) as game_count
                FROM game_tags gt
                INNER JOIN tags t ON gt.tag_id = t.tag_id
                GROUP BY t.tag_name
                ORDER BY game_count DESC, t.tag_name ASC
              `);
              rows = r;
            } catch (e4) {
              console.error('Error querying tags:', e1, e2, e3, e4);
              rows = [];
            }
          }
        }
      }
    } else {
      // Get all distinct tags, ordered by game count
      try {
        const [r] = await dbPool.query(`
          SELECT tag, COUNT(DISTINCT appid) as game_count 
          FROM game_tags 
          GROUP BY tag 
          ORDER BY game_count DESC, tag ASC
        `);
        rows = r;
      } catch (e1) {
        try {
          const [r] = await dbPool.query(`
            SELECT t.tag_name as tag, COUNT(DISTINCT gt.appid) as game_count
            FROM game_tags gt
            INNER JOIN tags t ON gt.tag_id = t.tag_id
            GROUP BY t.tag_name
            ORDER BY game_count DESC, t.tag_name ASC
          `);
          rows = r;
        } catch (e2) {
          console.error('Error querying tags:', e1, e2);
          rows = [];
        }
      }
    }
    res.json({ tags: rows.map(r => r.tag || r.tag_name || '').filter(Boolean) });
  } catch (e) {
    console.error('Tags endpoint error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/game/:appid', async (req, res) => {
  try {
    const appid = parseInt(req.params.appid, 10);
    if (!appid) return res.status(400).json({ error: 'Invalid appid' });
    
    // Get score from database (weighted mean of ratings)
    const scoreData = await getGameScoreFromDB(appid);
    const score = scoreData ? scoreData.score : null; // null if no ratings exist

    // Fetch from Steam Store API for description
    let steamData = {};
    try {
      const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`;
      const steamRes = await fetch(steamUrl);
      const json = await steamRes.json();
      
      if (json[appid]?.success && json[appid].data) {
        const d = json[appid].data;
        steamData = {
          short_description: d.short_description || null,
          detailed_description: d.detailed_description || null,
          price: d.price_overview ? {
            currency: d.price_overview.currency || 'USD',
            initial: d.price_overview.initial ? (d.price_overview.initial / 100) : null,
            final: d.price_overview.final ? (d.price_overview.final / 100) : null,
            discount_percent: d.price_overview.discount_percent || 0
          } : null
        };
      }
    } catch (steamErr) {
      console.warn('Steam API fetch failed:', steamErr.message);
    }

    if (!dbPool) {
      return res.json({ appid, name: null, score, genres: [], tags: [], ...steamData });
    }

    const [gameRows] = await dbPool.query('SELECT name, developer, publisher FROM games WHERE appid = ?', [appid]);
    const [genreRows] = await dbPool.query('SELECT genre FROM game_genres WHERE appid = ?', [appid]);
    const [tagRows] = await dbPool.query('SELECT tag FROM game_tags WHERE appid = ?', [appid]);

    const game = gameRows[0] || {};
    res.json({
      appid,
      name: game.name || null,
      developer: game.developer || null,
      publisher: game.publisher || null,
      genres: genreRows.map(r => r.genre),
      tags: tagRows.map(r => r.tag),
      score,
      ...steamData
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get score breakdown showing each user's contribution
app.get('/game/:appid/score-breakdown', async (req, res) => {
  try {
    const appid = parseInt(req.params.appid, 10);
    const { steamId } = req.query;
    if (!appid) return res.status(400).json({ status: 'error', error: 'Invalid appid' });
    
    if (!dbPool) {
      return res.json({ status: 'ok', breakdown: null, message: 'Database not configured' });
    }
    
    await initUserRatingsTable();
    
    // Get all ratings for this game with user info
    const [rows] = await dbPool.query(
      `SELECT 
        ur.steamid,
        ur.rating,
        ur.weight,
        ur.weighted_score,
        u.persona_name,
        ua.username
      FROM user_ratings ur
      LEFT JOIN users u ON u.steamid = ur.steamid
      LEFT JOIN user_accounts ua ON CAST(ua.steamid AS CHAR) = CAST(ur.steamid AS CHAR)
      WHERE ur.appid = ?
      ORDER BY ur.weight DESC`,
      [appid]
    );
    
    if (rows.length === 0) {
      return res.json({ status: 'ok', breakdown: null, message: 'No ratings yet' });
    }
    
    // Calculate total weighted score
    const totalWeight = rows.reduce((sum, r) => sum + parseFloat(r.weight || 0), 0);
    const totalWeightedScore = rows.reduce((sum, r) => sum + parseFloat(r.weighted_score || 0), 0);
    const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : null;
    
    // Format breakdown with user identification
    const breakdown = rows.map(row => ({
      steamid: String(row.steamid),
      rating: parseFloat(row.rating || 0),
      weight: parseFloat(row.weight || 0),
      weightedScore: parseFloat(row.weighted_score || 0),
      contribution: totalWeight > 0 ? (parseFloat(row.weight || 0) / totalWeight) * 100 : 0,
      reviewerName: row.persona_name || row.username || `User ${String(row.steamid).slice(-6)}`,
      isCurrentUser: steamId ? String(row.steamid) === String(steamId) : false
    }));
    
    // Calculate current user's contribution if provided
    const currentUserContribution = steamId 
      ? breakdown.find(b => String(b.steamid) === String(steamId))
      : null;
    
    res.json({
      status: 'ok',
      breakdown: {
        finalScore,
        totalWeight,
        totalWeightedScore,
        ratingCount: rows.length,
        contributions: breakdown,
        currentUser: currentUserContribution
      }
    });
  } catch (e) {
    console.error('[ERROR] /game/:appid/score-breakdown:', e);
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Get user account details
app.get('/account', async (req, res) => {
  try {
    const { steamId } = req.query;
    if (!steamId) return res.status(400).json({ status: 'error', error: 'steamId required' });
    
    if (!dbPool) return res.status(500).json({ status: 'error', error: 'Database not configured' });
    
    // Debug: log the query
    console.log(`[DEBUG] /account: Looking for steamId: ${steamId}`);
    
    // Ensure steamId is a string (MySQL stores it as VARCHAR/BIGINT, we'll match as string)
    const steamIdStr = String(steamId).trim();
    const [rows] = await dbPool.query(
      'SELECT id, email, username, steam_friend_code, steamid, created_at FROM user_accounts WHERE CAST(steamid AS CHAR) = ?',
      [steamIdStr]
    );
    
    console.log(`[DEBUG] /account: Found ${rows.length} user(s) with steamId ${steamId}`);
    
    if (rows.length === 0) {
      // Debug: Check if any users exist at all
      const [allUsers] = await dbPool.query('SELECT steamid, username, email FROM user_accounts LIMIT 5');
      console.log(`[DEBUG] /account: Total users in database: ${allUsers.length}`);
      if (allUsers.length > 0) {
        console.log(`[DEBUG] /account: Sample steamIds in DB:`, allUsers.map(u => u.steamid));
      }
      return res.status(404).json({ status: 'error', error: 'User not found' });
    }
    
    res.json({ status: 'ok', account: rows[0] });
  } catch (e) {
    console.error('[ERROR] /account:', e);
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Temporary endpoint to delete a user account (for development/testing)
app.delete('/account/:email', async (req, res) => {
  try {
    const { email } = req.params;
    if (!dbPool) return res.status(500).json({ status: 'error', error: 'Database not configured' });
    
    const [result] = await dbPool.query(
      'DELETE FROM user_accounts WHERE email = ?',
      [email]
    );
    
    console.log(`[DEBUG] Deleted ${result.affectedRows} account(s) with email: ${email}`);
    res.json({ status: 'ok', message: `Deleted ${result.affectedRows} account(s)`, deleted: result.affectedRows });
  } catch (e) {
    console.error('[ERROR] Delete account:', e);
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Get latest reviews (recent reviews with game and user info)
app.get('/latest-reviews', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    
    if (!dbPool) {
      return res.json({ status: 'ok', reviews: [] });
    }
    
    await initUserRatingsTable();
    
    // Get latest reviews with game info and user info
    // Show all reviews, but prefer those with review_text
    const [rows] = await dbPool.query(
      `SELECT 
        ur.appid,
        ur.rating,
        ur.weight,
        ur.review_text,
        ur.updated_at as review_date,
        g.name as game_name,
        g.developer,
        u.persona_name,
        ua.username,
        ur.steamid
      FROM user_ratings ur
      INNER JOIN games g ON g.appid = ur.appid
      LEFT JOIN users u ON CAST(u.steamid AS CHAR) = CAST(ur.steamid AS CHAR)
      LEFT JOIN user_accounts ua ON CAST(ua.steamid AS CHAR) = CAST(ur.steamid AS CHAR)
      ORDER BY ur.updated_at DESC
      LIMIT ?`,
      [limit]
    );
    
    const reviews = rows.map(row => ({
      appid: row.appid,
      gameName: row.game_name,
      developer: row.developer,
      rating: row.rating,
      weight: parseFloat(row.weight || 0),
      reviewText: row.review_text,
      reviewerName: row.persona_name || row.username || `User ${String(row.steamid).slice(-6)}`,
      reviewDate: row.review_date ? new Date(row.review_date).toISOString() : null,
      imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${row.appid}/header.jpg`
    }));
    
    res.json({ status: 'ok', reviews });
  } catch (e) {
    console.error('[ERROR] /latest-reviews:', e);
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Get user ratings (only games that have been rated)
app.get('/myratings', async (req, res) => {
  try {
    const { steamId } = req.query;
    if (!steamId) return res.status(400).json({ status: 'error', error: 'steamId required' });
    
    if (!dbPool) {
      return res.json({ status: 'ok', games: [], message: 'Database not configured' });
    }
    
    await initUserRatingsTable();
    
    // Get only games that have been rated by this user
    const [rows] = await dbPool.query(
      `SELECT 
        ur.appid,
        ur.rating,
        ur.weight,
        ur.weighted_score,
        ur.profile_match,
        ur.engagement,
        ur.achievement_penalty,
        ur.updated_at as rated_at,
        g.name,
        ug.playtime_forever,
        ug.last_played,
        (SELECT COUNT(*) FROM user_achievements ua WHERE ua.steamid = ? AND ua.appid = ur.appid) as unlocked_count,
        (SELECT COUNT(*) FROM game_achievements ga WHERE ga.appid = ur.appid) as total_achievements
      FROM user_ratings ur
      INNER JOIN games g ON g.appid = ur.appid
      LEFT JOIN user_games ug ON ug.steamid = ur.steamid AND ug.appid = ur.appid
      WHERE ur.steamid = ?
      ORDER BY ur.updated_at DESC`,
      [steamId, steamId]
    );
    
    // Format the results to match what the frontend expects
    const games = rows.map(row => ({
      appid: row.appid,
      name: row.name,
      hours: row.playtime_forever ? row.playtime_forever / 60.0 : 0,
      achievementPct: row.total_achievements > 0 ? (row.unlocked_count || 0) / row.total_achievements : 0,
      rating: row.rating,
      weight: row.weight,
      weighted_score: row.weighted_score,
      profile_match: row.profile_match,
      engagement: row.engagement,
      achievement_penalty: row.achievement_penalty,
      rated_at: row.rated_at
    }));
    
    res.json({ 
      status: 'ok', 
      games: games,
      message: games.length > 0 ? 'Your rated games' : 'You haven\'t rated any games yet'
    });
  } catch (e) {
    console.error('[ERROR] /myratings:', e);
    res.json({ 
      status: 'ok', 
      games: [],
      message: 'Error loading ratings'
    });
  }
});

app.listen(PORT, () => {
  console.log(`IndieLens bridge listening on ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the other process or change the PORT.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit, let the server try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, let the server try to continue
});



