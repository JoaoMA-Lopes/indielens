#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_driver.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_connection.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\prepared_statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\resultset.h"
#include <iostream>
#include "Gamesdatabase.h"
#include "Games.h"
#include <string>
#include <vector>
#include <sstream>
#include <curl/curl.h>
#include "C:/Users/joao/Desktop/C++ LIBS/nlohmann JSON library/json.hpp"
#include "Curlstuff.h"
#include <chrono>
#include <thread>
#include "Minmax.h"

// This is the Curlstuff cpp file

// Call once at program start (e.g., in main())
void curl_init_once() {
	static bool inited = false;
	if (!inited) {
		curl_global_init(CURL_GLOBAL_DEFAULT);
		inited = true;
	}
}

size_t writecallback(void* buffercontents, size_t sizeperblock, size_t numberofblocks, void* userp)
{
	// calculates total data size from the size of each data block, and the number of data blocks sent
	size_t total_datasize = sizeperblock * numberofblocks;

	// Validate inputs
	if (buffercontents == nullptr or userp == nullptr) {
		std::cerr << "Invalid buffer or user pointer in write callback! It's null!" << std::endl;
		return 0;
	}

	std::string* response = static_cast<std::string*>(userp); // cast userp, generic pointer to point to std::string*. To do this it first converts from void to string.

	// made this a try block because everything has to be a tryblock with this runtime shit
	try {
		response->append(static_cast<char*>(buffercontents), total_datasize); // cast buffercontents to char because std::string::append requires a char
	}
	catch (const std::exception& e) {
		std::cerr << "Exception in write callback: " << e.what() << std::endl;
		return 0;
	}

	return total_datasize;
}

CURL* Initializecurl()
{
	CURL* curl;

	std::string response_data;

	curl = curl_easy_init();

	if (curl == NULL)
	{
		std::cout << "HTTP request has failed\n";
	}
	else
	{
		std::cout << "HTTP request has been handled successfully\n";
		return curl;
	}
}

void ProtocolsTLS_SSL(CURL* curl)
{
	curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L); // Verify the server's SSL certificate 
	curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L); // Verify it again more stricly
	curl_easy_setopt(curl, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_2);  // Force the latest TLS version to be used
	curl_easy_setopt(curl, CURLOPT_SSL_ENABLE_ALPN, 1L); // both of these enable protocol negotiation
	curl_easy_setopt(curl, CURLOPT_SSL_ENABLE_NPN, 1L);
	curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);  // Added this to follow redirects

}

int Performcurlrequest(CURL* curl, std::string url, std::string& response_data)
{

	static bool curl_inited = (curl_global_init(CURL_GLOBAL_DEFAULT) == 0);

	response_data.clear(); // clear response data

	curl_easy_reset(curl);

	char error_buffer[CURL_ERROR_SIZE] = { 0 }; // creates error buffer to store detailed error messages
	curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, error_buffer); // tells cURL to send error messages to the error_buffer variable
	error_buffer[0] = 0; // Ensure buffer is initialized and empty, so that it can be written to

	curl_easy_setopt(curl, CURLOPT_URL, url.c_str()); 	// Set URL

	curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writecallback); 	// Set write callback to handle incoming data and specifies where to store it. (the writecallback function specifies how to process the data)
	curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_data); // tells cURL to pass the response into the response_data

	curl_easy_setopt(curl, CURLOPT_VERBOSE, 0L); // Disable verbose output for no unnecessary diagnostic information of the request (fucking schannel errors)

	ProtocolsTLS_SSL(curl); // Sets the protocols for TLS and SSL handling between the PC and the steam server

	// Timeout settings
	curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L); // Sets the maximum allowed time for the entire request (30 seconds)
	curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 20L); // Sets the maximum allowed time to try to establish a connection (20 seconds). Both of these prevent hanging infinitely in one function.

	// Perform the request
	CURLcode result = curl_easy_perform(curl);

	// Comprehensive error handling + ignoring invalid data which is too small

	if (result != CURLE_OK) {
		std::cerr << "\nCURL error: " << curl_easy_strerror(result) << " (code " << result << ")\n";

		// Print detailed error buffer if available
		if (error_buffer[0]) {
			std::cerr << "Detailed error: " << error_buffer << std::endl;
		}

		// Additional context based on the specific error
		switch (result) {
		case CURLE_SSL_CONNECT_ERROR:
			std::cerr << "SSL Connection Error. Check SSL/TLS configuration.\n";
			break;
		case CURLE_PEER_FAILED_VERIFICATION:
			std::cerr << "SSL Certificate Verification Failed.\n";
			break;
		default:
			std::cerr << "An unknown error occurred during the request.\n";
		}

		return -1;
	}
	 


	if (response_data.size() > 35)
	{
		// Check response size for potential issues
		if (response_data.empty()) {
			std::cerr << "Warning: Received empty response data\n";
			return 0;
		}

		std::cout << "\nThis HTTP request has been operated successfully\n";
		return 1;
	}
	else if (response_data.size() > 26 and response_data.size() < 35)
	{
		return -2; // dud app
	}
	else
	{
		return -3; // access denied
	}
	
}  

void Dynamicdelay::delay() {
	std::this_thread::sleep_for(std::chrono::milliseconds(current_delay_ms));
}

void Dynamicdelay::increase() {
	consecutive_failures++;
	// Increase delay more aggressively with consecutive failures
	if (consecutive_failures > 3) {
		current_delay_ms = min(current_delay_ms * 2, max_delay_ms);
	}
	else {
		current_delay_ms = min(current_delay_ms + increase_step, max_delay_ms);
	}
}

void Dynamicdelay::decrease() 
{
	
	consecutive_failures = 0;
	current_delay_ms = max(current_delay_ms - increase_step, min_delay_ms);
}

void Dynamicdelay::reset() {
	current_delay_ms = 1000;
	consecutive_failures = 0;
}

