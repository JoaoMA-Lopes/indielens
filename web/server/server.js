import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mysql from 'mysql2/promise';
import { scrapeMetacriticList, calculateStatistics } from './scrape-metacritic.js';

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
const genreImagesPath = path.resolve(__dirname, '../Genretitles');
console.log('[DEBUG] Genre images path:', genreImagesPath);
console.log('[DEBUG] Genre images exists:', fs.existsSync(genreImagesPath));
if (fs.existsSync(genreImagesPath)) {
  const files = fs.readdirSync(genreImagesPath);
  console.log('[DEBUG] Genre images files:', files.slice(0, 5).join(', '), '...');
}
// Serve genre images with no-cache headers to prevent browser caching
app.use('/genre-images', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}, express.static(genreImagesPath));

// Serve Metacritic graphs
const metacriticGraphsPath = path.resolve(__dirname, '../Metacritic graphs');
console.log('[DEBUG] Metacritic graphs path:', metacriticGraphsPath);
console.log('[DEBUG] Metacritic graphs exists:', fs.existsSync(metacriticGraphsPath));
if (fs.existsSync(metacriticGraphsPath)) {
  const files = fs.readdirSync(metacriticGraphsPath);
  console.log('[DEBUG] Metacritic graphs files:', files.slice(0, 10).join(', '), '...');
  
  // Serve with multiple path variations to handle URL encoding
  app.use('/Metacritic graphs', express.static(metacriticGraphsPath));
  app.use('/Metacritic%20graphs', express.static(metacriticGraphsPath));
  app.use('/api/Metacritic graphs', express.static(metacriticGraphsPath));
  app.use('/api/Metacritic%20graphs', express.static(metacriticGraphsPath));
  
  // Also add a direct route handler for better compatibility
  app.get('/api/Metacritic graphs/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(metacriticGraphsPath, filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  });
  
  app.get('/api/Metacritic%20graphs/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(metacriticGraphsPath, filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  });
}

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
    connectionLimit: 5,
    supportBigNumbers: true,
    bigNumberStrings: true
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

// Update Steam Friend Code and re-ingest library
app.post('/account/update-steam-library', async (req, res) => {
  try {
    const { steamId, friendCode } = req.body;
    if (!steamId) return res.status(400).json({ status: 'error', error: 'steamId required' });
    if (!friendCode) return res.status(400).json({ status: 'error', error: 'friendCode required' });
    
    if (!dbPool) return res.status(500).json({ status: 'error', error: 'Database not configured' });
    
    // Convert friend code to steamID64
    // Formula: steamID64 = friendCode + 76561197960265728
    const ID64_BASE = BigInt('76561197960265728');
    const friendCodeNum = BigInt(friendCode);
    const newSteamId = String(friendCodeNum + ID64_BASE);
    
    console.log(`[DEBUG] /account/update-steam-library: Converting friend code ${friendCode} to steamID64 ${newSteamId}`);
    
    // Update user account with new friend code and steamid
    await dbPool.query(
      'UPDATE user_accounts SET steam_friend_code = ?, steamid = ? WHERE CAST(steamid AS CHAR) = ?',
      [String(friendCode), newSteamId, String(steamId)]
    );
    
    // Re-ingest library with new steamId
    try {
      const result = await runCli(['--ingest', newSteamId]);
      res.json({ 
        status: 'ok', 
        message: 'Steam library updated successfully',
        steamId: newSteamId,
        ingestResult: result
      });
    } catch (ingestError) {
      // Even if ingest fails, the friend code was updated
      console.error('[ERROR] Ingest failed after updating friend code:', ingestError.message);
      res.json({ 
        status: 'partial', 
        message: 'Friend code updated but library ingestion failed. You can try re-ingesting later.',
        steamId: newSteamId,
        error: ingestError.message
      });
    }
  } catch (e) {
    console.error('[ERROR] /account/update-steam-library:', e);
    res.status(500).json({ status: 'error', error: e.message });
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
    
    // Find user by email - force fresh query
    console.log(`[DEBUG] /login: Querying database for email="${email}"`);
    
    // Force a fresh connection by ending any existing transaction
    try {
      await dbPool.query('SELECT 1'); // Simple query to ensure connection is fresh
    } catch (e) {
      console.warn('[WARN] /login: Connection check failed:', e.message);
    }
    
    // First, do a direct query to check what's actually in the database
    const [checkRows] = await dbPool.query(
      'SELECT id, username, email, CAST(steamid AS CHAR) as steamid_str, steamid FROM user_accounts WHERE email = ?',
      [email]
    );
    console.log(`[DEBUG] /login: Direct check query returned:`, JSON.stringify(checkRows, null, 2));
    
    // Now get full user data - explicitly cast steamid to ensure we get the right value
    const [rows] = await dbPool.query(
      'SELECT id, email, username, password_hash, CAST(steamid AS CHAR) as steamid_str, steamid, steam_friend_code FROM user_accounts WHERE email = ?',
      [email]
    );
    
    console.log(`[DEBUG] /login: Main query returned ${rows.length} row(s)`);
    if (rows.length > 0) {
      console.log(`[DEBUG] /login: Raw row data:`, JSON.stringify(rows[0], null, 2));
    }
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = rows[0];
    
    // Use steamid_str if available (from CAST), otherwise use steamid
    const dbSteamId = user.steamid_str || user.steamid;
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if steamId exists in database
    console.log(`[DEBUG] /login: User ${email} found:`);
    console.log(`[DEBUG]   - steamid (raw): ${user.steamid} (type: ${typeof user.steamid})`);
    console.log(`[DEBUG]   - steamid_str (cast): ${user.steamid_str} (type: ${typeof user.steamid_str})`);
    console.log(`[DEBUG]   - Using: ${dbSteamId} (type: ${typeof dbSteamId})`);
    
    if (!dbSteamId || dbSteamId === null || dbSteamId === 'null') {
      console.error(`[ERROR] /login: User ${email} (id: ${user.id}) has no steamId in database!`);
      return res.status(500).json({ 
        error: 'Account configuration error: Steam ID not found. Please contact support or re-register with your Steam friend code.' 
      });
    }
    
    // Return steamId for the frontend - use the string version to avoid any number precision issues
    const steamIdStr = String(dbSteamId).trim();
    console.log(`[DEBUG] /login: User ${email} logged in, returning steamId="${steamIdStr}"`);
    res.json({ 
      status: 'ok', 
      steamId: steamIdStr,
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
    
    console.log(`[DEBUG] /preview-weighting called: steamId="${steamId}" (type: ${typeof steamId}, length: ${String(steamId).length}), appid=${appid}, rating=${rating}`);
    
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
    // Convert steamId to string for comparison (MySQL might store as BIGINT)
    const steamIdStr = String(steamId).trim();
    const appidNum = parseInt(appid, 10);
    
    console.log(`[DEBUG] calculateWeightFallback: Querying for steamId="${steamIdStr}" (type: ${typeof steamIdStr}), appid=${appidNum} (type: ${typeof appidNum})`);
    
    const [gameRows] = await dbPool.query(
      `SELECT ug.playtime_forever,
              (SELECT COUNT(*) FROM user_achievements ua WHERE CAST(ua.steamid AS CHAR) = ? AND ua.appid = ?) as unlocked_count,
              (SELECT COUNT(*) FROM game_achievements ga WHERE ga.appid = ?) as total_achievements
       FROM user_games ug
       WHERE CAST(ug.steamid AS CHAR) = ? AND ug.appid = ?`,
      [steamIdStr, appidNum, appidNum, steamIdStr, appidNum]
    );
    
    console.log(`[DEBUG] calculateWeightFallback: Query returned ${gameRows.length} row(s)`);
    if (gameRows.length > 0) {
      console.log(`[DEBUG] calculateWeightFallback: Raw row data:`, JSON.stringify(gameRows[0]));
    }
    
    if (gameRows.length === 0) {
      console.log(`[DEBUG] calculateWeightFallback: No game data found, using defaults`);
      return { weight: 0.5, profileMatch: 0.75, engagement: 0.5, penaltyAPH: 1.0 };
    }
    
    const row = gameRows[0];
    const playtimeMinutes = row.playtime_forever || 0;
    const hours = Math.max(0, playtimeMinutes / 60.0);
    const totalAch = row.total_achievements || 0;
    const unlockedAch = row.unlocked_count || 0;
    const achievementPct = totalAch > 0 ? unlockedAch / totalAch : 0;
    
    console.log(`[DEBUG] calculateWeightFallback: Raw data - playtime_forever=${playtimeMinutes} minutes, totalAch=${totalAch}, unlockedAch=${unlockedAch}`);
    console.log(`[DEBUG] calculateWeightFallback: Calculated - hours=${hours.toFixed(2)}, achievementPct=${(achievementPct * 100).toFixed(1)}%`);
    
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
    // For 213h+92%: raw_engagement ≈ 0.92, should give much higher engagement
    // Use a scaling that properly rewards high engagement
    const base_raw = 0.0555;  // 2h+2% baseline
    const target_raw = 0.9545; // 200h+100% target
    const base_engagement = 0.01;  // Minimum engagement (2h+2%) = 0.01
    // For 200h+100%, engagement should be 12x base = 0.12
    // But we want much higher values for very engaged players (213h+92% should get ~0.70)
    // Target higher engagement values to achieve the 12x ratio
    const target_engagement = 0.70; // Much higher target for 200h+100% (213h+92% will get ~0.75)
    
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
      // Use a curve that accelerates for higher values (power of 0.6 instead of 0.7 for more aggressive scaling)
      const curvedRatio = Math.pow(ratio, 0.6);
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
    // But only penalize if achievement percentage is low (not if it's high!)
    let penaltyAPH = 1.0;
    if (totalAch > 0 && hours > 2) {
      // Only apply penalty if achievement percentage is low (< 20%) AND hours are high (> 10h)
      // High achievement percentage (like 92.6%) should never be penalized
      if (achievementPct < 0.20 && hours > 10) {
        // Apply penalty based on how low the achievement percentage is
        // At 20% = no penalty, at 0% = max penalty (0.8)
        penaltyAPH = 0.8 + (achievementPct / 0.20) * 0.2; // Scales from 0.8 to 1.0
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
    
    // Check if user owns the game
    if (dbPool) {
      const [ownedRows] = await dbPool.query(
        'SELECT appid FROM user_games WHERE steamid = ? AND appid = ?',
        [steamId, appid]
      );
      if (ownedRows.length === 0) {
        return res.status(403).json({ 
          error: 'You must own this game on Steam to rate it. Please add your Steam library to your account first.' 
        });
      }
    }
    
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
    
    const steamId = req.query.steamId ? String(req.query.steamId).trim() : null;
    
    // Get score from database (weighted mean of ratings)
    const scoreData = await getGameScoreFromDB(appid);
    const score = scoreData ? scoreData.score : null; // null if no ratings exist

    // Check if user owns the game
    let userOwns = false;
    if (steamId && dbPool) {
      try {
        const [ownedRows] = await dbPool.query(
          'SELECT appid FROM user_games WHERE steamid = ? AND appid = ?',
          [steamId, appid]
        );
        userOwns = ownedRows.length > 0;
      } catch (e) {
        console.warn('Error checking game ownership:', e.message);
      }
    }

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
      return res.json({ appid, name: null, score, genres: [], tags: [], userOwns, ...steamData });
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
      userOwns,
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
    console.log(`[DEBUG] /game/:appid/score-breakdown: req.query=`, JSON.stringify(req.query));
    console.log(`[DEBUG] /game/:appid/score-breakdown: req.url=`, req.url);
    console.log(`[DEBUG] /game/:appid/score-breakdown: req.originalUrl=`, req.originalUrl || 'NOT SET');
    console.log(`[DEBUG] /game/:appid/score-breakdown: req.query.steamId=`, req.query.steamId, 'type:', typeof req.query.steamId);
    console.log(`[DEBUG] /game/:appid/score-breakdown: req.headers=`, JSON.stringify(req.headers));
    
    // Try to extract steamId from query string or URL manually if query parsing failed
    let { steamId } = req.query;
    if (!steamId) {
      // Try to parse from originalUrl if query string was stripped
      if (req.originalUrl) {
        const urlMatch = req.originalUrl.match(/[?&]steamId=([^&]+)/);
        if (urlMatch) {
          steamId = decodeURIComponent(urlMatch[1]);
          console.log(`[DEBUG] /game/:appid/score-breakdown: Extracted steamId from originalUrl: "${steamId}"`);
        }
      }
      // Also try parsing from req.url (though it usually doesn't have query string)
      if (!steamId && req.url) {
        const urlMatch = req.url.match(/[?&]steamId=([^&]+)/);
        if (urlMatch) {
          steamId = decodeURIComponent(urlMatch[1]);
          console.log(`[DEBUG] /game/:appid/score-breakdown: Extracted steamId from req.url: "${steamId}"`);
        }
      }
    }
    // Handle case where steamId is the string "null" or "undefined"
    if (steamId === 'null' || steamId === 'undefined' || steamId === null || steamId === undefined) {
      console.log(`[DEBUG] /game/:appid/score-breakdown: steamId is null/undefined/string "null", setting to null`);
      steamId = null;
    } else if (typeof steamId === 'string') {
      steamId = steamId.trim();
      if (steamId === '' || steamId === 'null' || steamId === 'undefined') {
        console.log(`[DEBUG] /game/:appid/score-breakdown: steamId trimmed to empty/null string, setting to null`);
        steamId = null;
      } else {
        console.log(`[DEBUG] /game/:appid/score-breakdown: steamId is valid string: "${steamId}"`);
      }
    } else {
      console.log(`[DEBUG] /game/:appid/score-breakdown: steamId is not a string, type:`, typeof steamId);
    }
    console.log(`[DEBUG] /game/:appid/score-breakdown: final steamId=`, steamId, 'type:', typeof steamId);
    if (!appid) return res.status(400).json({ status: 'error', error: 'Invalid appid' });
    
    if (!dbPool) {
      return res.json({ status: 'ok', breakdown: null, message: 'Database not configured' });
    }
    
    await initUserRatingsTable();
    
    // Get all ratings for this game with user info
    // Use CAST to get steamid as string to avoid precision issues
    const [rows] = await dbPool.query(
      `SELECT 
        CAST(ur.steamid AS CHAR) as steamid_str,
        ur.steamid,
        ur.rating,
        ur.weight,
        ur.weighted_score,
        ur.profile_match,
        u.persona_name,
        ua.username
      FROM user_ratings ur
      LEFT JOIN users u ON CAST(u.steamid AS CHAR) = CAST(ur.steamid AS CHAR)
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
    // Normalize steamIds to strings for comparison (avoid precision issues)
    const steamIdStr = steamId && steamId !== 'null' && steamId !== 'undefined' ? String(steamId).trim() : null;
    console.log(`[DEBUG] /game/:appid/score-breakdown: steamIdStr after normalization=`, steamIdStr, 'type:', typeof steamIdStr);
    
    // Debug: log raw row data
    console.log(`[DEBUG] /game/:appid/score-breakdown: Raw rows from DB:`, rows.map(r => ({
      steamid: r.steamid,
      steamid_type: typeof r.steamid,
      steamid_str: r.steamid_str,
      steamid_str_type: typeof r.steamid_str
    })));
    
    const breakdown = rows.map(row => {
      // CRITICAL: Always use steamid_str (from CAST) to avoid precision issues
      // Never use row.steamid (raw number) as it loses precision for large SteamIDs
      let rowSteamIdStr;
      if (row.steamid_str !== undefined && row.steamid_str !== null) {
        // steamid_str is the CAST result, use it directly as string
        rowSteamIdStr = String(row.steamid_str).trim();
      } else {
        // Fallback: if steamid_str is missing, we have a problem, but try to recover
        console.warn(`[WARN] /game/:appid/score-breakdown: steamid_str missing for row, using steamid (may lose precision)`);
        rowSteamIdStr = String(row.steamid || '').trim();
      }
      
      const isCurrent = steamIdStr ? (rowSteamIdStr === steamIdStr) : false;
      console.log(`[DEBUG] /game/:appid/score-breakdown: Row steamId="${rowSteamIdStr}" (from steamid_str="${row.steamid_str}", steamid="${row.steamid}"), comparing with "${steamIdStr}", match=${isCurrent}`);
      return {
        steamid: rowSteamIdStr,
        rating: parseFloat(row.rating || 0),
        weight: parseFloat(row.weight || 0),
        weightedScore: parseFloat(row.weighted_score || 0),
        contribution: totalWeight > 0 ? (parseFloat(row.weight || 0) / totalWeight) * 100 : 0,
        reviewerName: row.persona_name || row.username || `User ${rowSteamIdStr.slice(-6)}`,
        isCurrentUser: isCurrent
      };
    });
    
    // Calculate current user's contribution if provided - use exact string match
    let currentUserContribution = null;
    if (steamIdStr) {
      console.log(`[DEBUG] /game/:appid/score-breakdown: Looking for current user with steamId="${steamIdStr}"`);
      console.log(`[DEBUG] /game/:appid/score-breakdown: Available steamIds in breakdown:`, breakdown.map(b => `"${b.steamid}"`));
      currentUserContribution = breakdown.find(b => {
        const match = b.steamid === steamIdStr;
        if (match) {
          console.log(`[DEBUG] /game/:appid/score-breakdown: Found match! b.steamid="${b.steamid}" === steamIdStr="${steamIdStr}"`);
        }
        return match;
      });
      if (!currentUserContribution) {
        console.log(`[DEBUG] /game/:appid/score-breakdown: No match found. Trying case-insensitive and trimmed comparison...`);
        // Try more lenient matching
        currentUserContribution = breakdown.find(b => {
          const bSteamId = String(b.steamid).trim();
          const searchSteamId = String(steamIdStr).trim();
          const match = bSteamId === searchSteamId;
          console.log(`[DEBUG] /game/:appid/score-breakdown: Comparing "${bSteamId}" === "${searchSteamId}" = ${match}`);
          return match;
        });
        if (currentUserContribution) {
          console.log(`[DEBUG] /game/:appid/score-breakdown: Found match with trimmed comparison!`);
        } else {
          console.log(`[DEBUG] /game/:appid/score-breakdown: Still no match. All breakdown steamIds:`, breakdown.map(b => `"${b.steamid}"`));
        }
      }
    }
    
    // Calculate Profile Match Score: average rating from users with similar profile match values
    let profileMatchScore = null;
    if (steamIdStr && rows.length > 0) {
      // Get current user's profile match value (even if they haven't rated yet, we can still calculate for others)
      const currentUserRow = rows.find(r => {
        // Use steamid_str (from CAST) to avoid precision issues
        const rowSteamIdStr = r.steamid_str !== undefined && r.steamid_str !== null 
          ? String(r.steamid_str).trim() 
          : String(r.steamid || '').trim();
        return rowSteamIdStr === steamIdStr;
      });
      
      if (currentUserRow && currentUserRow.profile_match !== null && currentUserRow.profile_match !== undefined) {
        const currentProfileMatch = parseFloat(currentUserRow.profile_match);
        // Define similarity threshold: ±0.1 (10%) or ±10% of the value, whichever is larger
        const threshold = Math.max(0.1, currentProfileMatch * 0.1);
        const minMatch = currentProfileMatch - threshold;
        const maxMatch = currentProfileMatch + threshold;
        
        // Find all ratings from users with similar profile match values (including the current user)
        const similarRatings = rows
          .filter(r => {
            const rowProfileMatch = parseFloat(r.profile_match || 0);
            return !isNaN(rowProfileMatch) && rowProfileMatch >= minMatch && rowProfileMatch <= maxMatch;
          })
          .map(r => parseFloat(r.rating || 0));
        
        if (similarRatings.length > 0) {
          const sum = similarRatings.reduce((acc, rating) => acc + rating, 0);
          profileMatchScore = sum / similarRatings.length;
          console.log(`[DEBUG] /game/:appid/score-breakdown: Profile Match Score calculated: ${profileMatchScore.toFixed(2)} from ${similarRatings.length} users with profile match in range [${minMatch.toFixed(3)}, ${maxMatch.toFixed(3)}] (current: ${currentProfileMatch.toFixed(3)})`);
        }
      } else if (currentUserRow) {
        // User has rated but profile_match is null - try to calculate it or use default
        console.log(`[DEBUG] /game/:appid/score-breakdown: Current user has rating but profile_match is null/undefined`);
      }
    }
    
    console.log(`[DEBUG] /game/:appid/score-breakdown: steamId param="${steamIdStr}", found ${rows.length} ratings`);
    console.log(`[DEBUG] /game/:appid/score-breakdown: steamIdStr type:`, typeof steamIdStr, 'value:', steamIdStr);
    if (rows.length > 0) {
      console.log(`[DEBUG] /game/:appid/score-breakdown: Rating steamIds:`, rows.map(r => String(r.steamid_str || r.steamid).trim()));
    }
    console.log(`[DEBUG] /game/:appid/score-breakdown: currentUser=${currentUserContribution ? 'found' : 'not found'}`);
    if (currentUserContribution) {
      console.log(`[DEBUG] /game/:appid/score-breakdown: currentUser contribution=${currentUserContribution.contribution.toFixed(1)}%, weight=${currentUserContribution.weight.toFixed(4)}`);
    }
    
    res.json({
      status: 'ok',
      breakdown: {
        finalScore,
        totalWeight,
        totalWeightedScore,
        ratingCount: rows.length,
        contributions: breakdown,
        currentUser: currentUserContribution,
        profileMatchScore
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

// Get Metacritic data for "Why we're here" section
app.get('/metacritic-data', async (req, res) => {
  try {
    const cacheFile = path.resolve(__dirname, 'metacritic-cache.json');
    console.log('[CACHE] Looking for cache file at:', cacheFile);
    console.log('[CACHE] File exists:', fs.existsSync(cacheFile));
    
    // Add no-cache headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Check if cached data exists
    if (fs.existsSync(cacheFile)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
      const maxAge = 1000 * 60 * 60 * 24 * 7; // 7 days
      
      console.log('[CACHE] Cache age:', Math.round(cacheAge / 1000 / 60), 'minutes');
      console.log('[CACHE] Cache stats:', {
        totalGames: cacheData.stats?.totalGames || 0,
        byYear: Object.keys(cacheData.stats?.byYear || {}).length,
        byGenre: Object.keys(cacheData.stats?.byGenre || {}).length,
      });
      
      if (cacheAge < maxAge) {
        console.log('[CACHE] Serving cached Metacritic data');
        return res.json({
          status: 'ok',
          ...cacheData,
          fromCache: true
        });
      } else {
        console.log('[CACHE] Cache expired, using fallback data...');
      }
    } else {
      console.log('[CACHE] Cache file not found, using fallback data');
    }
    
    // If no cache or cache expired, return fallback data based on research
    // The user can run scrape-and-cache.js manually to update this
    const fallbackData = {
      timestamp: new Date().toISOString(),
      fromCache: false,
      isFallback: true,
      games: [],
      stats: {
        totalGames: 0,
        averageCriticScore: 0,
        averageUserScore: 0,
        averageDifference: 1.8, // Based on 2013-2018 research
        byYear: {
          '1996-2001': { count: 50, averageDifference: -0.5, games: [] },
          '2002-2008': { count: 50, averageDifference: -0.3, games: [] },
          '2009-2012': { count: 50, averageDifference: 0.8, games: [] },
          '2013-2018': { count: 100, averageDifference: 1.8, games: [] },
        },
        byGenre: {
          'Walking Simulator': { count: 20, averageDifference: 0.95, games: [] },
          'Action-Adventure': { count: 50, averageDifference: 0.8, games: [] },
          'Platformer': { count: 30, averageDifference: -0.6, games: [] },
          'First-Person Shooter': { count: 25, averageDifference: -0.4, games: [] },
        }
      },
      message: 'Using fallback data. Run scrape-and-cache.js manually to update with real data.'
    };
    
    res.json({
      status: 'ok',
      ...fallbackData
    });
  } catch (error) {
    console.error('[ERROR] /api/metacritic-data:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message
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



