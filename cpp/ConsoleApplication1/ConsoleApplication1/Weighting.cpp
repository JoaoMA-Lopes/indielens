#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_driver.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\mysql_connection.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\prepared_statement.h"
#include "C:\Users\joao\Desktop\C++ LIBS\mysql-9.1.0\include\jdbc\cppconn\resultset.h"
#include <curl/curl.h>
#include <iostream>
#include "Gamesdatabase.h"
#include "Games.h"
#include "Users.h"
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
#include <mysqlx/xdevapi.h>

Game convertUsergameToGame(mysqlx::Session& sess, const Usergame& ug) {
    Game g;
    g.appid = ug.appid;
    g.name = ug.name;

    // Fetch developer
    {
        auto res = sess.sql(
            "SELECT developer FROM steam_data.games WHERE appid = ? LIMIT 1"
        ).bind(g.appid).execute();

        if (res.count() > 0) {
            mysqlx::Row row = res.fetchOne();
            if (!row[0].isNull())
                g.developers = row[0].get<std::string>();
        }
    }

    // Fetch genres
    {
        auto res = sess.sql(
            "SELECT genre FROM steam_data.game_genres WHERE appid = ?"
        ).bind(g.appid).execute();

        for (mysqlx::Row row : res) {
            g.genres.push_back(std::string(row[0]));
        }
    }

    // Fetch tags
    {
        auto res = sess.sql(
            "SELECT tag FROM steam_data.game_tags WHERE appid = ?"
        ).bind(g.appid).execute();

        for (mysqlx::Row row : res) {
            g.tags.push_back(std::string(row[0]));
        }
    }

    return g;
}

double achievementpercentage(mysqlx::Session& sess, int appid, const Usergame* ug, uint64_t steamid)
{ 
    int total = 0; // find total achievements for a given game
    {
        auto q = sess.sql(
            "SELECT COUNT(*) FROM steam_data.game_achievements WHERE appid = ?"
        ).bind(appid).execute();
        // COUNT(*) always yields one row
        mysqlx::Row r = q.fetchOne();
        total = static_cast<int>(r[0]); // cast
    }

    int unlocked = 0; // find total achievements the user has unlocked for a given game
    {
        auto q = sess.sql(
            "SELECT COUNT(*) "
            "FROM steam_data.user_achievements "
            "WHERE steamid = ? AND appid = ?"
        ).bind(steamid, appid).execute();
        mysqlx::Row r = q.fetchOne();
        unlocked = static_cast<int>(r[0]);
    }

    // Fallbacks if definitions for achievements havent been upserted into DB yet
    if (total <= 0 && ug) {
        // Use the size of the user’s achievement map as the best-available denom
        total = static_cast<int>(ug->achievements.size());

        // If DB had no unlocked count (e.g., not ingested yet), derive from ug map
        if (unlocked == 0) {
            for (const auto& kv : ug->achievements)
                if (kv.second.achieved) ++unlocked;
        }
    }

    // Computing percentage
    if (total <= 0) {
        // If no denominator available anywhere then define as 0.0
        return 0.0;
    }

    if (unlocked < 0) unlocked = 0;
    if (unlocked > total) unlocked = total;

    double percentage = static_cast<double>(unlocked) / static_cast<double>(total);
    if (percentage < 0.0) percentage = 0.0;
    if (percentage > 1.0) percentage = 1.0;
    return percentage; // returns the percentage
}

double engagementcalc(mysqlx::Session& sess, uint64_t steamid, const User& u, const Usergame& ug)
{
    // Soft-penalty rules: only trigger on absurd hour/achievement imbalance.
    // Ordered most severe -> least severe; first match wins.
    struct Rule { double min_h; double max_A; double mult; };
 
    const double hours = std::max(0, ug.playtime_forever) / 60.0;
    const double hhalf = 20; // point in hours at which there is credit for beating half the game
    const double nonlinearhours = hours / (hours + hhalf); // equation  to make it so the credit you get for hours played isnt linear

    // Check if game has achievements
    int totalAchievements = 0;
    {
        auto q = sess.sql("SELECT COUNT(*) FROM steam_data.game_achievements WHERE appid = ?").bind(ug.appid).execute();
        mysqlx::Row r = q.fetchOne();
        totalAchievements = static_cast<int>(r[0]);
    }

    double raw_engagement;
    if (totalAchievements == 0) {
        // Games with no achievements: use only hours (nonlinear)
        raw_engagement = nonlinearhours;
    } else {
        // Games with achievements: use weighted combination
        const double a = 0.5; // weighting between hours and achievements
        const double percentageachieved = achievementpercentage(sess, ug.appid, &ug, u.steamid);
        raw_engagement = (a * nonlinearhours) + ((1.0 - a) * percentageachieved);
    }
    
    // Scale to achieve 12x ratio: 200h+100% = 12x weight of 2h+2%
    // Base case (2h, 2%): raw ≈ 0.0555, target case (200h, 100%): raw ≈ 0.9545
    // We want: engagement(200h,100%) = 12 * engagement(2h,2%)
    // Using formula: engagement = base_weight + scale * (raw_engagement - base_raw)
    const double base_raw = 0.0555;  // approximate raw engagement for 2h+2%
    const double base_weight = 0.01;  // minimum weight for base case
    // Solve: base_weight + scale * (0.9545 - 0.0555) = 12 * base_weight
    // scale * 0.899 = 11 * base_weight
    // scale = 11 * 0.01 / 0.899 ≈ 0.1224
    const double scale = 0.1224;     // scaling factor to achieve 12x ratio
    
    double engagement = base_weight + scale * (raw_engagement - base_raw);
    
    // Clamp to reasonable bounds [0.01, 1.0]
    if (engagement < 0.01) engagement = 0.01;
    if (engagement > 1.0) engagement = 1.0;
    
    return engagement;
}

double jaccard(const std::vector<std::string>& A, const std::vector<std::string>& B) // jaccard function to measure similarity between two string vectors, between 0 and 1.
{
    if (A.empty() && B.empty()) return 1.0;

    std::unordered_set<std::string> a(A.begin(), A.end());
    std::unordered_set<std::string> b(B.begin(), B.end());

    size_t inter = 0;
    for (const auto& s : a)
        if (b.count(s)) ++inter;

    size_t uni = a.size() + b.size() - inter;
    return (uni == 0) ? 0.0 : static_cast<double>(inter) / static_cast<double>(uni);
}

double similarity(const Game& g, const Game& i) // final similarity between the game in question and all the other games s(i, g). g is the game in question while i is any other game.
{
    //The weights for each category. All weights must sum to 1.

    double w_tags = 0.7; // tags has by far the most importance, though we may change this later
    double w_genres = 0.15; // Genres has little importance since most games match genres in some way or another anyway
    double w_dev = 0.15; // Developer being the same has a bit of importance

    double S_tags = jaccard(i.tags, g.tags); // getting the jaccard for the current game and any other for tags
    double S_genres = jaccard(i.genres, g.genres); // getting the jaccard for the current game and any other for genres
    double S_dev = (i.developers == g.developers && !i.developers.empty()) ? 1.0 : 0.0; // No jaccard needed here, just need to check iuf the two strings are identical.

    double S = w_tags * S_tags + w_genres * S_genres + w_dev * S_dev;  // final calculation for similarity
    return (S < 0.0 ? 0.0 : (S > 1.0 ? 1.0 : S));
}

double averagesimilarity(mysqlx::Session& sess, const User& user, const Game& target) {
    double sumS = 0.0; // stores the sum of all similarity scores
    int count = 0; // tracks how many games were compared

    for (const auto& ug : user.gamesowned) { // loops over all games the user owns
        if (ug.appid == target.appid) continue; // skip the same game we are trying to rate

        Game other = convertUsergameToGame(sess, ug); // convert the games being compared (i) to a Game
        double S = similarity(target, other);

        sumS += S;
        count++;
    }

    return (count > 0) ? sumS / count : 0.0; // returns the similarity average as a number between 0 and 1
}


double profilematchcalc(mysqlx::Session& sess, uint64_t steamid, const User& user, const Usergame& targetUserGame)
{
    // Convert the target Usergame into a full Game object so we can access
    // its tags, genres, and developer information for similarity calculations.
    Game target = convertUsergameToGame(sess, targetUserGame);

    double weightedSimilaritySum = 0.0; // Σ (engagement_i × similarity(i, g))
    double totalEngagementWeight = 0.0; // Σ engagement_i

    // Iterate over all games owned by the user.
    for (const auto& ownedUserGame : user.gamesowned) {
        
        if (ownedUserGame.appid == targetUserGame.appid) continue; // skip the current game (game user is trying to rate)

        Game comparisonGame = convertUsergameToGame(sess, ownedUserGame); // Convert usergame owned that we are using to compare to a game object

        double similarityScore = similarity(target, comparisonGame); // S(i,g) in [0,1], basically compare a given game that the user ownes to the target game

        double engagementScore = engagementcalc(sess, user.steamid, user, ownedUserGame); // E(i) in [0,1], compute how engaged user was in this game

        // Accumulate weighted similarity (engagement × similarity)
        weightedSimilaritySum += engagementScore * similarityScore;
        totalEngagementWeight += engagementScore;
    }

    // Compute the engagement-weighted average similarity between the target
    // and all other games in the user's library.
    double weightedAverageSimilarity = (totalEngagementWeight > 0.0) // compute average similarity weighed by engagement for all the games in the user's libary when compared to target game
        ? (weightedSimilaritySum / totalEngagementWeight) // divide it by total engagement weight so that users with a million games dont have a billion engagement points (make it average, not total)
        : 0.0;

    // Scale result to a soft multiplier range [0.5, 1.0]
    // - 0.5 represents "neutral" (no strong match or mismatch)
    // - 1.0 represents "strong match" with the user preferences
    double profilematch = 0.5 + 0.5 * weightedAverageSimilarity;

    return profilematch;
}

struct APHpenaltyparameters {
    double min_hours_for_penalty = 2.0;  // don't penalize with <2h total
    double sim_pow = 1.5;  // sharpen strong similarities (S^sim_pow)
    double min_similarity_keep = 0.05; // ignore almost-unrelated games
    double eps = 1e-6; // numerical safety
    double tolerance_tau = 0.6;  // how lenient vs baseline (1.0 = strict)
    double min_multiplier = 0.80; // lower bound of penalty (gentle)
};

inline double soft_penalty_aph(mysqlx::Session& sess,
    const User& user,
    const Usergame& targetUG,
    const APHpenaltyparameters& P)
{
    // --- Build target Game metadata for similarity ---
    Game targetG = convertUsergameToGame(sess, targetUG);

    // --- Compute expected APH from user's similar games ---
    double weightedSumAPH = 0.0;
    double weightDen = 0.0;

    for (const auto& histUG : user.gamesowned) {
        if (histUG.appid == targetUG.appid) continue;

        // Similarity to target
        Game histG = convertUsergameToGame(sess, histUG);
        double S = similarity(targetG, histG);
        if (S < P.min_similarity_keep) continue;

        // Hours & APH for this history game
        double Hi_hours = std::max(0, histUG.playtime_forever) / 60.0;
        if (Hi_hours < 0.25) continue; // ignore almost-no-play

        double Ai = achievementpercentage(sess, histUG.appid, &histUG, user.steamid); // 0..1
        double APH_i = Ai / std::max(Hi_hours, P.eps); // achievement-fraction per hour

        // Weight by sharpened similarity
        double w = std::pow(S, P.sim_pow);
        weightedSumAPH += w * APH_i;
        weightDen += w;
    }

    const double expectedAPH = (weightDen > 0.0) ? (weightedSumAPH / weightDen) : 0.0;

    // --- User's APH on the target game ---
    double H_target = std::max(0, targetUG.playtime_forever) / 60.0;
    if (H_target < P.min_hours_for_penalty) return 1.0;     // don't judge early play
    double A_target = achievementpercentage(sess, targetUG.appid, &targetUG, user.steamid);
    double APH_user = A_target / std::max(H_target, P.eps);

    // --- If we couldn't form a baseline, do not penalize ---
    if (expectedAPH <= P.eps) return 1.0;

    // --- Soft ratio: if user’s APH >= tolerance * expected → no penalty (mult=1)
    // Otherwise, linearly scale down to min_multiplier.
    // ratio >= 1 → 1.0; ratio = 0 → min_multiplier
    const double denom = std::max(P.eps, P.tolerance_tau * expectedAPH);
    double ratio = APH_user / denom;
    if (ratio > 1.0) ratio = 1.0;
    if (ratio < 0.0) ratio = 0.0;

    double mult = P.min_multiplier + (1.0 - P.min_multiplier) * ratio;
    if (mult < P.min_multiplier) mult = P.min_multiplier;
    if (mult > 1.0)               mult = 1.0;
    return mult;
}

// 3-argument wrapper to match header and external calls
double soft_penalty_aph(mysqlx::Session& sess, const User& user, const Usergame& targetUG)
{
    APHpenaltyparameters P;
    return soft_penalty_aph(sess, user, targetUG, P);
}

void dotherating(mysqlx::Session& sess, uint64_t steamid, const User& user)
{
    int targetappid;
    std::cout << "What game of yours do you wish to rate?";
    std::cin >> targetappid;

    // --- Find the matching Usergame from the user's owned games ---
    const Usergame* targetusergame = nullptr;
    for (const auto& ug : user.gamesowned) {
        if (ug.appid == targetappid) {
            targetusergame = &ug;
            break;
        }
    }

    // If not found, warn and return 0
    if (!targetusergame) {
        std::cerr << "[Warning] AppID " << targetappid << " not found in user " << user.steamid << "'s library.\n";
        return;
    }


    const double profile = profilematchcalc(sess, user.steamid, user, *targetusergame); // [0.5..1.0]
    const double engagement = engagementcalc(sess, user.steamid, user, *targetusergame);  // [0..1] (pure engagement)
    const double penalty_aph = soft_penalty_aph(sess, user, *targetusergame);               // [min_mult..1]

    double weight = profile * engagement * penalty_aph;

    if (weight < 0.0) weight = 0.0; // safeties
    if (weight > 1.0) weight = 1.0;

    int rating;
    std::cout << "Rate it 0-100";
    std::cin >> rating;

    double scorewithrating = rating * weight;

    std::cout << "\n=== Rating Breakdown ===\n";
    std::cout << "ProfileMatch:  " << profile << "\n";
    std::cout << "Engagement:    " << engagement << "\n";
    std::cout << "Penalty (APH): " << penalty_aph << "\n";
    std::cout << "Weight:        " << weight << "\n";
    std::cout << "Raw Rating:    " << rating << "\n";
    std::cout << "Final Score:   " << scorewithrating << "\n";
}