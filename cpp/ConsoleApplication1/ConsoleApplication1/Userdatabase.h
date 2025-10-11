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
#include "Users.h"

std::string getsteamID64(const std::string& friendcode);

std::string getsteamURL(const std::string& friendcode);

User createuser(const std::string& apiKey, CURL* curl);

bool getcommunityvisibilityandprofilestates(CURL* curl, const std::string& apiKey, uint64_t steamid, User& user);