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

static inline std::string norm(std::string s);

static inline std::string trim(const std::string& s) { // same as norm function but doesnt turn into lowercase
    const char* ws = " \t\r\n";
    size_t b = s.find_first_not_of(ws);
    if (b == std::string::npos) return {};
    size_t e = s.find_last_not_of(ws);
    return s.substr(b, e - b + 1);
}

static inline std::string join(const std::vector<std::string>& v, const char* sep = ", ") { // function to concatenate a vector of strings into one string, using the comma to separate them.
    std::string out; // string to be outputted
    for (size_t i = 0; i < v.size(); ++i) { // iterates through size of the vector of strings
        if (i > 0) { // as long as the current string is not the first we add a comma
            out += sep;
        }
        out += v[i];
    }
    return out;
}

static inline bool hasGenre(const Game& g, std::string needle);

static inline bool hasAnyGenre(const Game& g, const std::vector<std::string>& needles);