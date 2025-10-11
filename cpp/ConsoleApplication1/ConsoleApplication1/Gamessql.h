#pragma once

#include <iostream>
#include <stdexcept>
#include <string>
#include <cstdlib>
#include "Games.h"

#include <mysqlx/xdevapi.h>

int rungamedatabasetest();
int rungamedatabaseactual();

void upsertgame(mysqlx::Session& sess, int appid, const std::string& name, const std::string& developer, const std::string& publisher);

void ingestOne(mysqlx::Session& sess, const Game& g);

void inserttags(mysqlx::Session& sess, int appid, const std::vector<std::string>& tags);
void insertgenres(mysqlx::Session& sess, int appid, const std::vector<std::string>& genres);