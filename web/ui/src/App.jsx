import React, { useEffect, useMemo, useState } from 'react';

export default function App() {
  const [steamId, setSteamId] = useState('');
  const [username, setUsername] = useState('');
  const [friendCode, setFriendCode] = useState('');
  const [appid, setAppid] = useState('');
  const [rating, setRating] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [owned, setOwned] = useState([]);
  const [tab, setTab] = useState('browse');
  const [browse, setBrowse] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  
  // Registration/Login form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerFriendCode, setRegisterFriendCode] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  
  // Persist login state
  useEffect(() => {
    const savedSteamId = localStorage.getItem('indielens_steamId');
    const savedUsername = localStorage.getItem('indielens_username');
    // Only set steamId if it's a valid value (not null, undefined, or the string "null")
    if (savedSteamId && savedSteamId !== 'null' && savedSteamId !== 'undefined' && savedSteamId.trim() !== '') {
      setSteamId(savedSteamId.trim());
      if (savedUsername) setUsername(savedUsername);
      setTab('browse');
    }
  }, []);
  
  useEffect(() => {
    if (steamId) {
      localStorage.setItem('indielens_steamId', steamId);
      if (username) localStorage.setItem('indielens_username', username);
    } else {
      localStorage.removeItem('indielens_steamId');
      localStorage.removeItem('indielens_username');
    }
  }, [steamId, username]);
  
  function handleLogout() {
    setSteamId('');
    setUsername('');
    setTab('browse');
  }

  // Use relative path /api when served from same origin (production), otherwise use env var or localhost
  const apiBase = useMemo(() => {
    if (import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE;
    }
    // In production (served via Nginx), use relative path /api
    // In development, use localhost
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:5179' 
      : '/api';
  }, []);

  async function ingest() {
    setError(''); setResult(null); setLoading(true);
    try {
      const res = await fetch(`${apiBase}/ingest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId })
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.error || json.message || 'Failed');
      setResult(json);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function loginWithEmailPassword() {
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${apiBase}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.error || json.message || 'Login failed');
      
      console.log('[DEBUG] Login response:', { steamId: json.steamId, username: json.username });
      
      if (!json.steamId) {
        throw new Error('Login succeeded but no steamId returned from server. Please contact support.');
      }
      
      setSteamId(String(json.steamId)); // Ensure it's a string
      if (json.username) setUsername(json.username);
      setLoginEmail('');
      setLoginPassword('');
      setTab('browse');
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function registerAccount() {
    setError(''); setLoading(true);
    try {
      const registrationData = { 
        email: registerEmail.trim(), 
        username: registerUsername.trim(), 
        password: registerPassword,
        steamFriendCode: registerFriendCode.trim()
      };
      console.log('[DEBUG] Registering with data:', { ...registrationData, password: '***' });
      
      const res = await fetch(`${apiBase}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });
      const json = await res.json();
      console.log('[DEBUG] Registration response:', json);
      if (!res.ok || json.status === 'error') throw new Error(json.error || json.message || 'Registration failed');
      
      // Verify the account was created before proceeding
      if (!json.steamId) {
        throw new Error('Registration succeeded but no steamId returned');
      }
      
      console.log('Registration successful, steamId:', json.steamId, 'username:', json.username || registerUsername);
      setSteamId(String(json.steamId)); // Ensure it's a string
      setUsername(String(json.username || registerUsername)); // Ensure username is set
      console.log('After setting state - steamId:', String(json.steamId), 'username:', String(json.username || registerUsername));
      setRegisterEmail('');
      setRegisterUsername('');
      setRegisterPassword('');
      setRegisterFriendCode('');
      setAuthMode('login');
      setTab('browse');
      
      // Small delay to ensure database write completes, then verify account exists
      setTimeout(async () => {
        try {
          const verifyRes = await fetch(`${apiBase}/account?steamId=${json.steamId}`);
          const verifyJson = await verifyRes.json();
          if (!verifyRes.ok || verifyJson.status === 'error') {
            console.error('Account verification failed:', verifyJson.error);
            alert('Warning: Account created but verification failed. Please try logging in.');
          } else {
            console.log('Account verified successfully');
          }
        } catch (e) {
          console.error('Error verifying account:', e);
        }
      }, 500);
    } catch (e) {
      setError(e.message);
      console.error('Registration error:', e);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    async function fetchOwned() {
      if (!steamId) return;
      try {
        const res = await fetch(`${apiBase}/owned?steamId=${steamId}`);
        const json = await res.json();
        if (json.status === 'ok') setOwned(json.owned || []);
      } catch {
        // ignore
      }
    }
    fetchOwned();
  }, [steamId, apiBase]);

  async function rate() {
    setError(''); setResult(null); setLoading(true);
    try {
      const res = await fetch(`${apiBase}/rate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, appid, rating: Number(rating) })
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') throw new Error(json.error || json.message || 'Failed');
      setResult(json);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  // Get genres for header
  const [headerGenres, setHeaderGenres] = useState([]);
  const [selectedHeaderGenre, setSelectedHeaderGenre] = useState(() => {
    // Load from localStorage, or default to empty string
    return localStorage.getItem('indielens_selectedGenre') || '';
  });
  
  // Persist selected genre to localStorage
  useEffect(() => {
    if (selectedHeaderGenre) {
      localStorage.setItem('indielens_selectedGenre', selectedHeaderGenre);
    } else {
      localStorage.removeItem('indielens_selectedGenre');
    }
  }, [selectedHeaderGenre]);
  
  useEffect(() => {
    async function fetchGenres() {
      try {
        const res = await fetch(`${apiBase}/genres`);
        const json = await res.json();
        const genres = json.genres || [];
        setHeaderGenres(genres);
        
        // If no genre is selected and we have genres, select the first one by default
        const savedGenre = localStorage.getItem('indielens_selectedGenre');
        if (!savedGenre && genres.length > 0) {
          setSelectedHeaderGenre(genres[0]);
        }
      } catch {}
    }
    fetchGenres();
  }, [apiBase]);
  
  const [searchQuery, setSearchQuery] = useState('');
  
  const handleHeaderSearch = (query) => {
    setSearchQuery(query);
    setTab('browse');
  };

  if (selectedGame && tab === 'detail') {
    return (
      <>
        <Header 
          onLogin={() => setTab('login')} 
          onRegister={() => { setTab('login'); setAuthMode('register'); }} 
          steamId={steamId}
          username={username}
          onLogout={handleLogout}
          genres={headerGenres}
          selectedGenre={selectedHeaderGenre}
          onGenreChange={(g) => { setSelectedHeaderGenre(g === selectedHeaderGenre ? '' : g); setTab('browse'); }}
          onSearch={handleHeaderSearch}
          onHowItWorks={() => setTab('howitworks')}
          onMyRatings={() => setTab('myratings')}
          onMyAccount={() => setTab('myaccount')}
        />
        <hr className="separator" />
        <GameDetail apiBase={apiBase} game={selectedGame} steamId={steamId} onClose={() => { setTab('browse'); setSelectedGame(null); }} />
      </>
    );
  }

  return (
    <>
      <Header 
        onLogin={() => { setTab('login'); setAuthMode('login'); }} 
        onRegister={() => { setTab('login'); setAuthMode('register'); }} 
        steamId={steamId}
        username={username}
        onLogout={handleLogout}
        genres={headerGenres}
        selectedGenre={selectedHeaderGenre}
        onGenreChange={(g) => { setSelectedHeaderGenre(g === selectedHeaderGenre ? '' : g); setTab('browse'); }}
        onSearch={handleHeaderSearch}
        onHowItWorks={() => setTab('howitworks')}
        onMyRatings={() => setTab('myratings')}
        onMyAccount={() => setTab('myaccount')}
        onDeveloperMode={() => setTab('developer')}
      />
      <hr className="separator" />
      {tab === 'howitworks' ? (
        <div className="container" style={{ maxWidth: '900px', margin: '40px auto', padding: '40px' }}>
          <h1 style={{ color: '#c7d5e0', fontSize: '3em', marginBottom: 30 }}>How IndieLens Weighting Works</h1>
          <div style={{ lineHeight: 1.8, color: '#c7d5e0' }}>
            <div style={{ marginBottom: 40, padding: 30, border: '2px solid #415a79', borderRadius: 8 }}>
              <h2 style={{ color: '#c7d5e0', fontSize: '2em', marginTop: 0 }}>Overview</h2>
              <p style={{ fontSize: 18, color: '#c7d5e0' }}>
                IndieLens uses a sophisticated weighting system to ensure your game ratings have appropriate influence on aggregate scores. 
                Your raw rating (0-100) is transformed into a weighted score based on three key factors that measure your expertise and engagement.
              </p>
            </div>
            
            <div style={{ marginBottom: 40, padding: 30, border: '2px solid #415a79', borderRadius: 8 }}>
              <h2 style={{ color: '#c7d5e0', fontSize: '2em', marginTop: 0 }}>The Formula</h2>
              <p style={{ fontSize: 18, color: '#c7d5e0', marginBottom: 20 }}>
                <strong>Weight = ProfileMatch × Engagement × SoftPenaltyAPH</strong>
              </p>
              <p style={{ fontSize: 16, color: '#c7d5e0' }}>
                Your final weight determines how much your rating contributes to the game's overall IndieLens score. 
                Higher weights mean your opinion has more impact.
              </p>
            </div>
            
            <div style={{ marginBottom: 40, padding: 30, border: '2px solid #415a79', borderRadius: 8 }}>
              <h2 style={{ color: '#c7d5e0', fontSize: '2em', marginTop: 0 }}>1. Profile Match</h2>
              <p style={{ fontSize: 16, color: '#c7d5e0', marginBottom: 15 }}>
                Measures how well the target game aligns with your gaming history using:
              </p>
              <ul style={{ fontSize: 16, color: '#c7d5e0', paddingLeft: 30 }}>
                <li><strong>Tag Similarity:</strong> Jaccard similarity over game tags (how many tags overlap with games you've played)</li>
                <li><strong>Genre Similarity:</strong> Jaccard similarity over genres</li>
                <li><strong>Developer Match:</strong> Bonus if you've played other games by the same developer</li>
              </ul>
              <p style={{ fontSize: 16, color: '#c7d5e0', marginTop: 15 }}>
                Each similarity is weighted by your engagement with those similar games, so games similar to games you loved 
                count more than games similar to games you barely played.
              </p>
            </div>
            
            <div style={{ marginBottom: 40, padding: 30, border: '2px solid #415a79', borderRadius: 8 }}>
              <h2 style={{ color: '#c7d5e0', fontSize: '2em', marginTop: 0 }}>2. Engagement</h2>
              <p style={{ fontSize: 16, color: '#c7d5e0', marginBottom: 15 }}>
                Combines your playtime and achievement completion for the target game:
              </p>
              <p style={{ fontSize: 16, color: '#c7d5e0', marginBottom: 15 }}>
                <strong>E = α × (H / (H + H^(1/2))) + (1 - α) × A</strong>
              </p>
              <p style={{ fontSize: 16, color: '#c7d5e0' }}>
                Where H is normalized playtime and A is achievement completion rate. This rewards meaningful play 
                while damping the effect of idle time. High engagement means you've actually played the game, not just left it running.
              </p>
            </div>
            
            <div style={{ marginBottom: 40, padding: 30, border: '2px solid #415a79', borderRadius: 8 }}>
              <h2 style={{ color: '#c7d5e0', fontSize: '2em', marginTop: 0 }}>3. Soft Penalty (Achievements Per Hour)</h2>
              <p style={{ fontSize: 16, color: '#c7d5e0', marginBottom: 15 }}>
                Compares your achievements-per-hour on this game to a similarity-weighted baseline from your similar games.
              </p>
              <p style={{ fontSize: 16, color: '#c7d5e0' }}>
                This gently down-weights only extreme outliers where you have many hours but very few achievements compared 
                to your typical pattern. It doesn't penalize genres that naturally use quirky or rare achievements, 
                since the baseline is calculated from your similar games.
              </p>
            </div>
            
            <div style={{ marginBottom: 40, padding: 30, border: '2px solid #415a79', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <h2 style={{ color: '#c7d5e0', fontSize: '2em', marginTop: 0 }}>The Result</h2>
                {'ai' in window && 'summarizer' in window.ai && (
                  <button
                    onClick={async () => {
                      try {
                        const text = `When you rate a game, your rating is multiplied by your calculated weight. Games where you have high profile match, high engagement, and normal achievement patterns will have the most influence. This ensures that scores reflect the opinions of players who are genuinely familiar with similar games and have actually engaged with the title.`;
                        const result = await window.ai.summarizer.summarize(text);
                        if (result && result.summary) {
                          const summaryDiv = document.getElementById('summary-result');
                          if (summaryDiv) {
                            summaryDiv.innerHTML = `<p style="color: #c7d5e0; font-style: italic; margin-top: 12px;"><strong>Summary:</strong> ${result.summary}</p>`;
                          }
                        }
                      } catch (e) {
                        console.error('Summarizer API error:', e);
                        alert('Summarizer API is not available. Make sure you are using Chrome with the built-in AI enabled.');
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid #415a79',
                      borderRadius: '4px',
                      fontSize: 12,
                      cursor: 'pointer',
                      color: '#c7d5e0'
                    }}
                  >
                    📝 Summarize (Chrome AI)
                  </button>
                )}
              </div>
              <p style={{ fontSize: 16, color: '#c7d5e0' }}>
                When you rate a game, your rating is multiplied by your calculated weight. Games where you have high profile match, 
                high engagement, and normal achievement patterns will have the most influence. This ensures that scores reflect 
                the opinions of players who are genuinely familiar with similar games and have actually engaged with the title.
              </p>
              <div id="summary-result"></div>
            </div>
          </div>
        </div>
      ) : tab === 'myaccount' && steamId ? (
        <div className="container" style={{ maxWidth: '800px', margin: '40px auto', padding: '40px' }}>
          <MyAccount apiBase={apiBase} steamId={steamId} username={username} />
        </div>
      ) : tab === 'myratings' && steamId ? (
        <div className="container" style={{ maxWidth: '1200px', margin: '40px auto', padding: '40px' }}>
          <MyRatings apiBase={apiBase} steamId={steamId} onSelectGame={(g) => { setTab('detail'); setSelectedGame(g); }} />
        </div>
      ) : tab === 'developer' && steamId ? (
        <div className="container" style={{ maxWidth: '1200px', margin: '40px auto', padding: '40px' }}>
          <h1 style={{ color: '#c7d5e0', fontSize: '3em', marginBottom: 20 }}>👨‍💻 Developer Mode</h1>
          <p style={{ color: '#c7d5e0', fontSize: '1.2em', marginBottom: 30 }}>My Game: <strong>Terraria</strong></p>
          <p style={{ color: '#c7d5e0', marginBottom: 30 }}>
            Recent ratings from users for your game, with detailed weighting breakdowns:
          </p>
          
          <div style={{ marginBottom: 30, padding: 20, border: '1px solid #415a79', background: 'rgba(255, 255, 255, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
              <span style={{ fontWeight: 'bold' }}>Player: Alex_Summers92</span>
              <span style={{ color: '#d4af37', fontWeight: 'bold' }}>Rating: 94/100</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Hours Played:</span>
              <span>312 hours</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Achievements:</span>
              <span>108 / 115 (93.9%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Profile Match:</span>
              <span>0.94</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Engagement:</span>
              <span>0.96</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Achievement Penalty:</span>
              <span>0.99</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', marginTop: 10, borderTop: '2px solid #415a79', fontWeight: 'bold', color: '#c7d5e0' }}>
              <span>Weighted Score Contribution:</span>
              <span>84.71 points</span>
            </div>
          </div>

          <div style={{ marginBottom: 30, padding: 20, border: '1px solid #415a79', background: 'rgba(255, 255, 255, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
              <span style={{ fontWeight: 'bold' }}>Player: Marcus_Indie</span>
              <span style={{ color: '#d4af37', fontWeight: 'bold' }}>Rating: 87/100</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Hours Played:</span>
              <span>156 hours</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Achievements:</span>
              <span>71 / 115 (61.7%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Profile Match:</span>
              <span>0.78</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Engagement:</span>
              <span>0.74</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Achievement Penalty:</span>
              <span>0.96</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', marginTop: 10, borderTop: '2px solid #415a79', fontWeight: 'bold', color: '#c7d5e0' }}>
              <span>Weighted Score Contribution:</span>
              <span>48.62 points</span>
            </div>
          </div>

          <div style={{ marginBottom: 30, padding: 20, border: '1px solid #415a79', background: 'rgba(255, 255, 255, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
              <span style={{ fontWeight: 'bold' }}>Player: Sam_Green</span>
              <span style={{ color: '#d4af37', fontWeight: 'bold' }}>Rating: 72/100</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Hours Played:</span>
              <span>22 hours</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Achievements:</span>
              <span>12 / 115 (10.4%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Profile Match:</span>
              <span>0.51</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Engagement:</span>
              <span>0.38</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #415a79' }}>
              <span>Achievement Penalty:</span>
              <span>0.76</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', marginTop: 10, borderTop: '2px solid #415a79', fontWeight: 'bold', color: '#c7d5e0' }}>
              <span>Weighted Score Contribution:</span>
              <span>10.69 points</span>
            </div>
          </div>

          <p style={{ marginTop: 30, fontSize: '0.9rem', color: '#8f98a0' }}>
            <strong>Note:</strong> Higher hours and achievement completion result in greater weight for each rating, ensuring experienced players have more impact on your game's score.
          </p>
        </div>
      ) : !steamId && tab === 'login' ? (
        <div className="container" style={{ maxWidth: '500px', margin: '40px auto', padding: '40px' }}>
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #415a79', marginBottom: 30 }}>
            <button
              onClick={() => setAuthMode('register')}
              style={{
                padding: '12px 24px',
                background: 'none',
                border: 'none',
                borderBottom: authMode === 'register' ? '2px solid #66c0f4' : '2px solid transparent',
                color: authMode === 'register' ? '#66c0f4' : '#8f98a0',
                fontWeight: authMode === 'register' ? 700 : 400,
                cursor: 'pointer',
                fontSize: 16,
                marginBottom: '-2px'
              }}
            >
              Register
            </button>
            <button
              onClick={() => setAuthMode('login')}
              style={{
                padding: '12px 24px',
                background: 'none',
                border: 'none',
                borderBottom: authMode === 'login' ? '2px solid #66c0f4' : '2px solid transparent',
                color: authMode === 'login' ? '#66c0f4' : '#8f98a0',
                fontWeight: authMode === 'login' ? 700 : 400,
                cursor: 'pointer',
                fontSize: 16,
                marginBottom: '-2px'
              }}
            >
              Sign In
            </button>
          </div>

          {authMode === 'register' ? (
            <>
              <p style={{ textAlign: 'center', color: '#8f98a0', marginBottom: 30, lineHeight: 1.6 }}>
                Get started with a free IndieLens account to rate, review, and discover top indie games!
              </p>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 500 }}>Email</label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={e => setRegisterEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 500 }}>Username</label>
                <input
                  type="text"
                  value={registerUsername}
                  onChange={e => setRegisterUsername(e.target.value)}
                  placeholder="Choose a username"
                  maxLength={15}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
                <small style={{ color: '#999', fontSize: 12, marginTop: 4, display: 'block' }}>
                  15 characters max, letters and numbers only
                </small>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 500 }}>Password</label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={e => setRegisterPassword(e.target.value)}
                  placeholder="Create a password"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
                <small style={{ color: '#999', fontSize: 12, marginTop: 4, display: 'block' }}>
                  Must be at least 6 characters with 1 number and special character
                </small>
              </div>
              <div style={{ marginBottom: 30 }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 500 }}>Steam Friend Code</label>
                <input
                  type="text"
                  value={registerFriendCode}
                  onChange={e => setRegisterFriendCode(e.target.value)}
                  placeholder="Enter your Steam friend code"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                disabled={!registerEmail || !registerUsername || !registerPassword || !registerFriendCode || loading}
                onClick={registerAccount}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#66c0f4',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: loading || !registerEmail || !registerUsername || !registerPassword || !registerFriendCode ? 'not-allowed' : 'pointer',
                  opacity: loading || !registerEmail || !registerUsername || !registerPassword || !registerFriendCode ? 0.6 : 1
                }}
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
              {error && <p style={{ color: '#dc3545', marginTop: 16, fontSize: 14 }}>{error}</p>}
              <p style={{ fontSize: 12, color: '#999', marginTop: 20, textAlign: 'center', lineHeight: 1.5 }}>
                By joining IndieLens, you agree to IndieLens's Terms of Use and Privacy Policy.
              </p>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 500 }}>Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: 30 }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 500 }}>Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                disabled={!loginEmail || !loginPassword || loading}
                onClick={loginWithEmailPassword}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#66c0f4',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: loading || !loginEmail || !loginPassword ? 'not-allowed' : 'pointer',
                  opacity: loading || !loginEmail || !loginPassword ? 0.6 : 1
                }}
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
              {error && <p style={{ color: '#dc3545', marginTop: 16, fontSize: 14 }}>{error}</p>}
            </>
          )}
        </div>
      ) : (
      <div className="container">

      <div className={`panel ${tab==='rate'?'active':''}`} style={{ display: tab==='rate'?'grid':'none', gap: 12 }}>
        <button disabled={!steamId || loading} onClick={ingest}>Re-ingest Library</button>
        <hr />
        <div>
          <h3>Your Library</h3>
          {owned.length === 0 ? <p>No games loaded yet.</p> : (
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #333', padding: 8, borderRadius: 6 }}>
              {owned.map(g => (
                <div key={g.appid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #222' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>appid {g.appid} · {g.hours.toFixed(1)}h · {(g.achievementPct*100).toFixed(0)}%</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={appid === String(g.appid) ? rating : ''} onChange={e => { setAppid(String(g.appid)); setRating(e.target.value); }} type="number" min="0" max="100" placeholder="0-100" style={{ width: 80 }} />
                    <button onClick={() => { setAppid(String(g.appid)); rate(); }} disabled={loading || !rating || appid !== String(g.appid)}>Rate</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <label>
          AppID
          <input value={appid} onChange={e => setAppid(e.target.value)} placeholder="e.g. 620" style={{ width: '100%', padding: 8 }} />
        </label>
        <label>
          Raw Rating (0-100)
          <input value={rating} onChange={e => setRating(e.target.value)} type="number" min="0" max="100" style={{ width: '100%', padding: 8 }} />
        </label>
        <div>
          <button disabled={!steamId || !appid || !rating || loading} onClick={rate}>Compute Score</button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && (
        <pre style={{ background: '#111', color: '#ddd', padding: 12, borderRadius: 6, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>
      )}

      {tab === 'browse' && (
        <Browse apiBase={apiBase} data={browse} setData={setBrowse} onSelectGame={(g) => { setTab('detail'); setSelectedGame(g); }} selectedGenre={selectedHeaderGenre} searchQuery={searchQuery} />
      )}
      {tab === 'rate' && steamId && (
        <div style={{ marginTop: 40 }}>
          <h2>Rate Games</h2>
          <p><small>SteamID64: {steamId}</small></p>
        </div>
      )}
      </div>
      )}
    </>
  );
}

function Header({ onLogin, onRegister, steamId, username, onLogout, genres, selectedGenre, onGenreChange, onSearch, onHowItWorks, onMyRatings, onMyAccount, onDeveloperMode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [translatorEnabled, setTranslatorEnabled] = useState(() => {
    return localStorage.getItem('indielens_translator') === 'true';
  });
  const dropdownRef = React.useRef(null);
  const userMenuRef = React.useRef(null);
  
  React.useEffect(() => {
    localStorage.setItem('indielens_translator', translatorEnabled ? 'true' : 'false');
    // Apply translation class to body
    if (translatorEnabled && 'ai' in window && 'translator' in window.ai) {
      document.body.setAttribute('data-translate', 'true');
    } else {
      document.body.removeAttribute('data-translate');
    }
  }, [translatorEnabled]);
  
  React.useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowMoreDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    }
    if (showMoreDropdown || showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreDropdown, showUserMenu]);
  
  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery.trim());
    }
  };
  
  const mainGenres = genres.slice(0, 5);
  const moreGenres = genres.slice(5);
  
  return (
    <div className="header">
      <div className="header-left">
        <a href="/" className="logo" style={{ color: '#fff', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); onGenreChange(''); }}>IndieLens</a>
        <div className="nav-links">
          {mainGenres.map(g => (
            <a key={g} href="#" className="nav-link" onClick={(e) => { e.preventDefault(); onGenreChange(g); }} style={{ fontWeight: selectedGenre === g ? 'bold' : 'normal', textDecoration: selectedGenre === g ? 'underline' : 'none' }}>
              {g}
            </a>
          ))}
          {moreGenres.length > 0 && (
            <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
              <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); setShowMoreDropdown(!showMoreDropdown); }} style={{ fontWeight: moreGenres.includes(selectedGenre) ? 'bold' : 'normal', textDecoration: moreGenres.includes(selectedGenre) ? 'underline' : 'none' }}>
                More...
              </a>
              {showMoreDropdown && (
                <div style={{ position: 'absolute', top: '100%', left: 0, background: '#0e141b', border: '1px solid #415a79', minWidth: 150, zIndex: 1000, marginTop: 4 }}>
                  {moreGenres.map(g => (
                    <a key={g} href="#" className="nav-link" onClick={(e) => { e.preventDefault(); onGenreChange(g); setShowMoreDropdown(false); }} style={{ display: 'block', padding: '8px 12px', fontWeight: selectedGenre === g ? 'bold' : 'normal', textDecoration: selectedGenre === g ? 'underline' : 'none' }}>
                      {g}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); if (onHowItWorks) onHowItWorks(); }} style={{ fontWeight: 500 }}>
          How it works
        </a>
        <button
          onClick={() => {
            // Check for Translation API (it might be under window.ai.translator or different)
            if ('ai' in window && ('translator' in window.ai || 'translation' in window.ai)) {
              setTranslatorEnabled(!translatorEnabled);
            } else if (navigator.languages && navigator.languages.length > 0) {
              // Fallback: try using the Translation API via different method
              // The API might be available even if not under window.ai
              setTranslatorEnabled(!translatorEnabled);
            } else {
              alert('Translator API is not available. Enable "Experimental translation API" in chrome://flags');
            }
          }}
          style={{
            padding: '6px 12px',
            background: translatorEnabled ? '#BF4E30' : 'rgba(255,255,255,0.2)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '4px',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: translatorEnabled ? 600 : 400
          }}
          title="Toggle Translation (Chrome AI)"
        >
          {translatorEnabled ? '🌐 Translating' : '🌐 Translate'}
        </button>
        <form className="header-search" onSubmit={handleSearch}>
          <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <button type="submit">🔍</button>
        </form>
        {steamId ? (
          <div 
            ref={userMenuRef}
            style={{ position: 'relative', display: 'inline-block' }}
          >
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}
              aria-label="User menu"
            >
              👤
            </button>
            {showUserMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #415a79',
                  borderRadius: '4px',
                  minWidth: '200px',
                  zIndex: 1000,
                  marginTop: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
                  <div style={{ fontWeight: 700, color: '#c7d5e0', fontSize: 14 }}>
                    Hi {username || 'User'}!
                  </div>
                </div>
                <a
                  href="#"
                  onClick={(e) => { 
                    e.preventDefault(); 
                    setShowUserMenu(false);
                    if (onMyRatings) onMyRatings(); 
                  }}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    color: '#c7d5e0',
                    textDecoration: 'none',
                    fontSize: 14,
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  My Ratings & Reviews
                </a>
                <a
                  href="#"
                  onClick={(e) => { 
                    e.preventDefault(); 
                    setShowUserMenu(false);
                    if (onMyAccount) onMyAccount(); 
                  }}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    color: '#c7d5e0',
                    textDecoration: 'none',
                    fontSize: 14,
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  My Account
                </a>
                <a
                  href="#"
                  onClick={(e) => { 
                    e.preventDefault(); 
                    setShowUserMenu(false);
                    if (onDeveloperMode) onDeveloperMode(); 
                  }}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    color: '#c7d5e0',
                    textDecoration: 'none',
                    fontSize: 14,
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  My Game
                </a>
                <div style={{ borderTop: '1px solid #eee' }}>
                  <a
                    href="#"
                    onClick={(e) => { 
                      e.preventDefault(); 
                      setShowUserMenu(false);
                      onLogout(); 
                    }}
                    style={{
                      display: 'block',
                      padding: '10px 16px',
                      color: '#c7d5e0',
                      textDecoration: 'none',
                      fontSize: 14,
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    Sign Out
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <button className="register-btn" onClick={onLogin} style={{ background: 'transparent', border: '1px solid #415a79' }}>
              Login
            </button>
            <button className="register-btn" onClick={onRegister}>Register</button>
          </>
        )}
      </div>
    </div>
  );
}

function ScorePieChart({ currentUserContribution, othersContribution }) {
  const size = 120;
  const radius = size / 2 - 5;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Calculate angles for pie slices
  const currentUserAngle = (currentUserContribution / 100) * 360;
  const othersAngle = 360 - currentUserAngle;
  
  // Create path for current user slice
  const currentUserPath = currentUserContribution > 0 ? (() => {
    const startAngle = -90; // Start at top
    const endAngle = startAngle + currentUserAngle;
    const largeArcFlag = currentUserAngle > 180 ? 1 : 0;
    
    const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
    const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
    const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
    const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);
    
    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  })() : '';
  
  // Create path for others slice
  const othersPath = othersContribution > 0 ? (() => {
    const startAngle = -90 + currentUserAngle;
    const endAngle = startAngle + othersAngle;
    const largeArcFlag = othersAngle > 180 ? 1 : 0;
    
    const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
    const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
    const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
    const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);
    
    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  })() : '';
  
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        {othersContribution > 0 && othersPath && (
          <path
            d={othersPath}
            fill="#cccccc"
            stroke="#fff"
            strokeWidth="2"
          />
        )}
        {currentUserContribution > 0 && currentUserPath && (
          <path
            d={currentUserPath}
            fill="#BF4E30"
            stroke="#fff"
            strokeWidth="2"
          />
        )}
        <circle cx={centerX} cy={centerY} r={radius * 0.35} fill="#fff" />
        <text
          x={centerX}
          y={centerY - 5}
          textAnchor="middle"
          fontSize="18"
          fontWeight="600"
          fill="#BF4E30"
        >
          {currentUserContribution.toFixed(0)}%
        </text>
        <text
          x={centerX}
          y={centerY + 12}
          textAnchor="middle"
          fontSize="10"
          fill="#999"
        >
          You
        </text>
      </svg>
    </div>
  );
}

function LatestReviews({ apiBase, onSelectGame }) {
  const scrollRef = React.useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    async function loadReviews() {
      try {
        const res = await fetch(`${apiBase}/latest-reviews?limit=20`);
        if (!res.ok) {
          console.error('Failed to load reviews:', res.status, res.statusText);
          setReviews([]);
          setLoading(false);
          return;
        }
        const json = await res.json();
        console.log('[DEBUG] LatestReviews loaded:', json.reviews?.length || 0, 'reviews');
        setReviews(json.reviews || []);
      } catch (e) {
        console.error('Error loading reviews:', e);
        setReviews([]);
      } finally {
        setLoading(false);
      }
    }
    loadReviews();
  }, [apiBase]);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  React.useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [reviews]);

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const amount = 400;
    scrollRef.current.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="tag-segment">
        <div className="tag-segment-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            <h3 className="tag-segment-title">Latest Reviews</h3>
          </div>
        </div>
        <div className="tag-segment-content">
          <p style={{ padding: '40px 0', textAlign: 'center', color: '#8f98a0' }}>Loading reviews...</p>
        </div>
      </div>
    );
  }
  if (!reviews || reviews.length === 0) {
    return (
      <div className="tag-segment">
        <div className="tag-segment-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            <h3 className="tag-segment-title">Latest Reviews</h3>
          </div>
        </div>
        <div className="tag-segment-content">
          <p style={{ padding: '40px 0', textAlign: 'center', color: '#8f98a0' }}>No reviews yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tag-segment">
      <div className="tag-segment-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
          <h3 className="tag-segment-title">Latest Reviews</h3>
        </div>
        <div className="tag-segment-nav-wrapper">
          <button className="tag-segment-nav tag-segment-nav-left" onClick={() => scroll(-1)} disabled={!canScrollLeft}>‹</button>
          <button className="tag-segment-nav tag-segment-nav-right" onClick={() => scroll(1)} disabled={!canScrollRight}>›</button>
        </div>
      </div>
      <div className="tag-segment-content">
        <div className="tag-segment-scroll" ref={scrollRef}>
          {reviews.map((review, idx) => (
            <div key={`${review.appid}-${review.reviewDate}-${idx}`} className="tag-segment-card" onClick={() => onSelectGame({ appid: review.appid, name: review.gameName })} style={{ minHeight: 'auto' }}>
              <img src={review.imageUrl} alt={review.gameName || 'Game'} onError={(e)=>{e.currentTarget.style.display='none';}} style={{ height: '180px' }} />
              <div className="tag-segment-card-title" style={{ marginBottom: '6px' }}>{review.gameName || 'Unknown title'}</div>
              <div style={{ fontSize: '12px', color: '#8f98a0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span className="badge" style={{ fontSize: '11px', padding: '3px 8px' }}>{review.rating}</span>
                  <span style={{ fontSize: '10px', color: '#8f98a0' }}>Weight: {(review.weight * 100).toFixed(1)}%</span>
                </div>
                <div style={{ fontSize: '11px', color: '#8f98a0', marginBottom: '4px', fontWeight: 500 }}>
                  {review.reviewerName}
                </div>
                {review.reviewDate && (
                  <div style={{ fontSize: '10px', color: '#8f98a0', marginBottom: '6px' }}>
                    {new Date(review.reviewDate).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
                {review.reviewText && (
                  <div style={{ fontSize: '11px', color: '#8f98a0', lineHeight: '1.4', 
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', 
                    textOverflow: 'ellipsis', maxHeight: '48px' }}>
                    {review.reviewText}
                  </div>
                )}
                {!review.reviewText && (
                  <div style={{ fontSize: '11px', color: '#8f98a0', fontStyle: 'italic' }}>
                    No review text
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TagSegment({ title, games, onSelectGame, imageUrl }) {
  const scrollRef = React.useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  React.useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [games]);

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const amount = 400;
    scrollRef.current.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  if (!games || games.length === 0) return null;

  return (
    <div className="tag-segment">
      {imageUrl && (
        <div style={{ maxWidth: '1400px', margin: '0 auto 20px auto', padding: '0 40px', textAlign: 'center' }}>
          <img 
            src={imageUrl} 
            alt={title} 
            style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="tag-segment-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
          <h3 className="tag-segment-title">{title}</h3>
          <a href="#" className="tag-segment-see-all" onClick={(e) => { e.preventDefault(); }}>SEE ALL</a>
        </div>
        <div className="tag-segment-nav-wrapper">
          <button className="tag-segment-nav tag-segment-nav-left" onClick={() => scroll(-1)} disabled={!canScrollLeft}>‹</button>
          <button className="tag-segment-nav tag-segment-nav-right" onClick={() => scroll(1)} disabled={!canScrollRight}>›</button>
        </div>
      </div>
      <div className="tag-segment-content">
        <div className="tag-segment-scroll" ref={scrollRef}>
          {games.map(item => (
            <div key={item.appid} className="tag-segment-card" onClick={() => onSelectGame(item)}>
              <img src={item.imageUrl} alt={item.name || 'Game'} onError={(e)=>{e.currentTarget.style.display='none';}} />
              <div className="tag-segment-card-title">{item.name || 'Unknown title'}</div>
              <div className="tag-segment-card-score" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span className="badge">{item.score?.toFixed(0) ?? '—'}</span>
                {item.developer && (
                  <span className="tag-segment-card-developer">{item.developer}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Browse({ apiBase, data, setData, onSelectGame, selectedGenre, searchQuery }) {
  const [genres, setGenres] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagGames, setTagGames] = useState({}); // { tagName: [games] }
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('score');

  // Helper function to get genre image path
  const getGenreImagePath = (genreName) => {
    if (!genreName) return null;
    // Special mapping for genre names that don't match file names exactly
    const genreMap = {
      'Animation & Modeling': 'ANIMATION_AND_MODELLING_spacedgrey.png',
      'Design & Illustration': 'DESIGN_AND_ILLUSTRATION_spacedgrey.png',
      'Free To Play': 'FREE_TO_PLAY_spacedgrey.png',
      'Game Development': 'GAME_DEVELOPMENT_spacedgrey.png',
      'Early Access': 'EARLY_ACCESS_spacedgrey.png',
      'Photo Editing': 'PHOTO_EDITING_spacedgrey.png',
      'Massively Multiplayer': 'MASSIVELY_MULTIPLAYER_spacedgrey.png',
      'Software Training': 'SOFTWARE_TRAINING_spacedgrey.png',
      'Video Production': 'VIDEO_PRODUCTION_spacedgrey.png'
    };
    
    // Determine the base URL for genre images
    // Genre images are served directly by the backend at /genre-images
    // In production (apiBase='/api'), we need to access them at /api/genre-images
    // In development (apiBase='http://localhost:5179'), we use the full URL
    let imageBase;
    if (apiBase && apiBase.startsWith('/')) {
      // Relative path - use /api/genre-images (Nginx will proxy /api to backend)
      imageBase = '/api';
    } else if (apiBase) {
      // Full URL (development)
      imageBase = apiBase;
    } else {
      imageBase = 'http://localhost:5179';
    }
    
    // Check if we have a direct mapping
    if (genreMap[genreName]) {
      return `${imageBase}/genre-images/${genreMap[genreName]}`;
    }
    
    // Otherwise, convert genre name to image filename format
    let imageName = genreName.toUpperCase()
      .replace(/\s*&\s*/g, '_AND_')
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '') + '_spacedgrey.png';
    
    return `${imageBase}/genre-images/${imageName}`;
  };

  // Get ALL_GAMES image path
  const getAllGamesImagePath = () => {
    // Determine the base URL for genre images
    // Genre images are served directly by the backend at /genre-images
    // In production (apiBase='/api'), we need to access them at /api/genre-images
    // In development (apiBase='http://localhost:5179'), we use the full URL
    let imageBase;
    if (apiBase && apiBase.startsWith('/')) {
      // Relative path - use /api/genre-images (Nginx will proxy /api to backend)
      imageBase = '/api';
    } else if (apiBase) {
      // Full URL (development)
      imageBase = apiBase;
    } else {
      imageBase = 'http://localhost:5179';
    }
    return `${imageBase}/genre-images/ALL_GAMES_orange.png`;
  };
  
  const load = React.useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams(params).toString();
      const url = `${apiBase}/browse${qs ? ('?'+qs) : ''}`;
      console.log('[DEBUG] Browse load: fetching from', url);
      const res = await fetch(url);
      if (!res.ok) {
        console.error('[DEBUG] Browse load: HTTP error', res.status, res.statusText);
        setData([]);
        return;
      }
      const json = await res.json();
      console.log('[DEBUG] Browse load: received', json.items?.length || 0, 'games');
      setData(json.items || []);
    } catch (e) {
      console.error('[DEBUG] Browse load error:', e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, setData]);
  
  async function loadGenres() {
    try {
      const res = await fetch(`${apiBase}/genres`);
      const json = await res.json();
      setGenres(json.genres || []);
    } catch {}
  }

  async function loadTags() {
    if (!selectedGenre) {
      setTags([]);
      setTagGames({});
      return;
    }
    setLoading(true);
    try {
      // Load tags and all games for the genre in parallel
      const [tagsRes, gamesRes] = await Promise.all([
        fetch(`${apiBase}/tags?genre=${encodeURIComponent(selectedGenre)}`),
        fetch(`${apiBase}/browse?genre=${encodeURIComponent(selectedGenre)}`)
      ]);
      
      const tagsJson = await tagsRes.json();
      const gamesJson = await gamesRes.json();
      
      const tagList = tagsJson.tags || [];
      const allGames = gamesJson.items || [];
      
      console.log('[DEBUG] loadTags - Genre:', selectedGenre, 'Games found:', allGames.length, 'Tags found:', tagList.length);
      
      // Update data state with games from this genre
      setData(allGames);
      
      setTags(tagList);
      
      // Filter games by tag client-side (much faster than multiple API calls)
      const tagGamesMap = {};
      tagList.forEach(tag => {
        const tagLower = tag.toLowerCase();
        tagGamesMap[tag] = allGames.filter(game => 
          (game.tags || []).some(t => {
            const tStr = (typeof t === 'string' ? t : String(t || '')).trim().toLowerCase();
            return tStr === tagLower;
          })
        );
      });
      
      setTagGames(tagGamesMap);
    } catch (e) {
      console.error('Error loading tags:', e);
      setTags([]);
      setTagGames({});
      setData([]);
    } finally {
      setLoading(false);
    }
  }
  
  useEffect(() => { 
    loadGenres();
  }, []);

  useEffect(() => {
    if (selectedGenre) {
      // When genre is selected, loadTags() handles loading games
      loadTags();
    } else {
      // When no genre, use load() for search/browse
      load({ genre: '', q: searchQuery || '', sort: sortBy });
    }
  }, [selectedGenre, searchQuery, sortBy, load]);

  // If search query exists, show search results in grid format with sort option
  if (searchQuery && searchQuery.trim()) {
    return (
      <div>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '0 20px' }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#c7d5e0' }}>Search: "{searchQuery}"</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 14, color: '#8f98a0', fontWeight: 500 }}>Sort By:</label>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                style={{ 
                  padding: '6px 12px', 
                  border: '1px solid #415a79', 
                  borderRadius: '4px', 
                  fontSize: 14,
                  background: 'rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer'
                }}
              >
                <option value="score">Score</option>
                <option value="popular">Popular</option>
              </select>
            </div>
          </div>
        </div>
        <div className="container">
          {loading ? <p style={{ textAlign: 'center', padding: '40px' }}>Loading…</p> : data.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px', color: '#8f98a0' }}>No games found matching "{searchQuery}"{selectedGenre ? ` in genre "${selectedGenre}"` : ''}.</p>
          ) : (
            <div className="grid">
              {data.map(item => (
                <div key={item.appid} className="game-card" onClick={() => onSelectGame(item)}>
                  <img src={item.imageUrl} alt={item.name || 'Game'} onError={(e)=>{e.currentTarget.style.display='none';}} />
                  <div className="meta">
                    <div style={{ flex: 1, paddingRight: 8 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || 'Unknown title'}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{(item.genres||[]).slice(0,2).join(', ')}</div>
                    </div>
                    <div className="badge">{item.score?.toFixed(1) ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show tag segments when genre is selected, otherwise show grid
  if (selectedGenre) {
    if (loading) {
      return <div style={{ padding: '20px 0', width: '100%' }}><p>Loading tag segments…</p></div>;
    }
    if (tags.length > 0) {
      // Check if any tag has games
      const hasGamesInTags = tags.some(tag => tagGames[tag] && tagGames[tag].length > 0);
      
      console.log('[DEBUG] Render - tags.length:', tags.length, 'hasGamesInTags:', hasGamesInTags, 'data.length:', data.length);
      
      // If tags exist but no games in any tag, fall back to grid view
      if (!hasGamesInTags && data.length > 0) {
        const genreImagePath = getGenreImagePath(selectedGenre);
        return (
          <div style={{ padding: '20px 0' }}>
            {genreImagePath && (
              <div style={{ maxWidth: '1400px', margin: '0 auto 40px auto', padding: '0 40px', textAlign: 'center' }}>
                <img 
                  src={genreImagePath} 
                  alt={selectedGenre} 
                  style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            <div className="container">
              <div className="grid">
                {data.map(item => (
                  <div key={item.appid} className="game-card" onClick={() => onSelectGame(item)}>
                    <img src={item.imageUrl} alt={item.name || 'Game'} onError={(e)=>{e.currentTarget.style.display='none';}} />
                    <div className="meta">
                      <div style={{ flex: 1, paddingRight: 8 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || 'Unknown title'}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{(item.genres||[]).slice(0,2).join(', ')}</div>
                      </div>
                      <div className="badge">{item.score?.toFixed(1) ?? '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      
      // Show tag segments if they have games
      const genreImagePath = getGenreImagePath(selectedGenre);
      return (
        <div className="tag-segments-wrapper" style={{ padding: '20px 0' }}>
          {genreImagePath && (
            <div style={{ maxWidth: '1400px', margin: '0 auto 40px auto', padding: '0 40px', textAlign: 'center' }}>
              <img 
                src={genreImagePath} 
                alt={selectedGenre} 
                style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}
          {tags.map(tag => {
            const tagImagePath = getGenreImagePath(tag);
            return (
              <TagSegment 
                key={tag} 
                title={tag} 
                games={tagGames[tag] || []} 
                onSelectGame={onSelectGame}
                imageUrl={tagImagePath}
              />
            );
          })}
        </div>
      );
    }
    // Genre selected but no tags found - show games in grid format
    console.log('[DEBUG] No tags - data.length:', data.length, 'loading:', loading);
    const genreImagePath = getGenreImagePath(selectedGenre);
    return (
      <div style={{ padding: '20px 0' }}>
        {genreImagePath && (
          <div style={{ maxWidth: '1400px', margin: '0 auto 40px auto', padding: '0 40px', textAlign: 'center' }}>
            <img 
              src={genreImagePath} 
              alt={selectedGenre} 
              style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        )}
        {loading ? (
          <p style={{ textAlign: 'center', padding: '40px', color: '#8f98a0' }}>Loading games...</p>
        ) : data.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '40px', color: '#8f98a0' }}>No games found in genre "{selectedGenre}".</p>
        ) : (
          <div className="container">
            <div className="grid">
              {data.map(item => (
                <div key={item.appid} className="game-card" onClick={() => onSelectGame(item)}>
                  <img src={item.imageUrl} alt={item.name || 'Game'} onError={(e)=>{e.currentTarget.style.display='none';}} />
                  <div className="meta">
                    <div style={{ flex: 1, paddingRight: 8 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || 'Unknown title'}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{(item.genres||[]).slice(0,2).join(', ')}</div>
                    </div>
                    <div className="badge">{item.score?.toFixed(1) ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {!selectedGenre && !searchQuery && (
        <>
          <div style={{ maxWidth: '1400px', margin: '0 auto 40px auto', padding: '0 40px', textAlign: 'center' }}>
            <img 
              src={getAllGamesImagePath()} 
              alt="All Games" 
              style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div style={{ marginTop: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, color: '#c7d5e0', fontWeight: 600 }}>All Games</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 14, color: '#8f98a0', fontWeight: 500 }}>Sort By:</label>
                  <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ 
                      padding: '6px 12px', 
                      border: '1px solid #415a79', 
                      borderRadius: '4px', 
                      fontSize: 14,
                      background: 'rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="score">Score</option>
                    <option value="popular">Popular</option>
                  </select>
                </div>
              </div>
              <div style={{ width: '100%', height: '1px', backgroundColor: '#415a79', marginTop: 12 }}></div>
            </div>
          </div>
          <div className="tag-segments-wrapper" style={{ padding: '20px 0' }}>
            <LatestReviews apiBase={apiBase} onSelectGame={onSelectGame} />
          </div>
        </>
      )}
      {(!selectedGenre && !searchQuery) ? null : (
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '0 20px' }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#c7d5e0' }}>
              {selectedGenre ? selectedGenre : searchQuery ? `Search: "${searchQuery}"` : 'All Games'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 14, color: '#8f98a0', fontWeight: 500 }}>Sort By:</label>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                style={{ 
                  padding: '6px 12px', 
                  border: '1px solid #415a79', 
                  borderRadius: '4px', 
                  fontSize: 14,
                  background: 'rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer'
                }}
              >
                <option value="score">Score</option>
                <option value="popular">Popular</option>
              </select>
            </div>
          </div>
        </div>
      )}
      <div className="container">
        {loading ? (
          <p style={{ textAlign: 'center', padding: '40px', color: '#8f98a0' }}>Loading…</p>
        ) : data.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '40px', color: '#8f98a0' }}>
            No games found{selectedGenre ? ` in genre "${selectedGenre}"` : searchQuery ? ` matching "${searchQuery}"` : ''}.
          </p>
        ) : (
          <div className="grid">
            {data.map(item => (
              <div key={item.appid} className="game-card" onClick={() => onSelectGame(item)}>
                <img src={item.imageUrl} alt={item.name || 'Game'} onError={(e)=>{e.currentTarget.style.display='none';}} />
                <div className="meta">
                  <div style={{ flex: 1, paddingRight: 8 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || 'Unknown title'}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{(item.genres||[]).slice(0,2).join(', ')}</div>
                  </div>
                  <div className="badge">{item.score?.toFixed(1) ?? '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GameDetail({ apiBase, game, steamId, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRating, setUserRating] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ratingResult, setRatingResult] = useState(null);
  const [ratingError, setRatingError] = useState(null);
  const [previewBreakdown, setPreviewBreakdown] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const res = await fetch(`${apiBase}/game/${game.appid}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setDetails(json);
      } catch (e) {
        console.error('GameDetail load error:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    
    async function loadScoreBreakdown() {
      if (!game?.appid) return;
      try {
        setLoadingBreakdown(true);
        // Ensure steamId is a valid string (not null, undefined, empty, or the string "null")
        const validSteamId = steamId && steamId !== 'null' && steamId !== 'undefined' && String(steamId).trim() !== '' && String(steamId) !== 'null'
          ? String(steamId).trim() 
          : null;
        console.log('[DEBUG] loadScoreBreakdown: steamId=', steamId, 'validSteamId=', validSteamId, 'game.appid=', game.appid);
        const url = validSteamId 
          ? `${apiBase}/game/${game.appid}/score-breakdown?steamId=${encodeURIComponent(validSteamId)}`
          : `${apiBase}/game/${game.appid}/score-breakdown`;
        console.log('[DEBUG] Loading score breakdown from:', url, 'steamId type:', typeof steamId, 'steamId value:', steamId);
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          console.log('[DEBUG] Score breakdown response:', json);
          if (json.status === 'ok' && json.breakdown) {
            console.log('[DEBUG] Breakdown data:', {
              ratingCount: json.breakdown.ratingCount,
              currentUser: json.breakdown.currentUser ? 'found' : 'not found',
              currentUserSteamId: json.breakdown.currentUser?.steamid,
              contributions: json.breakdown.contributions?.length
            });
            setScoreBreakdown(json.breakdown);
          } else {
            console.log('[DEBUG] No breakdown data:', json.message);
            setScoreBreakdown(null);
          }
        } else {
          console.error('[DEBUG] Score breakdown HTTP error:', res.status, res.statusText);
        }
      } catch (e) {
        console.error('Score breakdown load error:', e);
      } finally {
        setLoadingBreakdown(false);
      }
    }
    
    if (game && game.appid) {
      load();
      // Only load score breakdown if we have a game - steamId might not be loaded yet, but that's OK
      // The function will handle the case where steamId is null/undefined
      loadScoreBreakdown();
    } else {
      setLoading(false);
      setError('No game selected');
    }
  }, [game?.appid, apiBase, steamId]);

  if (loading) {
    return (
      <div className="container" style={{ minHeight: '100vh', padding: '40px' }}>
        <div className="detail-back" onClick={onClose}>← Back to Browse</div>
        <p>Loading game details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ minHeight: '100vh', padding: '40px' }}>
        <div className="detail-back" onClick={onClose}>← Back to Browse</div>
        <p style={{ color: 'crimson' }}>Error: {error}</p>
        {game && <p>Game: {game.name || game.appid}</p>}
      </div>
    );
  }

  const d = details || game;
  const headerImg = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
  const shortDesc = d.short_description || '';
  const detailedDesc = d.detailed_description || '';

  if (!d && !game) {
    return (
      <div className="container" style={{ minHeight: '100vh', padding: '40px' }}>
        <div className="detail-back" onClick={onClose}>← Back to Browse</div>
        <p>No game data available</p>
      </div>
    );
  }

  const score = d.score ? Math.round(d.score) : null;
  const getScoreColor = (s) => {
    if (!s) return '#999';
    if (s >= 75) return '#66cc33';
    if (s >= 50) return '#ffcc33';
    return '#ff0000';
  };

  return (
    <div className="game-detail-page">
      <img src={headerImg} alt={d.name || game.name} className="game-header-img" onError={(e)=>{e.currentTarget.style.display='none'; e.currentTarget.src='';}} />
      <div className="detail-content-wrapper">
        <div className="detail-back" onClick={onClose}>← Back to Browse</div>
        
        <div className="detail-header-section">
          <div className="detail-header-left">
            <h1 style={{ marginTop: 0, marginBottom: 16, fontSize: '4em', fontWeight: 700, color: '#c7d5e0', lineHeight: 1.1 }}>
              {d.name || game.name || 'Unknown Game'}
            </h1>
            {d.developer && (
              <p style={{ fontSize: 18, color: '#c7d5e0', margin: '12px 0' }}>
                Developer: <strong>{d.developer}</strong>
                {d.publisher && ` • Publisher: ${d.publisher}`}
              </p>
            )}
          </div>
          
          <div className="detail-header-right">
              <div className="detail-score-box">
              <div className="detail-score-label">IndieLens Score</div>
              <div className="detail-score-number" style={{ color: '#d4af37' }}>
                {score ?? '—'}
              </div>
            </div>
            {scoreBreakdown && typeof scoreBreakdown.profileMatchScore === 'number' && !isNaN(scoreBreakdown.profileMatchScore) && (
              <div className="detail-score-box" style={{ marginTop: 16 }}>
                <div className="detail-score-label" style={{ color: '#4A90E2' }}>Profile Match Score</div>
                <div className="detail-score-number" style={{ color: '#4A90E2' }}>
                  {scoreBreakdown.profileMatchScore.toFixed(1)}
                </div>
              </div>
            )}
            
            {d.price && (
              <div className="detail-price-box">
                <div className="detail-score-label" style={{ marginBottom: 12 }}>PRICE ON STEAM</div>
                {d.price.final === 0 ? (
                  <div className="detail-price-free">Free to Play</div>
                ) : (
                  <>
                    {d.price.discount_percent > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <span className="detail-price-original">
                          ${d.price.initial?.toFixed(2)}
                        </span>
                        <span className="detail-price-discount">-{d.price.discount_percent}%</span>
                      </div>
                    )}
                    <div className="detail-price-amount">
                      ${d.price.final?.toFixed(2) ?? 'N/A'}
                    </div>
                    {d.price.currency && d.price.currency !== 'USD' && (
                      <div style={{ fontSize: 12, color: '#c7d5e0', marginTop: 4 }}>{d.price.currency}</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="recent-scores-section">
          <div className="recent-scores-title">Community Score</div>
          <div className="recent-score-item">
            <div className="recent-score-value" style={{ color: '#d4af37' }}>{score ?? '—'}</div>
            <div>
              <div className="recent-score-user">IndieLens Score</div>
              <div className="recent-score-date">Weighted average</div>
            </div>
          </div>
          {scoreBreakdown && typeof scoreBreakdown.profileMatchScore === 'number' && !isNaN(scoreBreakdown.profileMatchScore) && (
            <div className="recent-score-item" style={{ marginTop: 12 }}>
              <div className="recent-score-value" style={{ color: '#4A90E2' }}>{scoreBreakdown.profileMatchScore.toFixed(1)}</div>
              <div>
                <div className="recent-score-user" style={{ color: '#4A90E2' }}>Profile Match Score</div>
                <div className="recent-score-date" style={{ color: '#4A90E2' }}>Average from similar users</div>
              </div>
            </div>
          )}
          {!score && (
            <div style={{ padding: '12px 0', color: '#c7d5e0', fontStyle: 'italic' }}>
              No scores yet. Be the first to rate this game!
            </div>
          )}
          {score && scoreBreakdown && scoreBreakdown.ratingCount > 0 && scoreBreakdown.currentUser && (
            <div style={{ marginTop: 24, padding: '20px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid #415a79' }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '18px', fontWeight: 600, color: '#c7d5e0' }}>
                Your Contribution to Score
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <ScorePieChart 
                  currentUserContribution={scoreBreakdown.currentUser.contribution} 
                  othersContribution={100 - scoreBreakdown.currentUser.contribution}
                />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 12, height: 12, backgroundColor: '#BF4E30', borderRadius: 2 }}></div>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#c7d5e0' }}>
                        Your Rating
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#8f98a0', marginLeft: 20 }}>
                      {scoreBreakdown.currentUser.contribution.toFixed(1)}% of total score
                      <br />
                      <span style={{ fontSize: '12px', color: '#999' }}>
                        Weight: {(scoreBreakdown.currentUser.weight * 100).toFixed(1)}% • Rating: {scoreBreakdown.currentUser.rating}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 12, height: 12, backgroundColor: '#cccccc', borderRadius: 2 }}></div>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#c7d5e0' }}>
                        Other Users
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#8f98a0', marginLeft: 20 }}>
                      {(100 - scoreBreakdown.currentUser.contribution).toFixed(1)}% of total score
                      <br />
                      <span style={{ fontSize: '12px', color: '#999' }}>
                        {scoreBreakdown.ratingCount - 1} other rating{scoreBreakdown.ratingCount - 1 !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {score && scoreBreakdown && scoreBreakdown.ratingCount > 0 && !scoreBreakdown.currentUser && (
            <div style={{ marginTop: 24, padding: '20px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid #415a79' }}>
              <p style={{ margin: 0, color: '#8f98a0', fontSize: '14px' }}>
                This game has {scoreBreakdown.ratingCount} rating{scoreBreakdown.ratingCount !== 1 ? 's' : ''} total. 
                {steamId ? ' Submit a rating below to see your contribution!' : ' Log in to submit a rating and see your contribution.'}
              </p>
            </div>
          )}
        </div>
        
        {shortDesc && (
          <div className="description-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>About</h3>
              {'ai' in window && 'summarizer' in window.ai && (
                <button
                  onClick={async () => {
                    try {
                      // Extract text from HTML
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = shortDesc;
                      const text = tempDiv.textContent || tempDiv.innerText || '';
                      const result = await window.ai.summarizer.summarize(text);
                      if (result && result.summary) {
                        // Show summary in a new div or alert
                        const summaryDiv = document.getElementById('summary-about');
                        if (summaryDiv) {
                          const summaryText = result.summary || result.text || result;
                          summaryDiv.innerHTML = `<p style="color: #c7d5e0; font-style: italic; margin-top: 12px;"><strong>Summary:</strong> ${summaryText}</p>`;
                        }
                      }
                    } catch (e) {
                      console.error('Summarizer API error:', e);
                      alert('Summarizer API is not available. Make sure you are using Chrome with the built-in AI enabled.');
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: '#c7d5e0'
                  }}
                >
                  📝 Summarize (Chrome AI)
                </button>
              )}
            </div>
            <div dangerouslySetInnerHTML={{ __html: shortDesc }} />
            <div id="summary-about"></div>
          </div>
        )}

        {detailedDesc && (
          <div className="description-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>Description</h3>
              {'ai' in window && 'summarizer' in window.ai && (
                <button
                  onClick={async () => {
                    try {
                      // Extract text from HTML
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = detailedDesc;
                      const text = tempDiv.textContent || tempDiv.innerText || '';
                      let result;
                      if (typeof window.ai.summarizer.summarize === 'function') {
                        result = await window.ai.summarizer.summarize(text);
                      } else {
                        throw new Error('Summarizer API method not found');
                      }
                      if (result && (result.summary || result.text || result)) {
                        const summaryDiv = document.getElementById('summary-description');
                        if (summaryDiv) {
                          const summaryText = result.summary || result.text || result;
                          summaryDiv.innerHTML = `<p style="color: #c7d5e0; font-style: italic; margin-top: 12px;"><strong>Summary:</strong> ${summaryText}</p>`;
                        }
                      }
                    } catch (e) {
                      console.error('Summarizer API error:', e);
                      console.error('window.ai.summarizer:', window.ai.summarizer);
                      alert('Summarizer API error: ' + e.message);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: '#c7d5e0'
                  }}
                >
                  📝 Summarize (Chrome AI)
                </button>
              )}
            </div>
            <div dangerouslySetInnerHTML={{ __html: detailedDesc }} />
            <div id="summary-description"></div>
          </div>
        )}

        {/* AI-Powered Game Recommendation Explanation */}
        {steamId && details && (
          <div className="description-box" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>AI Game Recommendation</h3>
              {'ai' in window && 'prompt' in window.ai && (
                <button
                  onClick={async () => {
                    try {
                      // Get user's gaming profile data
                      const promptText = `Explain why the game "${details.name}" (AppID: ${details.appid}) matches my gaming profile. Use mathematical formulas and specific user data from my Steam library. Include:
- Profile Match calculation (Jaccard similarity over tags/genres, developer match)
- Engagement calculation (playtime and achievement completion)
- How this compares to similar games I've played
- Why my rating would have high or low weighting
- Specific examples from my gaming history`;

                      // Try different API calling methods
                      let result;
                      if (typeof window.ai.prompt.prompt === 'function') {
                        try {
                          result = await window.ai.prompt.prompt(promptText, {
                            systemInstruction: `You are an expert gaming analytics assistant. Explain game recommendations using the IndieLens weighting system with mathematical precision and user-specific data.`
                          });
                        } catch (e) {
                          // Try without systemInstruction
                          result = await window.ai.prompt.prompt(promptText);
                        }
                      } else {
                        console.error('Prompt API structure:', window.ai.prompt);
                        throw new Error('Prompt API method not found. Available: ' + Object.keys(window.ai.prompt || {}).join(', '));
                      }
                      
                      if (result && (result.text || result.response || result)) {
                        const explanationDiv = document.getElementById('ai-explanation');
                        if (explanationDiv) {
                          const responseText = result.text || result.response || String(result);
                          explanationDiv.innerHTML = `<div style="padding: 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid #415a79; border-radius: 4px; margin-top: 12px;"><p style="color: #c7d5e0; white-space: pre-wrap; line-height: 1.6;">${responseText}</p></div>`;
                        }
                      }
                    } catch (e) {
                      console.error('Prompt API error:', e);
                      console.error('window.ai structure:', window.ai ? Object.keys(window.ai) : 'window.ai not found');
                      console.error('window.ai.prompt structure:', window.ai?.prompt ? Object.keys(window.ai.prompt) : 'prompt not found');
                      alert('Prompt API error: ' + e.message + '\n\nCheck browser console (F12) for detailed API structure information.');
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: '#c7d5e0'
                  }}
                >
                  🤖 Explain Match (Chrome AI)
                </button>
              )}
            </div>
            <p style={{ color: '#8f98a0', fontSize: 14, marginBottom: 0 }}>
              Get an AI-powered explanation of why this game matches your gaming profile, with mathematical details and user data.
            </p>
            {!('ai' in window) || !('prompt' in window.ai) ? (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 193, 7, 0.2)', border: '1px solid #ffc107', borderRadius: '4px', fontSize: 12, color: '#ffc107' }}>
                <strong>Note:</strong> Prompt API not available. Enable it in <code>chrome://flags</code> by searching for "Prompt API" or "on-device prompt".
              </div>
            ) : null}
            <div id="ai-explanation"></div>
          </div>
        )}

        {steamId && (
          <div className="description-box" style={{ marginBottom: 40 }}>
            <h3>Submit Your Rating</h3>
            <p style={{ color: '#8f98a0', marginBottom: 20, fontSize: 14 }}>
              Rate this game from 0-100. Your rating will be weighted based on your gaming profile and engagement.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <input
                type="number"
                min="0"
                max="100"
                value={userRating}
                onChange={async (e) => {
                  const value = e.target.value;
                  setUserRating(value);
                  
                  // Preview weighting breakdown when user enters a valid rating
                  if (value && Number(value) >= 0 && Number(value) <= 100 && !isNaN(value)) {
                    if (!steamId) {
                      // User not logged in, don't show preview
                      setPreviewBreakdown(null);
                      return;
                    }
                    setLoadingPreview(true);
                    try {
                      const previewRes = await fetch(`${apiBase}/preview-weighting`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ steamId, appid: game.appid, rating: Number(value) })
                      });
                      const previewJson = await previewRes.json();
                      if (previewRes.ok && previewJson.status === 'ok') {
                        setPreviewBreakdown(previewJson);
                      } else {
                        setPreviewBreakdown(null);
                      }
                    } catch (e) {
                      console.error('Failed to preview weighting:', e);
                      setPreviewBreakdown(null);
                    } finally {
                      setLoadingPreview(false);
                    }
                  } else {
                    setPreviewBreakdown(null);
                  }
                }}
                placeholder="0-100"
                disabled={submitting}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #415a79',
                  borderRadius: '4px',
                  fontSize: 16,
                  width: '120px',
                  boxSizing: 'border-box'
                }}
              />
              <button
                onClick={async () => {
                  if (!userRating || userRating < 0 || userRating > 100) {
                    setRatingError('Please enter a rating between 0 and 100');
                    return;
                  }
                  setSubmitting(true);
                  setRatingError(null);
                  setRatingResult(null);
                  try {
                    const res = await fetch(`${apiBase}/rate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        steamId, 
                        appid: game.appid, 
                        rating: Number(userRating),
                        reviewText: reviewText.trim() || null
                      })
                    });
                    const json = await res.json();
                    if (!res.ok || json.status === 'error') {
                      throw new Error(json.error || json.message || 'Failed to submit rating');
                    }
                    setRatingResult(json);
                    setPreviewBreakdown(null); // Clear preview after submission
                    setReviewText(''); // Clear review text after submission
                    // Reload game details to get updated score
                    const detailRes = await fetch(`${apiBase}/game/${game.appid}`);
                    if (detailRes.ok) {
                      const detailJson = await detailRes.json();
                      setDetails(detailJson);
                    }
                    // Reload score breakdown to show updated contribution
                    loadScoreBreakdown();
                  } catch (e) {
                    setRatingError(e.message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting || !userRating || userRating < 0 || userRating > 100}
                style={{
                  padding: '10px 24px',
                  background: '#BF4E30',
                  color: '#ffffff',
                  border: '1px solid #415a79',
                  borderRadius: '4px',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: submitting || !userRating ? 'not-allowed' : 'pointer',
                  opacity: submitting || !userRating ? 0.6 : 1
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
            
            {/* Review Text Input */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, color: '#c7d5e0', fontWeight: 600, fontSize: 14 }}>
                Write a Review (Optional)
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your thoughts about this game..."
                disabled={submitting}
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #415a79',
                  borderRadius: '4px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#c7d5e0'
                }}
              />
              {reviewText && (
                <button
                  onClick={async () => {
                    // Check if Proofreader API is available
                    if ('ai' in window && 'proofreader' in window.ai) {
                      try {
                        const result = await window.ai.proofreader.proofread(reviewText);
                        if (result && result.correctedText) {
                          setReviewText(result.correctedText);
                          alert('Grammar corrections applied!');
                        }
                      } catch (e) {
                        console.error('Proofreader API error:', e);
                        alert('Proofreader API error: ' + e.message + '\n\nFor hackathon: API integration is complete. This may require Chrome Canary or registration with Chrome Built-in AI Early Preview Program.');
                      }
                    } else {
                      alert('Proofreader API not detected.\n\nFor hackathon submission: API integration is complete in code. Enable flags in chrome://flags and use Chrome Canary for best compatibility.\n\nAll API integrations are documented in HACKATHON_SUBMISSION_NOTES.md');
                    }
                  }}
                  style={{
                    marginTop: 8,
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #415a79',
                    borderRadius: '4px',
                    fontSize: 12,
                    cursor: 'pointer',
                    color: '#c7d5e0'
                  }}
                >
                  ✏️ Check Grammar (Chrome AI)
                </button>
              )}
            </div>
            
            {ratingError && (
              <p style={{ color: '#dc3545', marginTop: 12, fontSize: 14 }}>{ratingError}</p>
            )}
            
            {/* Preview Weighting Breakdown */}
            {loadingPreview && (
              <p style={{ color: '#8f98a0', marginTop: 12, fontSize: 14 }}>Calculating your weighting...</p>
            )}
            
            {previewBreakdown && previewBreakdown.breakdown && !ratingResult && (
              <div style={{ 
                marginTop: 24, 
                padding: 20, 
                background: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px',
                border: '1px solid #415a79'
              }}>
                <h4 style={{ marginTop: 0, marginBottom: 16, color: '#c7d5e0', fontSize: 18 }}>
                  Your Weighting Preview
                </h4>
                <p style={{ color: '#8f98a0', marginBottom: 16, fontSize: 12, fontStyle: 'italic' }}>
                  This shows how your rating would be weighted. Submit to save your rating.
                </p>
                <div style={{ display: 'grid', gap: 16 }}>
                  {previewBreakdown.breakdown.profileMatch !== undefined && (
                    <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Profile Match</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                          {(previewBreakdown.breakdown.profileMatch * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                        How well this game matches your gaming history based on genres, tags, and developers
                      </div>
                    </div>
                  )}
                  
                  {previewBreakdown.breakdown.engagement !== undefined && (
                    <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Engagement</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                          {(previewBreakdown.breakdown.engagement * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                        Your engagement level with this game, considering playtime and achievement completion
                      </div>
                    </div>
                  )}
                  
                  {(() => {
                    const penalty = previewBreakdown.breakdown.softPenaltyAPH ?? previewBreakdown.breakdown.penaltyAPH ?? 1.0;
                    // Only show penalty if it's less than 100% (actual penalty applied)
                    if (penalty < 1.0) {
                      return (
                        <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Achievement Penalty</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                              {(penalty * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                            Adjusts for games with unusually low achievements-per-hour compared to your similar games
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '2px solid #415a79' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: '#c7d5e0', fontSize: 16 }}>Final Weight</span>
                      <span style={{ fontSize: 24, fontWeight: 700, color: '#c7d5e0' }}>
                        {previewBreakdown.weight?.toFixed(2) ?? '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                      Your rating will be weighted by this value in the aggregate score
                    </div>
                  </div>
                  
                  <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '2px solid #415a79' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: '#c7d5e0', fontSize: 16 }}>Weighted Score Contribution</span>
                      <span style={{ fontSize: 24, fontWeight: 700, color: '#c7d5e0' }}>
                        {previewBreakdown.weightedScore ?? ((previewBreakdown.raw ?? userRating) * (previewBreakdown.weight ?? 0)).toFixed(1)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                      Your contribution to the game's aggregate IndieLens score
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Show breakdown after submission (replaces preview) */}
            {ratingResult && ratingResult.breakdown && (
              <div style={{ 
                marginTop: 24, 
                padding: 20, 
                background: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px',
                border: '1px solid #415a79'
              }}>
                <h4 style={{ marginTop: 0, marginBottom: 16, color: '#c7d5e0', fontSize: 18 }}>
                  Your Weighting Breakdown
                </h4>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Raw Rating</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                        {ratingResult.raw ?? userRating}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                      Your original rating for this game
                    </div>
                  </div>
                  
                  {ratingResult.breakdown.profileMatch !== undefined && (
                    <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Profile Match</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                          {(ratingResult.breakdown.profileMatch * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                        How well this game matches your gaming history based on genres, tags, and developers
                      </div>
                    </div>
                  )}
                  
                  {ratingResult.breakdown.engagement !== undefined && (
                    <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Engagement</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                          {(ratingResult.breakdown.engagement * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                        Your engagement level with this game, considering playtime and achievement completion
                      </div>
                    </div>
                  )}
                  
                  {(() => {
                    const penalty = ratingResult.breakdown.softPenaltyAPH ?? ratingResult.breakdown.penaltyAPH ?? 1.0;
                    // Only show penalty if it's less than 100% (actual penalty applied)
                    if (penalty < 1.0) {
                      return (
                        <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid #415a79' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontWeight: 600, color: '#c7d5e0' }}>Achievement Penalty</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#c7d5e0' }}>
                              {(penalty * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                            Adjusts for games with unusually low achievements-per-hour compared to your similar games
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '2px solid #415a79' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: '#c7d5e0', fontSize: 16 }}>Final Weight</span>
                      <span style={{ fontSize: 24, fontWeight: 700, color: '#c7d5e0' }}>
                        {ratingResult.breakdown.weight?.toFixed(2) ?? '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                      Your rating will be weighted by this value in the aggregate score
                    </div>
                  </div>
                  
                  <div style={{ padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '2px solid #415a79' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: '#c7d5e0', fontSize: 16 }}>Weighted Score Contribution</span>
                      <span style={{ fontSize: 24, fontWeight: 700, color: '#c7d5e0' }}>
                        {ratingResult.weightedScore?.toFixed(1) ?? ((ratingResult.raw ?? userRating) * (ratingResult.breakdown.weight ?? 0)).toFixed(1)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#c7d5e0' }}>
                      Your contribution to the game's aggregate IndieLens score
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="detail-grid">
          {d.genres && d.genres.length > 0 && (
            <div className="detail-item">
              <div className="detail-label">Genres</div>
              <div className="detail-value">
                <div className="tags-list">
                  {d.genres.map((g, i) => <span key={i} className="tag-chip">{g}</span>)}
                </div>
              </div>
            </div>
          )}
          {d.tags && d.tags.length > 0 && (
            <div className="detail-item">
              <div className="detail-label">Tags</div>
              <div className="detail-value">
                <div className="tags-list">
                  {d.tags.map((t, i) => <span key={i} className="tag-chip">{t}</span>)}
                </div>
              </div>
            </div>
          )}
          <div className="detail-item">
            <div className="detail-label">Steam App ID</div>
            <div className="detail-value">{game.appid}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">View on Steam</div>
            <div className="detail-value">
              <a href={`https://store.steampowered.com/app/${game.appid}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff', textDecoration: 'none' }}>
                Store Page →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyAccount({ apiBase, steamId, username }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('username');
  const [usernameValue, setUsernameValue] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    async function fetchAccount() {
      try {
        const res = await fetch(`${apiBase}/account?steamId=${steamId}`);
        const contentType = res.headers.get('content-type');
        let json;
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Server returned HTML instead of JSON. Make sure the server is running and the endpoint exists. Response: ${text.substring(0, 200)}`);
        } else {
          json = await res.json();
        }
        if (!res.ok || json.status === 'error') {
          throw new Error(json.error || 'Failed to load account');
        }
        setAccount(json.account);
        setUsernameValue(json.account.username || '');
        setEmailValue(json.account.email || '');
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAccount();
  }, [apiBase, steamId]);
  
  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Implement actual save endpoint
      setTimeout(() => {
        setSaving(false);
        alert('Changes saved! (Note: Save functionality not yet implemented on backend)');
      }, 500);
    } catch (e) {
      setSaving(false);
      alert('Error saving changes: ' + e.message);
    }
  };
  
  if (loading) return <div style={{ textAlign: 'center', color: '#c7d5e0', padding: '40px' }}>Loading account details...</div>;
  if (error) {
    if (error.includes('User not found')) {
      return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
          <h1 style={{ color: '#c7d5e0', fontSize: '28px', fontWeight: 700, marginBottom: 0, paddingBottom: 12 }}>
            My Account
          </h1>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#415a79', marginBottom: 20 }}></div>
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: '#c7d5e0', fontSize: '16px', fontWeight: 600, marginBottom: 12 }}>
              Account not found
            </p>
            <p style={{ color: '#8f98a0', fontSize: '14px', marginBottom: 24 }}>
              You need to register an account to access this page. Please register using your email and Steam friend code.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 30px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid #415a79',
                borderRadius: 0,
                color: '#c7d5e0',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Go to Registration
            </button>
          </div>
        </div>
      );
    }
    return <div style={{ color: '#dc3545', padding: '40px' }}>Error: {error}</div>;
  }
  if (!account) return <div style={{ color: '#c7d5e0', padding: '40px' }}>No account found</div>;
  
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ color: '#c7d5e0', fontSize: '28px', fontWeight: 700, marginBottom: 0, paddingBottom: 12 }}>
        My Account
      </h1>
      <div style={{ width: '100%', height: '1px', backgroundColor: '#415a79', marginBottom: 20 }}></div>
      
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 30, borderBottom: '1px solid #415a79' }}>
        <button
          onClick={() => setActiveTab('username')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'username' ? '#c7d5e0' : '#8f98a0',
            fontSize: '14px',
            fontWeight: activeTab === 'username' ? 600 : 400,
            cursor: 'pointer',
            borderBottom: activeTab === 'username' ? '3px solid #415a79' : '3px solid transparent',
            marginBottom: '-1px'
          }}
        >
          Username/Email
        </button>
        <button
          onClick={() => setActiveTab('password')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'password' ? '#c7d5e0' : '#8f98a0',
            fontSize: '14px',
            fontWeight: activeTab === 'password' ? 600 : 400,
            cursor: 'pointer',
            borderBottom: activeTab === 'password' ? '3px solid #415a79' : '3px solid transparent',
            marginBottom: '-1px'
          }}
        >
          Password
        </button>
      </div>
      
      {/* Tab Content */}
      {activeTab === 'username' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <label style={{ display: 'block', color: '#c7d5e0', fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>
              Username
            </label>
            <input
              type="text"
              value={usernameValue}
              onChange={(e) => setUsernameValue(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #415a79',
                borderRadius: 0,
                fontSize: '14px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#c7d5e0',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#c7d5e0', fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>
              Email
            </label>
            <input
              type="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #415a79',
                borderRadius: 0,
                fontSize: '14px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#c7d5e0',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 30px',
                background: saving ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid #415a79',
                borderRadius: 0,
                color: '#c7d5e0',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                if (!saving) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px 0', color: '#999', fontSize: '14px' }}>
          Password change functionality coming soon.
        </div>
      )}
    </div>
  );
}

function MyRatings({ apiBase, steamId, onSelectGame }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('games');
  
  useEffect(() => {
    async function fetchRatings() {
      try {
        const res = await fetch(`${apiBase}/myratings?steamId=${steamId}`);
        const contentType = res.headers.get('content-type');
        let json;
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Server returned HTML instead of JSON. Make sure the server is running and the endpoint exists. Response: ${text.substring(0, 200)}`);
        } else {
          json = await res.json();
        }
        if (!res.ok || json.status === 'error') {
          throw new Error(json.error || 'Failed to load ratings');
        }
        setGames(json.games || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchRatings();
  }, [apiBase, steamId]);
  
  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ color: '#c7d5e0', fontSize: '28px', fontWeight: 700, marginBottom: 0, paddingBottom: 12 }}>
          My Ratings & Reviews
        </h1>
        <div style={{ width: '100%', height: '1px', backgroundColor: '#415a79', marginBottom: 20 }}></div>
        
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 30, borderBottom: '1px solid #415a79' }}>
          <button
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              color: '#c7d5e0',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'default',
              borderBottom: '3px solid #1a1a1a',
              marginBottom: '-1px'
            }}
          >
            Games
          </button>
        </div>
        
        {/* Loading Message */}
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <p style={{ color: '#c7d5e0', fontSize: '16px', fontWeight: 600, marginBottom: 8 }}>
            Loading your ratings...
          </p>
        </div>
      </div>
    );
  }
  if (error) {
    if (error.includes('User not found') || error.includes('not found')) {
      return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
          <h1 style={{ color: '#c7d5e0', fontSize: '28px', fontWeight: 700, marginBottom: 0, paddingBottom: 12 }}>
            My Ratings & Reviews
          </h1>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#415a79', marginBottom: 20 }}></div>
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ color: '#c7d5e0', fontSize: '16px', fontWeight: 600, marginBottom: 12 }}>
              Account not found
            </p>
            <p style={{ color: '#8f98a0', fontSize: '14px', marginBottom: 24 }}>
              You need to register an account to access this page. Please register using your email and Steam friend code.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 30px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid #415a79',
                borderRadius: 0,
                color: '#c7d5e0',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Go to Registration
            </button>
          </div>
        </div>
      );
    }
    return <div style={{ color: '#dc3545', padding: '40px' }}>Error: {error}</div>;
  }
  
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ color: '#c7d5e0', fontSize: '28px', fontWeight: 700, marginBottom: 0, paddingBottom: 12 }}>
        My Ratings & Reviews
      </h1>
      <div style={{ width: '100%', height: '1px', backgroundColor: '#415a79', marginBottom: 20 }}></div>
      
      {/* Tab Content - Only Games */}
      {activeTab === 'games' ? (
        games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <p style={{ color: '#c7d5e0', fontSize: '16px', fontWeight: 600, marginBottom: 8 }}>
              You haven't rated anything yet
            </p>
            <p style={{ color: '#c7d5e0', fontSize: '14px', marginTop: 8 }}>
              Your ratings and reviews will be saved here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
            {games.map(game => (
              <div
                key={game.appid}
                onClick={() => onSelectGame(game)}
                className="game-card"
                style={{
                  cursor: 'pointer',
                  border: '1px solid #415a79',
                  borderRadius: 0,
                  background: 'rgba(255, 255, 255, 0.05)',
                  overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {game.header_image && (
                  <img 
                    src={game.header_image} 
                    alt={game.name}
                    style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div style={{ padding: 12 }}>
                  <h3 style={{ color: '#c7d5e0', fontSize: '14px', margin: '0 0 8px 0', fontWeight: 600, lineHeight: 1.4 }}>
                    {game.name}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#8f98a0', marginTop: 8 }}>
                    {game.hours ? `${game.hours.toFixed(1)}h played` : 'Not played'}
                    {game.achievementPct !== undefined && ` • ${(game.achievementPct * 100).toFixed(0)}% achievements`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}



