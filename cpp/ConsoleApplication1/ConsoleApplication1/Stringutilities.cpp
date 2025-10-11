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
#include <chrono>
#include <thread>
#include <regex>
#include <gumbo.h>
#include <unordered_set>
#include <fstream>
#include "Stringutilities.h"


static inline std::string norm(std::string s) { // setting this to static ensures the functionsare only visible on this cpp file
    auto l = s.find_first_not_of(" \t\n\r"); // looks from start to end of the string for the first character which is not a: whitespace, tab, newline, or carriage return (function that moves cursor back to start of the current line). If all characters are of disallowed values, npos is returned.
    auto r = s.find_last_not_of(" \t\n\r"); // looks from end to start to do the same thing

    if (l == std::string::npos) { // if the string was all whitespace or otherwiise useless text we set s to just be whitespace
        s = "";
    }
    else { //  if the string is not all useless text, we take the first non-whitespace character(l) and the last non-whitespace character(r) and get the string between and including those two
        s = s.substr(l, r - l + 1);
    }

    for (auto& c : s) c = (char)std::tolower((unsigned char)c); // iterates over all objects in the string s, turns all of them into lowercase letters
    return s; // returns trimmed + lowercased string
}


static inline bool hasGenre(const Game& g, std::string needle) { // function to verify if a specific game has a specific genre
    needle = norm(needle); // takes the genre requested to be verified for the game and normalizes it
    for (auto& gname : g.genres) // loops through the game's genres to check if one matches with the specific genre requested
        if (norm(gname) == needle) return true;
    return false;
}

static inline bool hasAnyGenre(const Game& g, const std::vector<std::string>& needles) { // same as function above but for a list of game genres
    for (auto& n : needles) 
    return false;
}

