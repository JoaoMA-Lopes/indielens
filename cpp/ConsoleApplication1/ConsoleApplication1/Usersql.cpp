#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_driver.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_connection.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\prepared_statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\resultset.h"
#include <curl/curl.h>
#include <iostream>
#include "Gamesdatabase.h"
#include "Games.h"
#include "Users.h"
#include <string>
#include <vector>
#include <sstream>
#include "C:/Users/joao/Desktop/C++ LIBS/nlohmann JSON library/json.hpp"
#include "Curlstuff.h"
#include "Gumbostuff.h"
#include "Stringutilities.h"
#include <chrono>
#include <thread>
#include <regex>
#include <gumbo.h>
#include <unordered_set>
#include <fstream>
#include <mysqlx/xdevapi.h>

// Helper: Load achievement definitions from Steam API
static inline void loadDefsFromAPI(mysqlx::Session& sess, CURL* curl, // fetches the achievement definitions
    const std::string& apiKey, int appid) {

    std::string url = "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/" // standard http request via curl
        "?key=" + apiKey + "&appid=" + std::to_string(appid);
    std::string body;

    if (!Performcurlrequest(curl, url, body) || body.empty()) {
        std::cerr << "Failed to fetch achievement schema for appid " << appid << "\n";
        return;
    }

    nlohmann::json j = nlohmann::json::parse(body, nullptr, false); // parsing json response
    if (j.is_discarded()) {
        std::cerr << "Failed to parse JSON for appid " << appid << "\n";
        return;
    }

    // Navigate to achievements array - handle missing keys safely
    if (!j.contains("game") || !j["game"].contains("availableGameStats")) { // checking if there are stats for the games
        std::cerr << "No game stats available for appid " << appid << "\n";
        return;
    }

    const auto& stats = j["game"]["availableGameStats"];
    if (!stats.contains("achievements") || !stats["achievements"].is_array()) {
        std::cerr << "No achievements found for appid " << appid << "\n";
        return;
    }

    const auto& defs = stats["achievements"]; // checking if there are stats for the achievements

    // Insert all achievement definitions
    int inserted = 0;
    for (const auto& a : defs) { // inserting all achievements and their definitions
        const std::string api = a.value("name", "");
        const std::string title = a.value("displayName", "");
        const int hidden = a.value("hidden", 0);

        if (api.empty()) continue;

        sess.sql(
            "INSERT INTO steam_data.game_achievements (appid, apiname, display_name, hidden) "
            "VALUES (?, ?, ?, ?) "
            "ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), hidden=VALUES(hidden)"
        ).bind(appid, api, title, hidden).execute();
        inserted++;
    }

    std::cout << "  Loaded " << inserted << " achievement definitions from API for appid " << appid << "\n";
}

// Helper: Ensure game exists in games table
static inline void ensureGameExists(mysqlx::Session& sess, int appid, const std::string& gameName) { // ensures a game is in the games table (games table only has ~990 games for now, so prolly not) if it isnt will insert
    sess.sql(
        "INSERT IGNORE INTO steam_data.games (appid, name) " // ignores if there already is a game with that appid
        "VALUES (?, ?)"
    ).bind(appid, gameName).execute();
}

// Helper: Insert achievement definitions from user's data (fallback)
static inline void ensureDefsFromUserData(mysqlx::Session& sess, int appid,
    const std::unordered_map<std::string, AchievementUnlock>& achievements) { // fallback function that creates achievement definitions from user data instead of API data for when API data is unavailable

    for (const auto& kv : achievements) { // iterates through user's achievements
        const std::string& apiname = kv.first;
        if (apiname.empty()) continue;

        sess.sql(
            "INSERT IGNORE INTO steam_data.game_achievements (appid, apiname, display_name) " // INSERT IGNORE to avoid dupolicates, inserts minimal achievemnent records (only the appid, name and apiname)
            "VALUES (?, ?, ?)"
        ).bind(appid, apiname, apiname).execute(); // Use apiname as display_name temporarily
    }
}

// Helper: Check if a game exists and is not DLC/Soundtrack
static inline bool baseGameExists(mysqlx::Session& sess, int appid) { // checks if a game exists and is not DLC or soundtrack
    auto res = sess.sql(
        "SELECT 1 "
        "FROM steam_data.games g "
        "WHERE g.appid = ? "
        "  AND NOT EXISTS (SELECT 1 FROM steam_data.game_tags t WHERE t.appid = g.appid AND t.tag IN ('DLC','Soundtrack')) " // again, if the game doesnt exist or is DLC or soundtrack dont return
        "LIMIT 1"
    ).bind(appid).execute();
    return res.count() > 0; // returns true if a valid game exists
}

// Upsert user basic info
void upsertUser(mysqlx::Session& sess, const User& u) { // inserts basic profile information
    sess.sql(
        "INSERT INTO steam_data.users "
        "(steamid, persona_name, profile_url, communityvisibility, profilestate, profile_public) "
        "VALUES (?, ?, ?, ?, ?, ?) "
        "ON DUPLICATE KEY UPDATE " // uses this to update existing users info
        "persona_name=VALUES(persona_name), "
        "profile_url=VALUES(profile_url), "
        "communityvisibility=VALUES(communityvisibility), "
        "profilestate=VALUES(profilestate), "
        "profile_public=VALUES(profile_public)"
    ).bind(u.steamid, u.persona_name, u.urlprofile, u.communityvisibility, u.profilestate, u.profile_public) // binds all of this information to the User object
        .execute();
}

// Upsert user's owned games
void upsertUserGame(mysqlx::Session& sess, uint64_t steamid, const User& u) { // Store all games owned by a user
    if (u.gamesowned.empty()) return; // if the gamesowned string is empty just return

    int processed = 0;
    for (const auto& game : u.gamesowned) {
        
        ensureGameExists(sess, game.appid, game.name); // First, ensure the game exists in the games table (insert if missing)

        sess.sql(
            "INSERT INTO steam_data.user_games (steamid, appid, playtime_forever, last_played) " // inserts the usergame into the usergame table
            "VALUES (?, ?, ?, ?) "
            "ON DUPLICATE KEY UPDATE "
            "playtime_forever=VALUES(playtime_forever), "
            "last_played=VALUES(last_played)"
        ).bind(steamid, game.appid, game.playtime_forever, game.last_played).execute();
        processed++;
    }

    std::cout << "Inserted " << processed << " games for user " << steamid << "\n";
}

// Upsert user achievements (FIXED VERSION)
void upsertUserAchievements(mysqlx::Session& sess, CURL* curl, const std::string& apiKey, uint64_t steamid, const User& u) { // Function to handle all achievement inserting

    int gamesWithAchievements = 0; // intiializes both counters
    int totalUnlockedInserted = 0;

    for (const auto& game : u.gamesowned) { // loop over owned games
        if (game.achievements.empty()) continue; // skip over games with no achievements

        std::cout << "Processing achievements for appid " << game.appid // logs appids and total achievements found
            << " (" << game.name << "): "
            << game.achievements.size() << " total\n";

        ensureGameExists(sess, game.appid, game.name); // ensure the game is in the games table

        try {
            loadDefsFromAPI(sess, curl, apiKey, game.appid); // loads all achievement definitions from steam API
        }
        catch (const std::exception& e) {
            std::cerr << "  API load failed, using user data as fallback: " << e.what() << "\n";
            ensureDefsFromUserData(sess, game.appid, game.achievements); // if that doesnt work, load achievement definitions from user data
        }

        ensureDefsFromUserData(sess, game.appid, game.achievements); // makes sure al achievements from the user data exist in game_achievements to cover cases where API doesnt have all achievements

       
        std::vector<const AchievementUnlock*> unlocked; // count and collect the unlocked achievements
        for (const auto& kv : game.achievements) {
            if (kv.second.achieved) {
                unlocked.push_back(&kv.second);
            }
        }

        if (unlocked.empty()) {
            std::cout << "  No unlocked achievements (0/" << game.achievements.size() << ")\n"; // if there are no unlocked achievements skip
            continue;
        }

        std::cout << "  Inserting " << unlocked.size() << "/" << game.achievements.size() 
            << " unlocked achievements\n";

        // STEP 4: Build batch insert for unlocked achievements only
        std::string sql =
            "INSERT INTO steam_data.user_achievements (steamid, appid, apiname, unlocktime) VALUES "; // inserts the unlocked achievements into the user data
        for (size_t j = 0; j < unlocked.size(); ++j) {
            if (j > 0) sql += ",";
            sql += "(?, ?, ?, ?)";
        }
        sql += " ON DUPLICATE KEY UPDATE unlocktime=VALUES(unlocktime)"; // update if there is a duplicate key

        auto stmt = sess.sql(sql);
        for (auto* a : unlocked) {
            stmt.bind(steamid, game.appid, a->api_name, a->unlock_time); // binding the achievement to a given usergame of a given user
        }
        stmt.execute();

        gamesWithAchievements++;
        totalUnlockedInserted += unlocked.size();
    }

    std::cout << "Processed " << gamesWithAchievements << " games with achievements, " // print summary after loop, printing both the gameswithachievements and the totalunlocked and inserted achievements for the particular user
        << "inserted " << totalUnlockedInserted << " unlocked achievements total\n";
}

// Main ingestion function
void ingestone(mysqlx::Session& sess, CURL* curl, const std::string& apiKey, const User& user) { // ingests all the data into the user in one go, basically a orchestrator
    std::cout << "\n=== Starting data ingestion for user " << user.steamid // prints the steamid and persona name of specific user being inserted
        << " (" << user.persona_name << ") ===\n";

    try {
        upsertUser(sess, user);
        std::cout << "✓ User info upserted\n"; // inserting user

        upsertUserGame(sess, user.steamid, user);
        std::cout << "✓ Games upserted\n"; // inserting user games

        upsertUserAchievements(sess, curl, apiKey, user.steamid, user);
        std::cout << "✓ Achievements upserted\n"; // inserting user achievements

        std::cout << "=== Ingestion complete ===\n\n";
    }
    catch (const mysqlx::Error& e) {
        std::cerr << "[MySQLX Error] " << e.what() << "\n"; // to catch mysql errors
        throw;
    }
    catch (const std::exception& e) {
        std::cerr << "[Error] " << e.what() << "\n"; // to catch regular errors
        throw;
    }
}