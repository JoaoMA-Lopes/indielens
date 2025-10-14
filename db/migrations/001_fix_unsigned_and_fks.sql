USE steam_data;

-- 1) Drop existing FKs if present (names may vary across machines)
-- game_genres → games
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_genres'
              AND REFERENCED_TABLE_NAME='games' LIMIT 1);
SET @sql := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE game_genres DROP FOREIGN KEY `', @fk, '`;'), 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- game_tags → games
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_tags'
              AND REFERENCED_TABLE_NAME='games' LIMIT 1);
SET @sql := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE game_tags DROP FOREIGN KEY `', @fk, '`;'), 'SELECT 1;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Ensure parent/child columns are UNSIGNED and NOT NULL
ALTER TABLE games        MODIFY appid INT UNSIGNED NOT NULL;
ALTER TABLE game_genres  MODIFY appid INT UNSIGNED NOT NULL;
ALTER TABLE game_tags    MODIFY appid INT UNSIGNED NOT NULL;

-- 3) Re-add FKs with ON DELETE CASCADE
ALTER TABLE game_genres
  ADD CONSTRAINT fk_gg_games FOREIGN KEY (appid) REFERENCES games(appid) ON DELETE CASCADE;

ALTER TABLE game_tags
  ADD CONSTRAINT fk_gt_games FOREIGN KEY (appid) REFERENCES games(appid) ON DELETE CASCADE;

-- 4) Create user/achievement tables if missing (safe if already exist)
CREATE TABLE IF NOT EXISTS users (
  steamid BIGINT UNSIGNED NOT NULL,
  persona_name VARCHAR(255) DEFAULT NULL,
  profile_url VARCHAR(255) DEFAULT NULL,
  communityvisibility TINYINT UNSIGNED DEFAULT NULL,
  profilestate TINYINT UNSIGNED DEFAULT NULL,
  profile_public TINYINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (steamid)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_games (
  steamid BIGINT UNSIGNED NOT NULL,
  appid INT UNSIGNED NOT NULL,
  playtime_forever INT UNSIGNED NOT NULL DEFAULT 0,
  last_played INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (steamid, appid),
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  FOREIGN KEY (appid)   REFERENCES games(appid)  ON DELETE CASCADE,
  INDEX idx_ug_appid (appid),
  INDEX idx_ug_lastplayed (last_played)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS game_achievements (
  appid INT UNSIGNED NOT NULL,
  apiname VARCHAR(128) NOT NULL,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  description VARCHAR(1024) NOT NULL DEFAULT '',
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (appid, apiname),
  FOREIGN KEY (appid) REFERENCES games(appid) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_achievements (
  steamid BIGINT UNSIGNED NOT NULL,
  appid INT UNSIGNED NOT NULL,
  apiname VARCHAR(128) NOT NULL,
  unlocktime INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (steamid, appid, apiname),
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  FOREIGN KEY (appid, apiname) REFERENCES game_achievements(appid, apiname) ON DELETE CASCADE,
  INDEX idx_ua_steamid (steamid),
  INDEX idx_ua_appid_steam (appid, steamid)
) ENGINE=InnoDB;
