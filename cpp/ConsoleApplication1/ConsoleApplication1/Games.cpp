
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_driver.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_connection.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\prepared_statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\resultset.h"
#include <iostream>
#include "Gamesdatabase.h"
#include "Stringutilities.h"
#include "Games.h"
#include <string>
#include <vector>
#include <sstream>
#include <curl/curl.h>
#include "C:/Users/joao/Desktop/C++ LIBS/nlohmann JSON library/json.hpp"

// This is the Games.cpp file

Game::Game(int id,
    const std::string& game_name,
    const std::vector<std::string>& game_genres,
    const std::vector<std::string>& game_tags,
    const std::string& game_devs,
    const std::string& game_publishers)
    : appid(id),
    name(game_name),
    genres(game_genres),
    tags(game_tags),
    developers(game_devs),
    publishers(game_publishers) {}

std::string Game::vectortostring(const std::vector<std::string>& v) const {
    std::string out;
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) out += ", ";
        out += v[i];
    }
    return out;
}

void Game::Printgameinfo() const {
    std::cout << appid << " | " << name
        << " | dev: " << developers
        << " | pub: " << publishers
        << " | genres: " << vectortostring(genres)
        << " | tags: " << vectortostring(tags)
        << "\n";
}

bool Game::dudornot() const {
    return name.empty() || name == "UNKNOWN";
}
