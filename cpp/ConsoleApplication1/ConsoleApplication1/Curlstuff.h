#pragma once
#include <curl/curl.h>

size_t writecallback(void* buffercontents, size_t sizeperblock, size_t numberofblocks, void* userp);

CURL* Initializecurl();

void ProtocolsTLS_SSL(CURL* curl);

int Performcurlrequest(CURL* curl, std::string url, std::string& response_data);

void curl_init_once();

class Dynamicdelay
{
    int current_delay_ms = 1000;  // Start with 1 second
    const int max_delay_ms = 5000;  // Maximum 5 seconds
    const int min_delay_ms = 500;   // Minimum 500 ms
    const int increase_step = 250;  // Increase by 250ms each time
    int consecutive_failures = 0;

public:
    
    void delay();
    void increase();
    void decrease();
    void reset();
};

