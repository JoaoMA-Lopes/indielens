# Services Used in IndieLens

## Raindrop Platform Services

### 1. Raindrop SmartInference
- **Status**: ✅ Implemented
- **Endpoints**: 
  - `POST /api/raindrop/summarize` - Summarizes long game descriptions
  - `POST /api/raindrop/recommendation` - Generates personalized game recommendations
- **Purpose**: 
  - **Summarization**: Automatically condenses lengthy game descriptions into concise summaries (200 characters max), making game information more digestible for users
  - **Personalized Recommendations**: Analyzes user's gaming history and generates explanations for why specific games match their profile, using tag/genre similarity and playtime patterns
- **Why Chosen**: 
  - Provides fast, efficient AI inference for text processing
  - Enables intelligent summarization without requiring large language model infrastructure
  - Generates personalized content based on user data
  - Privacy-respecting AI processing
- **Implementation**: 
  - Integrated via REST API calls to Raindrop SmartInference endpoints
  - Includes graceful fallback to rule-based algorithms when API is not configured
  - Used in game detail pages for description summarization and recommendation explanations

### 2. Raindrop SmartSQL (Planned)
- **Status**: 📋 Migration Plan Documented
- **Purpose**: Replace MySQL with intelligent query optimization
- **Why Planned**: 
  - Required for hackathon compliance
  - Intelligent query optimization for complex similarity calculations
  - Better scalability for large datasets
- **Migration Status**: Complete migration plan documented in `LIQUIDMETAL_MIGRATION.md` (37-day timeline)

### 3. Raindrop SmartBuckets (Planned)
- **Status**: 📋 Migration Plan Documented
- **Purpose**: Scalable storage for game metadata, images, and user libraries
- **Why Planned**: 
  - Efficient storage for large game catalogs
  - Better performance for image serving
  - Scalable architecture

### 4. Raindrop SmartMemory (Planned)
- **Status**: 📋 Migration Plan Documented
- **Purpose**: Intelligent caching layer for fast data retrieval
- **Why Planned**: 
  - Reduces database load
  - Faster response times for frequently accessed data
  - Intelligent cache invalidation

### 5. Raindrop MCP Server (Planned)
- **Status**: 📋 Migration Plan Documented
- **Purpose**: Model Context Protocol integration for backend communication
- **Why Planned**: 
  - Standardized protocol for Raindrop Platform integration
  - Enables seamless communication between components

## Vultr Services

### 1. Vultr AI Inference
- **Status**: ✅ Implemented
- **Endpoint**: `POST /api/vultr/explain-weight`
- **Purpose**: 
  - Generates natural language explanations of weight calculations
  - Explains how profile match, engagement, and penalty factors combine to create a user's final weight
  - Provides user-friendly explanations of complex mathematical concepts
- **Why Chosen**: 
  - Hackathon sponsor with $500 credits available
  - High-performance AI inference infrastructure
  - Supports complex reasoning tasks (explaining mathematical formulas in natural language)
  - Scalable for production use
- **Implementation**: 
  - Integrated via REST API calls to Vultr AI Inference endpoints
  - Uses Llama 3.1 8B Instruct model for explanations
  - Includes graceful fallback to rule-based explanations when API is not configured
  - Used in rating preview and breakdown sections to help users understand their weight calculations

### 2. Vultr Compute (Planned)
- **Status**: 📋 Migration Plan Documented
- **Purpose**: Host C++ backend calculations at scale
- **Why Planned**: 
  - Scalable compute resources
  - Better performance for mathematical calculations
  - Production-ready infrastructure

### 3. Vultr Object Storage (Planned)
- **Status**: 📋 Migration Plan Documented
- **Purpose**: Backup and CDN for game images and metadata
- **Why Planned**: 
  - Reliable storage for static assets
  - Global CDN for fast image delivery
  - Cost-effective storage solution

## Other External Services

### 1. Steam Web API
- **Service**: Steam Web API (https://api.steampowered.com)
- **Status**: ✅ Actively Used
- **Purpose**: 
  - Fetch user game libraries and playtime data
  - Retrieve achievement completion data
  - Get game metadata (names, descriptions, images, developers, publishers)
  - Access pricing information
- **Why Chosen**: 
  - **Essential - No Alternative**: Steam is the only platform that provides programmatic access to user gaming data
  - **Comprehensive Data**: Provides all necessary data (playtime, achievements, game metadata) in a single API
  - **Official API**: Reliable, well-documented, and maintained by Valve
  - **Free Access**: No cost for API usage (only requires Steam API key)
- **Usage**: 
  - `IPlayerService/GetOwnedGames` - Fetch user's complete game library with playtime
  - `ISteamUserStats/GetPlayerAchievements` - Fetch achievement data for each game
  - Steam Store API - Game metadata, pricing, images, descriptions
  - Used for library ingestion, game detail pages, and profile matching calculations

### 2. MySQL Database
- **Service**: MySQL 8.0+ (Self-hosted)
- **Status**: ✅ Actively Used
- **Purpose**: 
  - Store game metadata (names, developers, genres, tags)
  - Store user accounts and authentication data
  - Store user game libraries (ownership, playtime, achievements)
  - Store user ratings with weighting breakdowns
  - Calculate aggregate scores and analytics
- **Why Chosen**: 
  - **Proven Reliability**: Battle-tested database system used by millions of applications
  - **Complex Query Support**: Handles sophisticated queries needed for:
    - Jaccard similarity calculations (tag/genre matching)
    - Weighted average calculations for scores
    - Complex joins for profile matching
  - **Performance**: Fast queries even with large datasets (1000+ games, multiple users)
  - **ACID Compliance**: Ensures data integrity for ratings and user data
  - **Self-Hosted Control**: Full control over database configuration and optimization
  - **Migration Path**: Well-documented migration plan to Raindrop SmartSQL
- **Schema**: 
  - `games` - Game metadata
  - `user_accounts` - User authentication
  - `user_games` - User library data
  - `user_ratings` - Ratings with weighting breakdowns
  - `game_tags`, `game_genres` - Categorization data

### 3. Node.js / Express
- **Service**: Node.js Runtime + Express Framework
- **Status**: ✅ Actively Used
- **Purpose**: 
  - Bridge server connecting C++ backend to frontend
  - RESTful API endpoints
  - Database queries and aggregations
  - Steam API integration
  - Raindrop/Vultr API integration
- **Why Chosen**: 
  - **Rapid Development**: Fast to develop and iterate
  - **Rich Ecosystem**: Extensive npm packages for API integration
  - **Asynchronous Processing**: Handles long-running tasks (library ingestion) without blocking
  - **Easy Integration**: Simple to integrate with C++ processes, MySQL, and external APIs
  - **Production Ready**: Proven framework used by millions of applications

### 4. React + Vite
- **Service**: React 18 + Vite Build Tool
- **Status**: ✅ Actively Used
- **Purpose**: 
  - Modern, responsive user interface
  - Client-side routing
  - Real-time UI updates
  - Component-based architecture
- **Why Chosen**: 
  - **Modern UI Framework**: Industry-standard for web applications
  - **Fast Development**: Component reusability speeds up development
  - **Performance**: Vite provides fast hot module replacement and optimized production builds
  - **Ecosystem**: Large ecosystem of libraries and tools
  - **User Experience**: Enables smooth, interactive user experience

## Service Integration Summary

### Currently Implemented ✅
1. **Raindrop SmartInference** - Game description summarization and personalized recommendations
2. **Vultr AI Inference** - Natural language explanations of weight calculations
3. **Steam Web API** - Game data and user library access
4. **MySQL Database** - Data persistence and complex queries
5. **Node.js/Express** - API bridge server
6. **React/Vite** - Frontend framework

### Planned for Migration 📋
1. **Raindrop SmartSQL** - Database migration
2. **Raindrop SmartBuckets** - Scalable storage
3. **Raindrop SmartMemory** - Intelligent caching
4. **Raindrop MCP Server** - Protocol integration
5. **Vultr Compute** - Backend hosting
6. **Vultr Object Storage** - Asset storage

## Why This Service Stack?

**Steam API**: Essential - it's the only way to access user gaming data. No alternative exists.

**MySQL**: Chosen for reliability, complex query support, and proven performance. Migration to SmartSQL is fully planned and documented.

**Raindrop SmartInference**: Chosen for fast, efficient AI processing without requiring large infrastructure. Provides intelligent summarization and recommendations.

**Vultr AI Inference**: Chosen for high-performance AI reasoning tasks (explaining complex formulas) and hackathon sponsor benefits.

**Node.js/Express**: Chosen for rapid development and easy integration with multiple services.

**React/Vite**: Chosen for modern UI development and excellent user experience.

All services are integrated with graceful fallbacks, ensuring the application works even when external APIs are not configured.

