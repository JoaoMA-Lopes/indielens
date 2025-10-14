USE steam_data;

INSERT IGNORE INTO games (appid,name,developer,publisher) VALUES
(1,"Celeste","Maddy Makes Games","Matt Makes Games"),
(2,"Hollow Knight","Team Cherry","Team Cherry"),
(3,"Into the Breach","Subset Games","Subset Games");

INSERT IGNORE INTO tags (tag_name) VALUES
("Platformer"),("Metroidvania"),("Tactics");

INSERT IGNORE INTO game_tags (appid,tag_id)
SELECT 1, tag_id FROM tags WHERE tag_name="Platformer";
INSERT IGNORE INTO game_tags (appid,tag_id)
SELECT 2, tag_id FROM tags WHERE tag_name="Metroidvania";
INSERT IGNORE INTO game_tags (appid,tag_id)
SELECT 3, tag_id FROM tags WHERE tag_name="Tactics";

INSERT IGNORE INTO user_games (steamid,appid,playtime_forever,last_played) VALUES
(123,1,320,1690000000),
(123,2,540,1691000000);