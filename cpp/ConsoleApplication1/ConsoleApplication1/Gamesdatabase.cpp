
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


// This is the Gamesdatabase cpp file

using json = nlohmann::json;

static const char* get_attr(GumboNode* node, const char* name) {  // looks up an attribute by name in an HTML element node and gives its value, for example looks for an attribute "class" and gives you the value like "app_tag"

	if (!node || node->type != GUMBO_NODE_ELEMENT) return nullptr; // checks if the node is null or isnt one of the gumbo node elements. If its not a gumbo node element or already is null, we return it as null.
	GumboAttribute* a = gumbo_get_attribute(&node->v.element.attributes, name); // creating a pointer of type gumboattribute, settiing it to be equal to what returns from thesearch for a specific attribute (name) in the node
	return a ? a->value : nullptr; // "if a isnt null, return a. if a is null, return nullptr"
}

static void collect_text(GumboNode* n, std::string& out) { // recursive text collector, collects texts from the middle of html jargon. "out" is the string we are filling up with text and "n" is the pointer to the node of data
	if (!n) return; // if the node is empty return nothing
	if (n->type == GUMBO_NODE_TEXT || n->type == GUMBO_NODE_WHITESPACE) { // if the node is whitespacve or text we append it to the "out" string
		out += n->v.text.text; // said appending
	}
	else if (n->type == GUMBO_NODE_ELEMENT) { // if the node is an element then it can have children so we recursively add the kids to the "out" string.
		auto* kids = &n->v.element.children; // setting an auto variable named "kids" to said children of the element
		for (unsigned i = 0; i < kids->length; ++i) // iterates through all kids
			collect_text(static_cast<GumboNode*>(kids->data[i]), out); // said recursive call
	}
}

std::vector<std::string> extractSteamTagsWithGumbo(const std::string& html) { // function to extract tags. takes string of raw html as the parameter.
	std::vector<std::string> tags;
	GumboOutput* out = gumbo_parse(html.c_str()); // gumbo parses the string of html data into a DOM tree to allow for parent child relationship ordering (tree which follows html nesting) seen below 
	/*
	  <html>
         <body>
             <a class="app_tag">Indie</a>
         </body>
      </html>
	*/

	std::function<void(GumboNode*)> walk = [&](GumboNode* node) {  // DFS search of the previously built DOM tree, searching for tags in every branch
		if (!node || node->type != GUMBO_NODE_ELEMENT) return; // if the node isnt an element node there is no point in trying to extract tags so its just skipped

		if (node->v.element.tag == GUMBO_TAG_A) { // if the node a is a is an element (which it is otherwise the function wouldve already returned) and it is a tag
			if (const char* cls = get_attr(node, "class")) { // get its class attribute
				// Steam tags look like: <a class="app_tag">Indie</a>
				if (std::string(cls).find("app_tag") != std::string::npos) { // see if the class attribute contains a app tag. if it does, we collect the text inside the tag and trim it
					std::string text; // makes empty string
					auto* kids = &node->v.element.children; // sets an auto "kids" to equal the children of the current element node
					for (unsigned i = 0; i < kids->length; ++i)
						collect_text(static_cast<GumboNode*>(kids->data[i]), text); // recursively looks through the "kids" (DEPTH FIRST SEARCH!!!!!) and fill the empty text with it
					text = trim(text); // trim the empty text
					if (!text.empty()) tags.push_back(text); // if the result isnt empty (AKA this whole thing wasnt pointless) add it to the tags vector
				}
			}
		}
		auto* kids = &node->v.element.children;
		for (unsigned i = 0; i < kids->length; ++i)
			walk(static_cast<GumboNode*>(kids->data[i])); // continue recursing through the whole tree to look for tags which are arbitrarily deep
	};

	walk(out->root); // calling the walk function for the "out" string, walking FROM THE ROOT (DFS!!!! FUCK YEAH!!!)
	gumbo_destroy_output(&kGumboDefaultOptions, out); // free the DOM tree (its useless data after its already been searched through for tags)
	return tags; // return the tags
}



Gamesdatabase::Gamesdatabase()
{

}

std::vector<int> loadAppIDsFromFile(const std::string& filename) {
	std::vector<int> appIDs;
	std::ifstream file(filename); // opens the file
	if (!file.is_open()) {
		std::cerr << "Failed to open file: " << filename << "\n";
		return appIDs;
	}

	int id;
	while (file >> id) {
		appIDs.push_back(id);
	}

	std::cout << "Loaded " << appIDs.size() << " AppIDs from file.\n";
	return appIDs;
}

size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
	size_t totalSize = size * nmemb;
	std::string* str = static_cast<std::string*>(userp);
	str->append(static_cast<char*>(contents), totalSize);
	return totalSize;
}

void Gamesdatabase::fetchappdetails(const std::string& apiKey, CURL* curl, bool test)
{
	std::vector<App> Appvector;

	if (test) {
		std::vector<int> indieIDs = loadAppIDsFromFile("top1000_indie_ids.txt"); 
		for (int id : indieIDs) {
			Appvector.push_back(App{ id, "" });
		}
	}
	else {
		std::cout << "You must provide a pre-made list for testing.\n";
		return;
	}


	const std::string baseappdetailurl = "https://store.steampowered.com/api/appdetails?appids=";
	Gamesandtheirinfo.clear();
	Dynamicdelay delay;

	// Reset cURL options
	curl_easy_reset(curl);

	struct curl_slist* headers = NULL; // Creates list of fake HTTP headers with an added User-Agent to mimic a browser
	
	headers = curl_slist_append(headers, "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
	headers = curl_slist_append(headers, "Accept: application/json");
	headers = curl_slist_append(headers, "Accept-Language: en-US,en;q=0.9");
	headers = curl_slist_append(headers, "Connection: keep-alive");
	headers = curl_slist_append(headers, "Referer: https://store.steampowered.com/");

	// Thus bypassing some annoying walls. CURLOPT_HTTPHEADER tells cURL to send these fake headers with the overall cUrl request
	if (!headers) {
		std::cerr << "Failed to create headers!" << std::endl;
		return;
	}

	curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
	int processed_games = 0;

	for (const App& app : Appvector)
	{
		
		std::string response_data;

		std::string url = baseappdetailurl + std::to_string(app.appappid) + "&key=" + apiKey + "&cc=us&l=english"; // Pretend even more we're a browser by requesting the language to be english

		int result; 
		do {
			delay.delay(); // Apply delay before request
			result = Performcurlrequest(curl, url, response_data);
			if (result == -3) {
				delay.increase();
			}
			else if (result == 1) {
				delay.decrease(); // Try going faster on success
			}
		} while (result == -3); // while access denied is being returned

		std::cout << "Response data size before parsing: " << response_data.size() << std::endl;
		
		Game game = appdetailsParseJSON(response_data);

		if (game.appid != 0 && result == 1) {  // Only add valid games
			// fetch tags from Steam store page
			std::string html = fetchSteamStorePageHTML(curl, game.appid);
			if (!html.empty()) {
				game.tags = extractSteamTagsWithGumbo(html);  // populate tags
				std::cout << "Tags collected: ";
				for (const auto& t : game.tags) std::cout << "[" << t << "] ";
				std::cout << "\n";
			}

			Gamesandtheirinfo.push_back(game);
			processed_games++;
			std::cout << "Success. Total games collected: " << Gamesandtheirinfo.size() << "\n";
		}
		else if (game.appid == 0 and result == 1)
		{
			std::cout << "Indeed, the HTTP request was succesful. However, the app is not a game.";
		}
		else {
			std::cerr << "Skipping invalid game data for App ID: " << app.appappid << "\n";

			switch (result)
			{
			case -2:
				std::cout << "curl is ok but the app is a dud\n";
				break;
			case -1:
				std::cout << "curl isn't ok\n";
				break;
			case -3:
				std::cout << "access denied\n";
				break;
			case 0:
				std::cout << "response data is empty\n";
				break;
			}
		}

		
	}

	std::cout << "Finished fetching game details. Total: " << Gamesandtheirinfo.size() << " games.\n";

	curl_slist_free_all(headers); // frees memory allocated to fake headers AFTER THEY HAVE BEEN USED. This is because their only purpose is to mimic a browser to bypass TLS verification. Important to prevent memory leaks.

	curl_easy_cleanup(curl);  // Clean up and frees resources associated with cURL after the request. Prevents resource leaks. Should always be called after you are done with a request.
}

std::vector<App> Gamesdatabase::fetchapplist(const std::string& apiKey, CURL* curl)
{
	std::this_thread::sleep_for(std::chrono::milliseconds(1500)); // Increase delay to 1.5 seconds

	const std::string applisturl = "https://api.steampowered.com/ISteamApps/GetAppList/v2/?filter=games";
	
	std::string response_data;

	// Reset cURL options
	curl_easy_reset(curl);

	struct curl_slist* headers = NULL; // Creates list of fake HTTP headers with an added User-Agent to mimic a browser
	headers = curl_slist_append(headers, "User-Agent: Mozilla/5.0"); // Thus bypassing some annoying walls. CURLOPT_HTTPHEADER tells cURL to send these fake headers with the overall cUrl request
	curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

	Performcurlrequest(curl, applisturl, response_data); // returns response data of applist as string, will be parsed to JSON format

	curl_slist_free_all(headers); // frees memory allocated to fake headers AFTER THEY HAVE BEEN USED. This is because their only purpose is to mimic a browser to bypass TLS verification. Important to prevent memory leaks.

	std::cout << "Response data size before parsing: " << response_data.size() << std::endl;

	if (response_data.empty()) {
		std::cerr << "WARNING: No data received from Steam API for applist!" << std::endl;
	}

	return applistParseJSON(response_data);
}

std::vector<App> Gamesdatabase::applistParseJSON(const std::string response_data)
{
	// Check if data received is empty before even attempting to parse
	if (response_data.empty()) {
		std::cerr << "Empty response data\n";
	}

	try {

		std::cout << "Response data: ", response_data;
		
		json response_json = json::parse(response_data);  // Parse string object to JSON object (convert)

		std::vector<App> Apps;

		int testornot = 2; // forcing the testids just for now

		if (testornot == 1)
		{
			if (response_json.contains("applist") && response_json["applist"].contains("apps")) { // Verify the structure of the JSON before attempting to parse it to catch any unexpected things early
				for (const auto& app : response_json["applist"]["apps"]) { // This is called a range-based for loop. Iterates over the array of apps in the applist

					if (app.contains("appid") && app.contains("name")) {
						App app_entry;
						app_entry.appappid = app["appid"].get<int>();
						app_entry.appname = app["name"].get<std::string>();

						Apps.push_back(app_entry);
					}
				}
				return Apps;
			}
			else {
				std::cerr << "Unexpected JSON structure\n";
			}
		}
		else
		{
			for (int i = 0; i < Testindieidslist.size(); i++)
			{
				App app_entry;
				app_entry.appappid = Testindieidslist[i];

				Apps.push_back(app_entry);
				
			}
			return Apps;
		}

		
	}

	// catching the other possibilities of errors
	catch (const nlohmann::json::parse_error& e) {
		std::cout << "JSON parsing error: " << e.what() << std::endl;

		// Additional debugging, giving response data (at least a bit of it)
		std::cerr << "Response data size: " << response_data.size() << std::endl;
		std::cerr << "First 1000 characters:\n" << response_data.substr(0, 1000) << std::endl;
	}
	catch (const std::exception& e) {
		std::cerr << "Unexpected error: " << e.what() << std::endl;
	}
	return std::vector<App>();
}

Game Gamesdatabase::appdetailsParseJSON(const std::string response_data)
{
	// Check if the response data is empty
	if (response_data.empty()) {
		std::cerr << "Empty response data\n";
	}

	try {
		json response_json = json::parse(response_data);
		std::cout << "Parsed JSON: " << response_json.dump(2) << std::endl;

		App app;

		for (auto it = response_json.begin(); it != response_json.end(); ++it) // iterates through the response_json
		{
			const std::string& appid_str = it.key();
			const auto& app_data = it.value();

			if (app_data.contains("success") && app_data["success"].get<bool>() == true && app_data.contains("data")) {
				const auto& data = app_data["data"];

				app.appappid = std::stoi(appid_str);

				if (data.contains("type") == true && data.contains("fullgame") != true)
				{
					if (data.contains("type") and data["type"].get<std::string>() == "game")
					{
						app.is_game = true;

						// Extract name
						if (data.contains("name")) {
							app.appname = data["name"].get<std::string>();
						}

						// Extract genres - Modified to handle array of objects
						if (data.contains("genres") && data["genres"].is_array())
						{
							for (const auto& genre : data["genres"]) {
								if (genre.contains("description")) {
									app.appgenres.push_back(genre["description"].get<std::string>());
								}
							}
						}

						// Extract developers - Modified to handle arrays
						if (data.contains("developers") && data["developers"].is_array())
						{
							std::string dev_string;
							for (const auto& dev : data["developers"]) {
								if (!dev_string.empty()) dev_string += ", ";
								dev_string += dev.get<std::string>();
							}
							app.appdevelopers = dev_string;
						}

						// Extract publishers - Modified to handle arrays
						if (data.contains("publishers") && data["publishers"].is_array())
						{
							std::string pub_string;
							for (const auto& pub : data["publishers"]) {
								if (!pub_string.empty()) pub_string += ", ";
								pub_string += pub.get<std::string>();
							}
							app.apppublishers = pub_string;
						}

						std::cout << "Successfully created game object\n";

						return Game(app.appappid, app.appname, app.appgenres, app.apptags, app.appdevelopers, app.apppublishers);
					}
					else
					{
						std::cout << "Rejected - non-game type: " << data["type"].get<std::string>() << " for appid: " << appid_str << std::endl;
						return Game(0, "", std::vector<std::string>(), std::vector<std::string>(), "", "");
					}
				}
			}
			else {
				std::cout << "\nRejected due to missing/invalid fields for appid: " << appid_str << std::endl;
				if (!app_data.contains("type")) std::cout << "Missing type field" << std::endl;
				if (!app_data["success"]) std::cout << "Success is false" << std::endl;
				if (app_data.contains("fullgame")) std::cout << "Contains fullgame field" << std::endl;
				return Game(0, "", std::vector<std::string>(), std::vector<std::string>(), "", "");
			}
		}
		return Game(0, "", std::vector<std::string>(), std::vector<std::string>(), "", ""); // Return empty game if not a game
	}
	catch (const nlohmann::json::parse_error& e) {
		std::cerr << "JSON parsing error: " << e.what() << "\n";
		// Print the problematic JSON for debugging
		std::cerr << "Response data:\n" << response_data << "\n";
	}
	catch (const std::exception& e) {
		std::cerr << "Unexpected error: " << e.what() << "\n";
	}
	return Game(0, "", std::vector<std::string>(), std::vector<std::string>(), "", "");
}

