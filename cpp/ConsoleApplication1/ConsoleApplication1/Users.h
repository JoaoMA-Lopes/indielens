#pragma once

#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_driver.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_connection.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\prepared_statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\resultset.h"
#include <curl/curl.h>
#include <iostream>
#include "Gamesdatabase.h"
#include "Games.h"
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

struct AchievementUnlock {
    std::string api_name;   // "ACH_WIN_ONE_GAME"
    bool achieved;          // true = unlocked
    int unlock_time;        // epoch timestamp (0 if locked)

    AchievementUnlock() = default; // regular constructor, leaves all values empty
    AchievementUnlock(const std::string& api, bool a, int t) // contrstruct with values already in
        : api_name(api), achieved(a), unlock_time(t) {}
};

// Represents one game owned by a user
struct Usergame {
    std::string name;
    int appid{};
    std::string img_icon_url;
    std::string img_logo_url;
    int playtime_forever{}; // minutes
    int last_played{};      // epoch seconds
    std::unordered_map<std::string, AchievementUnlock> achievements;
};

class User {
public:
    uint64_t steamid{};       // SteamID64
    std::string urlprofile{};       // Steam user profile
    std::string persona_name; // optional display name
    int communityvisibility;
    int profilestate;
    bool profile_public{ false };

    std::vector<Usergame> gamesowned;

    User() = default;
    User(uint64_t id, const std::string& persona = "", bool pub = false)
        : steamid(id), persona_name(persona), profile_public(pub) {}

    void addGame(const Usergame& ug) {
        gamesowned.push_back(ug);
    }

    void printSummary() const {
        std::cout << "User " << steamid << " (" << persona_name << ") "
            << "owns " << gamesowned.size() << " games\n";
        for (const auto& ug : gamesowned) {
            std::cout << "  AppID " << ug.appid
                << " | Playtime " << ug.playtime_forever / 60 << "h total";
        }
    }
};