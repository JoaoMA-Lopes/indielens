# IndieLens

**Personalized Game Discovery Powered by Steam Data and Chrome Built-in AI**

IndieLens is a sophisticated game recommendation platform that uses your Steam gaming history to create personalized, engagement-aware ratings for indie games. Integrated with Chrome's Built-in AI APIs for enhanced user experience.

![IndieLens Screenshot](https://via.placeholder.com/1200x600?text=IndieLens+Interface)

## 🎮 Features

### Core Functionality
- **Steam Library Integration**: Automatically ingests your Steam library via friend code
- **Personalized Weighting System**: Ratings are weighted based on your gaming profile
- **Genre & Tag Browsing**: Filter thousands of indie games by genre and tags
- **Game Detail Pages**: View comprehensive game information with Steam data
- **Rating & Review System**: Submit weighted ratings with optional text reviews
- **Developer Analytics**: See detailed breakdowns of user ratings with hours, achievements, and weighting factors

### AI-Enhanced Features (Chrome Built-in AI)
- **Grammar Checking**: AI-powered proofreading for user reviews
- **Smart Summarization**: Condense long game descriptions
- **AI Recommendations**: Get explanations for why games match your profile
- **Translation Support**: Website-wide translation toggle

## 🧮 The Weighting Algorithm

Your raw 0-100 rating is transformed using:

```
Weight = ProfileMatch × Engagement × SoftPenaltyAPH
```

### Profile Match
Measures game similarity to your library using:
- Tag similarity (Jaccard distance)
- Genre similarity (Jaccard distance)
- Developer match

### Engagement
Combines playtime and achievement completion:
- Non-linear hours weighting
- Achievement completion percentage

### Soft Penalty (APH)
Compares achievements-per-hour to similarity-weighted baseline from your similar games, gently down-weighting extreme outliers.

## 🛠️ Technology Stack

- **Backend**: C++17, MySQL X DevAPI, libcurl, nlohmann/json
- **Bridge**: Node.js Express server
- **Frontend**: React + Vite
- **Database**: MySQL
- **APIs**: Steam Web API, Steam Store API
- **AI**: Chrome Built-in AI APIs (Proofreader, Summarizer, Prompt, Translator)

## 🚀 Quick Start

### Prerequisites
- MySQL 8.0+
- Node.js 18+
- Visual Studio 2019+ (for C++ backend)
- Steam API Key
- Chrome Canary (for AI features)

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/yourusername/indielens.git
cd indielens
```

2. **Database Setup**:
```bash
mysql -u root -p < db/schema.sql
```

3. **Configure Backend**:
```bash
cd cpp
cp config.example.json config.json
# Edit config.json with your MySQL credentials and Steam API key
```

4. **Build C++ Backend**:
- Open `cpp/ConsoleApplication1/ConsoleApplication1.sln` in Visual Studio
- Build in Release mode (x64)

5. **Setup Node.js Bridge**:
```bash
cd web/server
npm install
```

6. **Setup Frontend**:
```bash
cd ../ui
npm install
```

7. **Run Application**:
```bash
# Terminal 1: Start bridge server
cd web/server
npm start

# Terminal 2: Start frontend
cd web/ui
npm run dev
```

8. **Access Application**:
- Open http://localhost:5173 in Chrome Canary
- Enable Chrome AI flags in `chrome://flags`

### Chrome AI Setup

1. Install [Chrome Canary](https://www.google.com/chrome/canary/)
2. Enable flags in `chrome://flags`:
   - `#prompt-api-for-gemini-nano`: Enabled
   - `#summarization-api-for-gemini-nano`: Enabled
   - `#proofreader-api-for-gemini-nano`: Enabled
   - `#optimization-guide-on-device-model`: Enabled
3. Restart Chrome Canary

For detailed setup instructions for judges, see [JUDGES_SETUP.md](JUDGES_SETUP.md)

## 📋 APIs Used

### Chrome Built-in AI APIs
1. **Proofreader API**: Grammar checking for reviews
2. **Summarizer API**: Summarizing descriptions
3. **Prompt API**: Interactive game recommendations
4. **Translator API**: Multi-language support
5. **Writer API**: Available in code
6. **Rewriter API**: Available in code

### External APIs
- Steam Web API (game details, user library, achievements)
- Steam Store API (descriptions, pricing)

## 📊 Database Schema

See [db/schema.sql](db/schema.sql) for complete schema.

Key tables:
- `games`: Game metadata
- `users`: User profiles
- `user_games`: User ownership and playtime
- `user_ratings`: User ratings with weighting breakdown
- `user_accounts`: Authentication

## 🎯 Use Cases

**For Gamers:**
- Discover indie games tailored to your taste
- See personalized scores based on your gaming profile
- Get AI-powered explanations for recommendations

**For Developers:**
- Track engagement-weighted ratings
- Understand audience preferences
- Analytics on game performance

## 🔒 Privacy

IndieLens is designed with privacy in mind:
- All AI processing happens **client-side**
- No personal data sent to third-party AI services
- Steam data stored locally in your database

## 📝 License

MIT License - see [LICENSE](LICENSE) file

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines first.

## 📧 Contact

For questions or support, open an issue on GitHub.

## 🔗 Links

- [Documentation](https://github.com/yourusername/indielens/wiki)
- [Chrome AI Integration Notes](HACKATHON_SUBMISSION_NOTES.md)
- [Judge Setup Instructions](JUDGES_SETUP.md)

---

Built for the Chrome Built-in AI Hackathon 2025
