#pragma once
#include <curl/curl.h>
#include <string>
#include <vector>

struct App
{
	int appappid;
	bool is_game;
	std::string appname;

	// will be null unless bool is_game is true:

	std::vector<std::string> appgenres;
	std::vector<std::string> apptags;

	std::string appdevelopers;
	std::string apppublishers;

	// deal with platforms later
  // ✅ Default constructor
	App() : appappid(0), appname(""), is_game(false), appgenres(), appdevelopers(""), apppublishers("") {}

	// ✅ Constructor that matches line 81
	App(int id, const std::string& n)
		: appappid(id), appname(n), is_game(false), appgenres(), appdevelopers(""), apppublishers("") {}

};

class Game {
public:
    int appid{};
    std::string name;
    std::vector<std::string> genres;
    std::vector<std::string> tags;

    // You are using these as singular strings in ingestOne
    std::string developers;
    std::string publishers;

    Game() = default;

    Game(int id,
        const std::string& game_name,
        const std::vector<std::string>& game_genres,
        const std::vector<std::string>& game_tags,
        const std::string& game_devs,
        const std::string& game_publishers);

    // If you intended this to stringify a vector, give it a parameter:
    std::string vectortostring(const std::vector<std::string>& v) const;

    void Printgameinfo() const;
    bool dudornot() const;

private:
    // (nothing yet)
};