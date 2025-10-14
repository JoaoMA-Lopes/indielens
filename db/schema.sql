CREATE DATABASE IF NOT EXISTS steam_data;
USE steam_data;
CREATE DATABASE IF NOT EXISTS steam_data;
USE steam_data;

CREATE TABLE IF NOT EXISTS games (
  appid INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  developer VARCHAR(255),
  publisher VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS tags (
  tag_id INT AUTO_INCREMENT PRIMARY KEY,
  tag_name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS game_tags (
  appid INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (appid, tag_id),
  FOREIGN KEY (appid) REFERENCES games(appid),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id)
);

CREATE TABLE IF NOT EXISTS user_games (
  steamid BIGINT NOT NULL,
  appid INT NOT NULL,
  playtime_forever INT DEFAULT 0,
  last_played INT DEFAULT 0,
  PRIMARY KEY (steamid, appid),
  FOREIGN KEY (appid) REFERENCES games(appid)
);