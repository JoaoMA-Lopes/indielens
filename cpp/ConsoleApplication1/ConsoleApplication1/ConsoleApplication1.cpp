// ConsoleApplication1.cpp : Este arquivo contém a função 'main'. A execução do programa começa e termina ali.
//


#define CURL_STATICLIB
#include <iostream>
#include <string>
#include <vector>
#include "Userdatabase.h"
#include "Gamesdatabase.h"
#include "Gamessql.h"
#include <curl/curl.h>
#include "C:/Users/joao/Desktop/C++ LIBS/nlohmann JSON library/json.hpp"
#include "Curlstuff.h"
#include "Games.h"
#include "Usersql.h"
#include "Weighting.h"

// This is the ConsoleApplication1 cpp file

void rungamescraping(const std::string& APIkey, CURL* curl, mysqlx::Session& sess)
{
	Gamesdatabase gd;
	gd.fetchappdetails(APIkey, curl, true);

	const auto& games = gd.getCollectedGames(); // small getter, see below
	for (const Game& g : games) {
		try {
			sess.startTransaction();
			upsertgame(sess, g.appid, g.name, g.developers, g.publishers);
			insertgenres(sess, g.appid, g.genres);
			inserttags(sess, g.appid, g.tags);
			sess.commit();

			std::cout << "Stored " << g.appid << " | " << g.name
				<< " | dev: " << g.developers
				<< " | pub: " << g.publishers
				<< " | genres: " << g.genres.size()
				<< " | tags: " << g.tags.size() << "\n";
		}
		catch (const std::exception& e) {
			sess.rollback();
			std::cerr << "DB error on " << g.appid << ": " << e.what() << "\n";
		}
	}

	std::cout << "Number of games to print: " << gd.Gamesandtheirinfo.size() << "\n";

	for (const Game& game : gd.Gamesandtheirinfo)
	{
		game.Printgameinfo();
	}
}

void runuserscraping(const std::string& APIkey, CURL* curl, mysqlx::Session sess)
{
	
}

int main()
{
	curl_init_once();
	mysqlx::Session sess("127.0.0.1", 33060, "root", "Kaizokuoninaruotokoda");
	sess.sql("USE steam_data").execute();
	auto row = sess.sql("SELECT DATABASE()").execute().fetchOne();
	std::cout << "DB = " << row[0].get<std::string>() << "\n";

	// initializing CURL stuff and setting constant for API key
	curl_global_init(CURL_GLOBAL_DEFAULT);
	const std::string APIkey = "893E7D75278A77EA0A4467325830E425";

	// Get version information
	curl_version_info_data* version_info = curl_version_info(CURLVERSION_NOW);
	std::cout << "libcurl version: " << version_info->version << std::endl;

	CURL* curl = Initializecurl();
	if (!curl) {
		std::cerr << "Failed to initialize CURL" << std::endl;
		return 1;
	}

	// Check if games database is populated
	auto gameCountRes = sess.sql("SELECT COUNT(*) FROM steam_data.games").execute().fetchOne();
	uint64_t gameCount = gameCountRes[0].get<uint64_t>();
	std::cout << "\n=== Steam Database Status ===\n"; // prints database status
	std::cout << "Games in database: " << gameCount << "\n\n"; // prints number of games in gamesdatabase

	if (gameCount == 0) { // if there are no games in the gamesdatabase
		std::cout << "⚠ WARNING: Games database is empty!\n";
		std::cout << "You need to scrape games first before adding users.\n";
		std::cout << "Run game scraping now? (y/n): ";
		char choice;
		std::cin >> choice;
		if (choice == 'y' || choice == 'Y') {
			std::cout << "Scraping all Steam games (this may take a while)...\n";
			rungamescraping(APIkey, curl, sess);
			std::cout << "Game scraping complete!\n\n";
		}
		else {
			std::cout << "Exiting. Please run game scraping before adding users.\n";
			curl_easy_cleanup(curl);
			curl_global_cleanup();
			return 0;
		}
	}
	else {
		std::cout << "✓ Games database is populated\n";
		std::cout << "Update games database? (y/n): "; // to update games database if necessary (later will bautomated between t periods) (uses gamesscraping)
		char choice;
		std::cin >> choice;
		if (choice == 'y' || choice == 'Y') {
			std::cout << "Updating games database...\n";
			rungamescraping(APIkey, curl, sess);
			std::cout << "Update complete!\n\n";
		}
	}

	// Now proceed with user operations
	std::cout << "\n=== User Operations ===\n";
	std::cout << "Sign up (1) or Log in (2)\n";
	int signuporlogin;
	std::cin >> signuporlogin;

	if (signuporlogin == 1)
	{
		User u = createuser(APIkey, curl); // create and ingest user if they are to signu p
		try {
			ingestone(sess, curl, APIkey, u);
		}
		catch (const mysqlx::Error& e) {
			std::cerr << "[MySQLX] " << e.what() << "\n";
		}

		bool wantstorate = true;

		while (wantstorate)
		{
			dotherating(sess, u.steamid, u);

		}
	}
	else if (signuporlogin == 2)
	{
		// Login code to be done
		std::cout << "Login functionality not yet implemented\n";
	}
	

	curl_easy_cleanup(curl);
	curl_global_cleanup();
	return 0;

}