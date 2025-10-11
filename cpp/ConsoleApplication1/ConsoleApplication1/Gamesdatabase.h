#pragma once
#include "C:/Users/joao/Desktop/C++ LIBS/nlohmann JSON library/json.hpp"
#include <curl/curl.h>
#include "Games.h"
#include <vector>

using json = nlohmann::json;




class Gamesdatabase {
public:
    Gamesdatabase();

    std::vector<App> fetchapplist(const std::string& apiKey, CURL* curl);

    void fetchappdetails(const std::string& apiKey, CURL* curL, bool test);

    std::vector<App> applistParseJSON(const std::string response_data);

    Game appdetailsParseJSON(const std::string response_data);

    std::vector<Game> Gamesandtheirinfo; // Store all games here

    std::vector<Game> Testinidiegameslist; // Test list of most popular indie games

    std::vector<int> Testindieidslist = {};
    
    std::vector<int> fetchIndieAppIDs(CURL* curl);

    std::vector<std::string> extractTags(const std::string& html);

    bool isIndieGame(const json& gameData);

    const std::vector<Game>& getCollectedGames() const { return Gamesandtheirinfo; }


private:
    
};