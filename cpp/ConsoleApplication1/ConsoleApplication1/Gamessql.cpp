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

#include <mysqlx/xdevapi.h>

void runSQL() {
    try {

        // Uses a pointer because it is likely that this will be accessed multiple times globally, so its best to use a pointer instead of repeatedly copying the MySQL_Driver object

        sql::mysql::MySQL_Driver* driver = sql::mysql::get_mysql_driver_instance();

        // Establish a connection
        sql::Connection* conn = driver->connect("tcp://127.0.0.1:3306", "root", "SCkHUvkgy7_++");

        // Output success message
        std::cout << "\nConnected to MySQL server successfully!" << std::endl;

        // Clean up the connection
        delete conn;

    }
    catch (sql::SQLException& e)
    {
        std::cerr << "MySQL error: " << e.what() << std::endl;
    }
}

int rungamedatabasetest () {
    try {
        mysqlx::Session sess("127.0.0.1", 33060, "root", "Kaizokuoninaruotokoda"); // connects to local mysql X plugin (what allows you to manage the database through visualstudio)

   
        mysqlx::Schema db = sess.getSchema("steam_data", true); // schema is the same as database. It gets the database steam_data and then sets that to the variable db.
        mysqlx::Table games = db.getTable("games", true); // a database is a folder which contains many tables. This is connecting to the games table which contains the rows of information on games.

     
        games.insert("appid", "name", "genres") // specifies the columns which the information will be inserted in
            .values(123, "Test Game", "Action,RPG") // inserts the information into the specified columns
            .execute(); // executes

        
        mysqlx::RowResult res = games.select("appid", "name", "genres").execute(); // runs a query to select the rows of those 3 columns. Returns all the rows.

        mysqlx::Row row;
        while ((row = res.fetchOne())) { // pulls and prints each row one by one
            std::cout << row[0] << " | " << row[1] << " | " << row[2] << std::endl;
        } 

        std::cout << "Done." << std::endl;
    }
    catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    return 0;
}

int rungamedatabaseactual() {
   
}

void upsertgame(mysqlx::Session& sess, int appid, const std::string& name, const std::string& developer, const std::string& publisher) // inserts a row into the games table with the information categories of a game which aren't vectors. If there already is a row with that given appid, it just updates the values within it
{
    sess.sql(
        "INSERT INTO steam_data.games (appid, name, developer, publisher) " // inserting into the games table of the steam_data database
        "VALUES (?, ?, ?, ?) AS new "
        "ON DUPLICATE KEY UPDATE " // again, if there already is a row with that appid, this code will just update the information in it.
        "  name = new.name, "
        "  developer = new.developer, "
        "  publisher = new.publisher"
    )
        .bind(appid, name, developer, publisher)  // safely injects values into the "?" question mark placeholders
        .execute(); // actually executes all of ts
}

void insertgenres(mysqlx::Session& sess, int appid, const std::vector<std::string>& genres) // takes all genres from the string of game genres and inserts them with (appid, genre) into the game_genres table
{
    if (genres.empty()) return; // if the genre string is empty we just return
    auto stmt = sess.sql(
        "INSERT IGNORE INTO steam_data.game_genres (appid, genre) VALUES (?, ?)" // again, inserting the genres with the format (appid, genre) for easy comparison. INSERT IGNORE means if the pair already exists MySQL just skips it
    );
    for (const auto& g : genres) // range-based for loop to insert the genres into the game_genres table for a given appid
    { 
        if (!g.empty()) stmt.bind(appid, g).execute(); // safely injects values into the "?" question mark placeholders and executes all of the code in the same line
    }
}

void inserttags(mysqlx::Session& sess, int appid, const std::vector<std::string>& tags) // same as previous function but with tags instead of genres. Also, it uses the game_tags table instead of the game_genres table
{
    if (tags.empty()) return; 
    auto stmt = sess.sql(
        "INSERT IGNORE INTO steam_data.game_tags (appid, tag) VALUES (?, ?)"
    );
    for (const auto& t : tags) {
        if (!t.empty()) stmt.bind(appid, t).execute();
    }
}

void ingestOne(mysqlx::Session& sess, const Game& g) { // This is the orchestrator for a single game object. It takes a given Game object and upserts the core row and inserts all genres into game_genres and all tags into game_tags
    upsertgame(sess, g.appid, g.name, g.developers, g.publishers);
    insertgenres(sess, g.appid, g.genres);
    inserttags(sess, g.appid, g.tags);
}