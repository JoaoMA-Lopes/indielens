
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
#include <chrono>
#include <thread>
#include <regex>
#include <gumbo.h>
#include <unordered_set>
#include <fstream>

static size_t CurlWriteStr(void* c, size_t s, size_t n, void* u) { // when curl receives data, it receives said data in chunks. Function here works to tell curl how to handle each chunk.
    static_cast<std::string*>(u)->append(static_cast<char*>(c), s * n); // s is the size of each chunk and n is the number of elements, therefore one multiplied by the other gives us how many charactersto append to c (pointer to downloaded bytes)
    return s * n;
}

std::string fetchSteamStorePageHTML(CURL* curl, int appid) { // builds full steam store page a given appid
    std::string html;
    std::string url = "https://store.steampowered.com/app/" + std::to_string(appid) + "/?l=english&cc=us"; // creates the link of the steam store page given an appid

    curl_easy_reset(curl); // clears any old options
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str()); // tells curl to use the url we just built
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, CurlWriteStr); // tells curl to handle each chunk like CurlWriteStr
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &html); // Tells curl to fill the address html with the downloaded bytes from the chunks
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L); // Tells curl to follow any redirects steam responds with
    curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, ""); // allows curl to accept compression of the data (gzip, etc)

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "User-Agent: Mozilla/5.0"); // makes our request look like a real browser
    headers = curl_slist_append(headers, "Accept-Language: en-US,en;q=0.9"); // requests page in english
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers); // tells curl to use the previously set headers

    // Sets our birth date to 1985 and tells steam we accept mature content to bypass mature content pages
    curl_easy_setopt(curl, CURLOPT_COOKIE,
        "birthtime=441763201; lastagecheckage=1-January-1985; mature_content=1; wants_mature_content=1");

    CURLcode rc = curl_easy_perform(curl); // performs the request
    curl_slist_free_all(headers); // dissolutes the headers previously built after use


    // error handling, if the curl request isnt ok the error is printed
    if (rc != CURLE_OK) {
        std::cerr << "Failed to fetch store page: " << curl_easy_strerror(rc) << "\n";
        return {};
    }
    return html;
}