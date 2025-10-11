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

// defining steamID64 base

const long long ID64base = 76561197960265728;

uint64_t getsteamID64(uint64_t& friendcode)
{
	long long steamID64 = friendcode + ID64base;

	return steamID64;

}

void printinfo(User& user)
{
	// === Summary print ===
	std::size_t totalGames = user.gamesowned.size(); // assuming User has a .games container
	std::size_t totalAchievements = 0;
	for (Usergame ug : user.gamesowned) {
		totalAchievements += ug.achievements.size();
	}

	std::cout << "\n[Summary] Captured " << totalGames << " games with "
		<< totalAchievements << " achievements total.\n";


	for (Usergame ug : user.gamesowned) {
		int totalAch = static_cast<int>(ug.achievements.size());
		int unlocked = 0;
		for (const auto& kv : ug.achievements) {
			const AchievementUnlock& ach = kv.second;
			if (ach.achieved) ++unlocked;
		}

		double percent = (totalAch > 0)
			? (100.0 * unlocked / totalAch)
			: 0.0;

		std::cout << "  AppID " << ug.appid
			<< " Game name " << ug.name
			<< " | Playtime " << ug.playtime_forever / 60 << "h"
			<< " | Achievements: " << unlocked << "/" << totalAch;

		if (totalAch > 0) {
			std::cout << " (" << std::fixed << std::setprecision(1)
				<< percent << "%)";
		}
		std::cout << "\n";

	}
}

std::string getsteamURL(uint64_t& friendcode)
{
	// first trying to get it from ID64

	const std::string& steamID64 = std::to_string(getsteamID64(friendcode));

	std::string URLfromID64 = "https://steamcommunity.com/profiles/" + steamID64 + "/";

	return URLfromID64;
}

bool getcommunityvisibilityandprofilestates(CURL* curl, const std::string& apiKey, uint64_t steamid, User& user) { // function to both get community visibility and profile states but to also check if the profile is valid
	const std::string url =
		"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
		"?key=" + apiKey + "&steamids=" + std::to_string(steamid); // creating url to see the player summary

	std::string resp;
	if (Performcurlrequest(curl, url, resp) != 1 || resp.empty()) // performing curl request on that url
	{
		return false; // curl request failed
	}

	auto j = nlohmann::json::parse(resp, nullptr, false); // parsing the curl request

	if (j.is_discarded() || !j.contains("response")) // checking if the parsing failed (is_discarded) or if it doesnt contain a response
	{
		return false; // parsing failed
	}

	const auto& r = j["response"]; // assigning te response to a variable
	if (!r.contains("players") || !r["players"].is_array() || r["players"].empty()) // checking if the response has the player
	{
		return false; // invalid / nonexistent account
	}

	const auto& p = r["players"].front(); // getting the front of the player's summary
	
	user.communityvisibility = p.value("communityvisibilitystate", 0); // assigning the user being created's community visibility to the community visibility found in the player
	user.profilestate = p.value("profilestate", 0); // assigning the user being created's profile state to the community visibility found in the player
	return true; // valid account
}

nlohmann::json getplayerachievements(CURL* curl, const std::string& apiKey, uint64_t steamid, int appid, const std::string& lang = "en") // function to get the player achievemts for all games in a parsed json format, will find the specific achievements for each game with this later
{
	// Docs: https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/
	const std::string url =
		"https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/"
		"?key=" + apiKey +
		"&steamid=" + std::to_string(steamid) +
		"&appid=" + std::to_string(appid) +
		"&l=" + lang; // creating url to the playerachievements 

	std::string resp;
	if (Performcurlrequest(curl, url, resp) != 1 || resp.empty()) // performing curl request on that url
	{
		return nlohmann::json::parse("", nullptr, false); // curl request failed
	}

	auto j = nlohmann::json::parse(resp, nullptr, false); // parsing the curl request

	if (j.is_discarded() || !j.contains("playerstats")) // checking if the parsing failed (is_discarded) or if it doesnt contain playerstats
	{
		return nlohmann::json::parse("", nullptr, false); // parsing failed or doesnt contain playerstats
	}
	// Optionally, you can normalize some known odd cases here:
	// - If the app has no stats: j["playerstats"]["success"] == false with an "error" message.
	// - If the user's game details are private: same as above, or the achievements array absent.
	// Just return j as-is; your caller already checks .contains("playerstats") and success flag.


	return j;  // returns the raw parsed json that will be searched for specific achievements for specific games and placed into the user later
}

User createuser(const std::string& apiKey, CURL* curl)
{
	User user; // creating user 

	// getting friendcode and displayname via input (will be better looking later, right now its only console shi)

	uint64_t friendcode;
	std::string displayname;

	std::cout << "Name:\n";

	std::cin >> displayname;

	std::cout << "Friendcode\n";

	std::cin >> friendcode;

	auto steamidOpt = getsteamID64(friendcode); // turning friendcode into steamID64

	bool validprofile = getcommunityvisibilityandprofilestates(curl, apiKey, steamidOpt, user); // getting c.visibility and profile states +  checking if the profile is valid
	if (!validprofile) { // if the profile isnt valid throw an exception
		// This is the strongest signal the code/ID doesn't resolve to a real account
		throw std::runtime_error("No Steam profile found for friend code: " + friendcode);
	}


	// setting information to the user

	user.steamid = steamidOpt;
	user.persona_name = displayname;
	user.urlprofile = getsteamURL(user.steamid);

	std::string ownedgamesurl = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/" // setting owned games url
		"?key=" + apiKey +
		"&steamid=" + std::to_string(user.steamid) +
		"&include_played_free_games=1"
		"&include_appinfo=1";

	std::string ownedgamesresponse; // getting owned games thorugh curl
	int ownedgamesresult = Performcurlrequest(curl, ownedgamesurl, ownedgamesresponse);
	if (ownedgamesresult != 1 || ownedgamesresponse.empty()) {
		std::cerr << "Failed to fetch owned games for " << user.steamid << "\n";
		return user;
	}

	auto parsedresponse = nlohmann::json::parse(ownedgamesresponse, nullptr, false); // parsing owned games curl response
	if (parsedresponse.is_discarded() || !parsedresponse.contains("response")) {
		std::cerr << "Invalid JSON\n";
		return user;
	}

	if (parsedresponse["response"].contains("games")) { // checks if the response contains "games" (which it should since the url is getownedgames)
		for (const auto& g : parsedresponse["response"]["games"]) { // loops through the games after checking for them
			
			Usergame ug; // building the sample usergames for the loop, which will be added onto a usergames vector later on
			ug.name = g.value("name", "");
			ug.appid = g.value("appid", 0); // set its appid. If the field is missing, return 0.
			ug.playtime_forever = g.value("playtime_forever", 0); // get the playtime the player has on it. If the field is missing, return 0.
			ug.last_played = g.value("rtime_last_played", 0); // get the time he last played. If the field is missing, return 0.

			auto achJson = getplayerachievements(curl, apiKey, user.steamid, ug.appid); // get the function which returns a JSON object which (should) have the achievements in it
			if (!achJson.is_discarded() && achJson.contains("playerstats") && achJson["playerstats"].value("success", false)) // if the parsing didnt fail and the parsed JSON structure contains "playerstats" and the value for playerstats is true (steam actually returned achievement data, no privacy block for example)
 {
				for (const auto& a : achJson["playerstats"]["achievements"]) { // iterate through achievements
					AchievementUnlock au( // build a specific achievement
						a.value("apiname", ""), // name for achievement
						a.value("achieved", 0) == 1, // achieved yes or no
						a.value("unlocktime", 0) // how long it took to unlock it
					);
					ug.achievements[au.api_name] = au; // ad that achievement to the achievements vector with the key as the API name for the achievement
				}
			}

			user.addGame(ug); // finally, add the usergame to the user
		}
	}


	printinfo(user);

	// return the filled user

	return user;
  
}