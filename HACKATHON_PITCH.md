# IndieLens: Revolutionizing Indie Game Discovery with Data-Driven Intelligence

## The Problem

Indie games represent an astounding 48% of gaming industry revenue in 2024, yet profit-generating indie games are a minuscule fraction of the 99% of all games released on Steam. The brutal reality: **most indie games never get the visibility they deserve**.

Traditional rating systems like Metacritic fail as effective marketing tools because they rely on paid critics working under deadlines, often exhibiting bias toward established genres and developers. The result? Innovative indie gems remain buried under market saturation, and developers face an impossible choice: accept obscurity or risk significant marketing spend on social media campaigns with uncertain returns.

## Our Solution

**IndieLens** transforms this landscape with a sophisticated, data-driven rating system that **amplifies the voices of engaged players**—the people who actually play games.

### The Weighting System: A Mathematical Innovation

Unlike traditional systems where every rating counts equally, IndieLens uses a proprietary three-factor weighting algorithm:

```
Weight = ProfileMatch × Engagement × SoftPenaltyAPH
```

#### 1. **Profile Match**
Measures how similar a game is to your gaming history:
- **Tag Similarity** (Jaccard distance): Does this game have tags you love?
- **Genre Similarity** (Jaccard distance): Have you played similar genres?
- **Developer Match**: Do you trust this developer's previous work?

**Result**: If you're a roguelike enthusiast rating a new roguelike, your opinion counts **more** than someone who's never played the genre.

#### 2. **Engagement**
Combines playtime and achievement completion to separate passionate players from casual observers:
- **Non-Linear Hours Weighting**: Recognizes that 50 hours shows deeper understanding than 2 hours
- **Achievement Completion**: Rewards players who explore thoroughly

**Result**: A 95/100 from someone with 100+ hours and 90% achievements matters **more** than the same rating from someone who played for 30 minutes.

#### 3. **Soft Penalty (APH)**
Prevents manipulation by comparing your achievements-per-hour to similar games:
- Compares your APH on this game to your baseline from similar games
- Gently down-weights extreme outliers (e.g., 200 hours with 0 achievements)
- **Doesn't penalize** quirky achievement structures or casual playstyles

**Result**: The system respects different play styles while ensuring authenticity.

### Why This Matters

**For Gamers**: Get personalized scores that match **your** gaming profile, not generic averages. Discover hidden gems that align with your taste.

**For Developers**: 
- **Prove Your Game's Worth**: A high IndieLens score signals genuine player engagement, not marketing hype
- **Target Marketing**: Understand which player profiles love your game
- **Fair Competition**: Compete on merit, not marketing budget
- **Developer Analytics Dashboard**: See exactly which players contribute most to your score, their hours, achievement completion, and weighting factors

## Technical Excellence

### Architecture: Production-Ready Stack

**Backend (C++17)**:
- High-performance C++ for complex mathematical calculations
- MySQL X DevAPI for robust data management
- libcurl for seamless Steam API integration
- Steam Web API for real-time game and player data
- Non-blocking CLI modes for scalability

**Bridge Server (Node.js Express)**:
- RESTful API design
- Asynchronous processing for long-running tasks
- Score aggregation system with real-time updates
- Robust error handling and timeout management

**Frontend (React + Vite)**:
- Modern, responsive UI inspired by Metacritic's proven design
- Real-time weighting preview
- Genre and tag-based browsing
- Complete game detail pages with Steam integration

**Database (MySQL)**:
- Normalized schema for efficiency
- Full audit trail of ratings and weighting breakdowns
- Support for both weighted and individual scores

### Chrome Built-in AI: The Competitive Edge

We've integrated **four Chrome Built-in AI APIs** to enhance user experience:

1. **Proofreader API**: Automatically corrects grammar in user reviews
2. **Summarizer API**: Condenses lengthy game descriptions for quick scanning
3. **Prompt API**: Provides AI-powered explanations of why games match your profile, complete with mathematical details
4. **Translator API**: Makes IndieLens accessible to international gamers

**All processing happens client-side**—your privacy is protected.

## What We've Built

- **Full C++ Backend**: Steam library ingestion, weighting calculations, user management
- **Modern Web Frontend**: Browse, search, rate, and discover games
- **AI-Enhanced UX**: Grammar checking, summarization, personalized recommendations
- **Production Database**: MySQL schema with user accounts, ratings, and game metadata
- **Real-Time Scoring**: Instant updates as ratings are submitted
- **Comprehensive Documentation**: Judge setup guides, API documentation, submission notes

## Demo

**Try it now**: https://joaoma-lopes.github.io/indielens/

**Full setup**: See `JUDGES_SETUP.md` in our repository for complete instructions to run the full application with C++ backend, MySQL database, and Chrome AI integration.

## The Impact

IndieLens isn't just another rating platform—it's a **data-driven revolution** that:

✅ **Democratizes Game Discovery**: Great games rise to the top based on merit  
✅ **Protects Developer Investment**: Provides credible marketing data backed by engagement  
✅ **Respects Player Differences**: Recognizes that gaming preferences aren't uniform  
✅ **Combat Manipulation**: Mathematical safeguards prevent review bombing  
✅ **Scales with Growth**: Architecture supports millions of games and users  

## Why We Built This

Every indie developer deserves a fair shot at success. Every gamer deserves to discover their next favorite game. Current systems fail both.

**IndieLens bridges the gap** between passionate developers and engaged players through intelligent, transparent, weighted ratings.

---

**Built for the Chrome Built-in AI Hackathon 2025**  
**Open Source**: MIT License  
**Tech Stack**: C++17, Node.js, React, MySQL, Chrome Built-in AI APIs  

**Let's make indie game discovery intelligent, fair, and accessible.**

