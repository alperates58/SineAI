import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

// Environment Variables
const PORT = process.env.PORT || 3000;
const AI_PROVIDER = process.env.AI_PROVIDER || 'mock';

// TMDB Settings
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'tr-TR';
const TMDB_REGION = process.env.TMDB_REGION || 'TR';

// Cache Settings & Bounded LRU Cache Implementation
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '900', 10);
const AI_RESULT_LIMIT = parseInt(process.env.AI_RESULT_LIMIT || '40', 10);
const AI_CANDIDATE_LIMIT = Math.max(AI_RESULT_LIMIT * 2, 80);
const DISCOVER_PAGES_PER_STRATEGY = parseInt(process.env.DISCOVER_PAGES_PER_STRATEGY || '3', 10);

class BoundedCache {
  constructor(maxItems = 1000, defaultTTL = CACHE_TTL_SECONDS) {
    this.maxItems = maxItems;
    this.defaultTTL = defaultTTL;
    this.cache = new Map();
  }
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expires <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  set(key, data, ttlSeconds = this.defaultTTL) {
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, expires: Date.now() + (ttlSeconds * 1000) });
  }
}

const cache = new BoundedCache(1000, CACHE_TTL_SECONDS);
const itemDetailCache = new BoundedCache(2000, 86400); // 24-hour TTL for TMDB movie/TV details

function getFromCache(key) {
  return cache.get(key);
}

function setCache(key, data, ttlSeconds = CACHE_TTL_SECONDS) {
  cache.set(key, data, ttlSeconds);
}

// User Persistence Store
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) {
    fastify.log.error('Users load error:', e);
  }
  return {};
}

function saveUsers(usersData) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2), 'utf8');
  } catch (e) {
    fastify.log.error('Users save error:', e);
  }
}

// Default Mock Fallback Normalize
const FALLBACK_NORMALIZE = {
  intent: "discover",
  reference_title: "",
  type: "any",
  genres: [],
  mood: "",
  year_min: null,
  year_max: null,
  language: "any",
  keywords: [],
  semantic_topics: [],
  must_have: [],
  nice_to_have: [],
  exclude: [],
  actors: [],
  directors: [],
  min_vote_average: null,
  min_vote_count: null,
  runtime_min: null,
  runtime_max: null,
  watch_provider: "",
  country: "",
  quality_profile: "mainstream",
  sort_by: "popularity",
  trailer_required: false
};

// Setup Static Files
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/', 
});

// Prompt Generation with Enhanced Niche / Setting Understanding
const SYSTEM_PROMPT = `Sen SineAI sinema ve dizi öneri asistanısın. Kullanıcının isteğini derinlemesine analiz et ve sadece aşağıdaki JSON formatında çıktı ver.

Kurallar:
- Kullanıcı herhangi bir film veya dizi belirttiğinde (ör: "Kurtlar Vadisi benzeri", "Inception gibi", "Game of Thrones tarzı", "The Office benzeri", "Breaking Bad gibi", "Shrek tarzı", "Dark benzeri"), o yapımın alt türünü, atmosferini, kültürel mirasını ve tonunu KUSURSUZ kavra.
- "recommended_titles" dizisine istek ile GERÇEKTEN birebir tematik/sinematik uyum sağlayan 8-10 adet spesifik yapım adı (title) ve kısa Türkçe öneri nedeni (reason) ekle. Örneğin mafya/suç dizisi istendiyse Ezel, Sıfır Bir, The Sopranos, Peaky Blinders, Gomorrah gibi mafya yapımlarını öner; çizgi film (Uğur Böceği vb.) veya medikal drama (Grey's Anatomy vb.) KESİNLİKLE ÖNERME.
- Kullanıcı mekan, mekan atmosferi (ör: "okyanus", "deniz", "gemi", "uzay", "ıssız ada", "dağ", "okul", "hapishane") belirttiğinde bunları must_have ve semantic_topics dizilerine ekle (ör: "ocean", "sea", "romance", "ship").
- Kullanıcı "X benzeri", "X gibi", "X tarzı", "X'e benzeyen", "X ayarında" derse intent mutlaka "similar_to_title" olsun ve reference_title alanına X yaz.
- "X oynadığı", "X'in filmleri", "X yönettiği" gibi isteklerde actors veya directors alanlarını doldur.
- "az bilinen", "gizli cevher", "bağımsız" derse quality_profile "hidden_gems" olsun.
- "yeni çıkan" derse quality_profile "new" olsun.
- "klasik" derse quality_profile "classic" olsun.
- "aile", "çocuk" derse quality_profile "family" olsun.
- Tematik istekleri semantic_topics, must_have ve nice_to_have alanlarına dağıt. En kritik temalar must_have içinde olsun.
- Tarih isteklerini year_min ve year_max alanlarına çevir.
{
  "intent": "discover" | "similar_to_title" | "person_search",
  "reference_title": "",
  "recommended_titles": [
    { "title": "Film/Dizi Adı", "reason": "Türkçe kısa açıklama" }
  ],
  "type": "movie|tv|any",
  "genres": [],
  "mood": "",
  "year_min": null,
  "year_max": null,
  "language": "tr|en|any",
  "keywords": [],
  "semantic_topics": [],
  "must_have": [],
  "nice_to_have": [],
  "exclude": [],
  "actors": [],
  "directors": [],
  "min_vote_average": null,
  "min_vote_count": null,
  "runtime_min": null,
  "runtime_max": null,
  "watch_provider": "",
  "country": "",
  "sort_by": "relevance|popularity|vote_average|release_date",
  "trailer_required": false
}`;

async function callMockAI(query) {
  const q = query.toLowerCase();
  const normalized = { ...FALLBACK_NORMALIZE };

  const similarPattern = /(.+?)\s+(benzeri|gibi|tarzı|benzeyen|ayarında)\s+(dizi|film)?/i;
  const similarMatch = q.match(similarPattern);

  if (q.includes('the room')) {
    normalized.intent = 'similar_to_title';
    normalized.reference_title = 'The Room';
    normalized.recommended_titles = [
      { title: 'The Disaster Artist', reason: "Tommy Wiseau'nun 'The Room' filminin çekim sürecini ve absürt macerasını anlatan harika komedi" },
      { title: 'Troll 2', reason: "'The Room' gibi sinema tarihinin en ünlü 'o kadar kötü ki harika' kült yapımı" },
      { title: 'Plan 9 from Outer Space', reason: "Sinema tarihinin unutulmaz absürt kült klasikleri arasında" },
      { title: 'Room', reason: "Tek odada geçen sürükleyici ve duygusal psikolojik dram" },
      { title: 'Exam', reason: "Kapalı tek mekanda geçen akıl oyunları ve gerilim" },
      { title: '10 Cloverfield Lane', reason: "Yeraltı sığınağında geçen klostrofobik ve gizemli gerilim" }
    ];
  } else if (q.includes('kurtlar vadisi')) {
    normalized.intent = 'similar_to_title';
    normalized.reference_title = 'Kurtlar Vadisi';
    normalized.type = 'tv';
    normalized.recommended_titles = [
      { title: 'Ezel', reason: "İntikam, mafya ve derin devlet hesaplaşmalarını anlatan efsanevi Türk draması" },
      { title: 'Sıfır Bir', reason: "Sokak mafyası ve çete çatışmalarını gerçeğe yakın tonda işleyen aksiyon dizisi" },
      { title: 'Çukur', reason: "Mahalle, aile ve mafya ilişkilerini aksiyonla birleştiren kült yapım" },
      { title: 'The Sopranos', reason: "Mafya dünyasını ve organize suç ailesini sarsıcı biçimde işleyen başyapıt" },
      { title: 'Peaky Blinders', reason: "Organize suç çetelerinin yükselişini ve liderlik savaşlarını konu alan sürükleyici dizi" },
      { title: 'Poyraz Karayel', reason: "Mafyanın içine sızan eski bir polisin aksiyon ve mafya dolu mücadelesi" },
      { title: 'Gomorrah', reason: "İtalyan mafyası ve karanlık suç dünyasını tüm gerçekçiliğiyle anlatan efsane dizi" },
      { title: 'Behzat Ç.', reason: "Ankara polisiye dünyası ve derin suç ilişkilerini konu alan kült yapım" }
    ];
  }
  else if (similarMatch) {
    // Generic fallback: benzeri kal       bulundu, intent'i similar_to_title yap
    const titlePart = similarMatch[1].trim();
    const typePart = similarMatch[3] ? (similarMatch[3].includes('dizi') ? 'tv' : 'movie') : 'any';
    normalized.intent = 'similar_to_title';
    normalized.reference_title = titlePart.charAt(0).toUpperCase() + titlePart.slice(1);
    if (typePart !== 'any') normalized.type = typePart;
  }
  else if (q.includes('yapay zeka')) { normalized.type = 'movie'; normalized.genres = ['science fiction']; normalized.must_have = ['artificial intelligence']; normalized.semantic_topics = ['robot', 'technology']; }
  else if (q.includes('zaman')) { normalized.type = 'movie'; normalized.genres = ['science fiction']; normalized.must_have = ['time travel']; }
  else if (q.includes('uzayda ge     gerilim')) { normalized.type = 'movie'; normalized.genres = ['science fiction', 'thriller']; normalized.must_have = ['space']; }
  else if (q.includes('uzay')) { normalized.genres = ['science fiction']; normalized.must_have = ['space']; }
  else if (q.includes('su     dizisi') && q.includes('karanl   ')) { normalized.type = 'tv'; normalized.genres = ['crime', 'drama']; normalized.must_have = ['crime', 'detective']; normalized.semantic_topics = ['psychological thriller']; }
  else if (q.includes('aileyle izlenecek komedi')) { normalized.type = 'movie'; normalized.genres = ['comedy', 'family']; normalized.quality_profile = 'family'; }
  else if (q.includes('mini dizi')) { normalized.type = 'tv'; normalized.semantic_topics = ['miniseries']; }
  else if (q.includes('nolan')) { normalized.intent = 'person_search'; normalized.directors = ['Christopher Nolan']; normalized.semantic_topics = ['mind bending']; }
  else if (q.includes('true detective')) { normalized.intent = 'similar_to_title'; normalized.reference_title = 'True Detective'; normalized.type = 'tv'; }
  else if (q.includes('tom hardy')) { normalized.intent = 'person_search'; normalized.actors = ['Tom Hardy']; normalized.genres = ['action']; }
  else if (q.includes('90\'lardan')) { normalized.year_min = 1990; normalized.year_max = 1999; normalized.genres = ['crime']; }
  else if (q.includes('gizli cevher')) { normalized.genres = ['animation']; normalized.quality_profile = 'hidden_gems'; }
  else if (q.includes('yeni         zombi')) { normalized.type = 'tv'; normalized.quality_profile = 'new'; normalized.must_have = ['zombie']; }
  else if (q.includes('k    sonras   ')) { normalized.type = 'movie'; normalized.must_have = ['post-apocalyptic', 'survival']; }
  else if (q.includes('tarantino')) { normalized.intent = 'person_search'; normalized.directors = ['Quentin Tarantino']; }
  else if (q.includes('romantik komedi')) { normalized.year_min = 2020; normalized.genres = ['romance', 'comedy']; }
  else if (q.includes('hapishaneden')) { normalized.type = 'movie'; normalized.must_have = ['prison']; }
  else if (q.includes('     evren')) { normalized.type = 'movie'; normalized.must_have = ['multiverse']; }
  else if (q.includes('so    sava   ')) { normalized.type = 'movie'; normalized.must_have = ['spy']; }
  else if (q.includes('hayvanl   ')) { normalized.type = 'movie'; normalized.genres = ['family']; normalized.quality_profile = 'family'; }
  else if (q.includes('coklu evren')) { normalized.type = 'movie'; normalized.must_have = ['multiverse']; }
  else if (q.includes('soguk savas')) { normalized.type = 'movie'; normalized.must_have = ['spy']; }
  else if (q.includes('hayvanli')) { normalized.type = 'movie'; normalized.genres = ['family']; normalized.quality_profile = 'family'; }
  else if (q.includes('donnie yen')) { normalized.actors = ['Donnie Yen']; normalized.must_have = ['martial arts']; }
  else if (q.includes('vampir')) { normalized.type = 'tv'; normalized.must_have = ['vampire']; }
  else if (q.includes('seri katil')) { normalized.type = 'movie'; normalized.must_have = ['serial killer']; normalized.semantic_topics = ['based on a true story']; }
  else if (q.includes('akil hastanesinde')) { normalized.type = 'movie'; normalized.must_have = ['psychological thriller']; }
  else if (q.includes('lisede')) { normalized.type = 'tv'; normalized.must_have = ['high school']; }
  else if (q.includes('uzayli istilasi')) { normalized.type = 'movie'; normalized.must_have = ['alien']; }
  else if (q.includes('doga belgeseli')) { normalized.type = 'tv'; normalized.genres = ['documentary']; }
  else if (q.includes('kizilcal')) { normalized.type = 'tv'; normalized.must_have = ['middle ages']; }
  else if (q.includes('banka soygunu')) { normalized.type = 'movie'; normalized.must_have = ['heist']; }
  else if (q.includes('gerilim dizisi')) { normalized.type = 'tv'; normalized.genres = ['thriller']; normalized.semantic_topics = ['thriller', 'suspense']; }

  return normalized;
}

async function callDeepSeek(query) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: query }], response_format: { type: "json_object" } })
  });
  if (!response.ok) throw new Error(`DeepSeek Error: ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callOpenAI(query) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: query }], response_format: { type: "json_object" } })
  });
  if (!response.ok) throw new Error(`OpenAI Error: ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ parts: [{ text: query }] }], generationConfig: { responseMimeType: "application/json" } })
  });
  if (!response.ok) throw new Error(`Gemini Error: ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

async function normalizeQuery(query) {
  const safeQuery = query.substring(0, 500);
  try {
    let normalized;
    if (AI_PROVIDER === 'deepseek') normalized = await callDeepSeek(safeQuery);
    else if (AI_PROVIDER === 'openai') normalized = await callOpenAI(safeQuery);
    else if (AI_PROVIDER === 'gemini') normalized = await callGemini(safeQuery);
    else normalized = await callMockAI(safeQuery);
    return applyQueryHeuristics(normalized, safeQuery);
  } catch (error) {
    fastify.log.error(`AI Provider error:`, error);
    const fallback = await callMockAI(safeQuery);
    return applyQueryHeuristics(fallback, safeQuery);
  }
}

// Genre & Keyword Maps
const MOVIE_GENRES = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749,
  "science fiction": 878, "sci-fi": 878, thriller: 53, war: 10752, western: 37
};

const TV_GENRES = {
  action: 10759, adventure: 10759, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, kids: 10762, mystery: 9648,
  news: 10763, reality: 10764, "science fiction": 10765, "sci-fi": 10765,
  fantasy: 10765, soap: 10766, talk: 10767, war: 10768, politics: 10768, western: 37,
  thriller: 9648, horror: 9648, romance: 18 // Fallbacks for TV where these genres don't officially exist
};

const TMDB_GENRE_NAMES = {
  28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi", 80: "Suç",
  99: "Belgesel", 18: "Dram", 10751: "Aile", 14: "Fantastik", 36: "Tarih",
  27: "Korku", 10402: "Müzik", 9648: "Gizem", 10749: "Romantik",
  878: "Bilim Kurgu", 53: "Gerilim", 10752: "Savaş", 37: "Vahşi Batı",
  10759: "Aksiyon/Macera", 10762: "Çocuk", 10763: "Haber", 10764: "Reality",
  10765: "Bilim Kurgu", 10766: "Pembe Dizi", 10767: "Talk Show", 10768: "Politika"
};

const KEYWORD_ALIASES = {
  "ai": "artificial intelligence", "thought-provoking": "philosophy", "philosophical": "philosophy",
  "complex": "mind bending", "single location": "single location", "single setting": "contained thriller",
  "class conflict": "social commentary", "ambition": "obsession", "suspense": "suspense",
  "yapay zeka": "artificial intelligence", "robot": "robot", "android": "android",
  "zaman yolculu   ": "time travel", "zamanda yolculuk": "time travel", "zaman d            ": "time loop",
  "paralel evren": "parallel universe", "     evren": "multiverse", "alternatif zaman     ": "alternate timeline",
  "uzay": "space", "uzay yolculu   ": "space travel", "astronot": "astronaut", "mars": "mars", "uzayl   ": "alien",
  "distopya": "dystopia", "k   ": "apocalypse", "k    sonras   ": "post-apocalyptic", "hayatta kalma": "survival",
  "seri katil": "serial killer", "dedektif": "detective", "mafya": "mafia", "uyu   ": "drug cartel",
  "siberpunk": "cyberpunk", "vampir": "vampire", "zombi": "zombie", "b        ": "magic", "cad   ": "witch",
  "do           ": "supernatural", "kafa yakan": "mind bending", "psikolojik": "psychological thriller",
  "hapishane": "prison", "soygun": "heist", "casus": "spy", "politik": "politics",
  "aile": "family", "    ": "children", "romantik": "romance", "komik": "comedy", "e   ": "fun",
  "d           ": "martial arts", "d            sanatlar   ": "martial arts", "samuray": "samurai", "ninja": "ninja",
  "biyografi": "biography", "ger     hikaye": "based on a true story", "tarihi": "history", "orta        ": "middle ages",
  "anime": "anime", "spor": "sports", "futbol": "football", "basketbol": "basketball", "yar      ": "racing",
  "gerilim": "thriller", "korku": "horror", "gizem": "mystery", "aksiyon": "action",
  "a   ": "romance", "duygusal": "emotional", "dram": "drama", "su    ": "crime"
};

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ");
}

function toSearchText(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function addUniqueStrings(target, values) {
  const existing = new Set((target || []).map(v => String(v).toLowerCase()));
  const merged = [...(target || [])];
  for (const value of values || []) {
    if (!value) continue;
    const lower = String(value).toLowerCase();
    if (!existing.has(lower)) {
      existing.add(lower);
      merged.push(value);
    }
  }
  return merged;
}

function inferGenresFromQuery(query) {
  const q = toSearchText(query);
  const genres = [];
  const push = (genre) => { if (!genres.includes(genre)) genres.push(genre); };

  if (/\bkomedi\b/.test(q)) push('comedy');
  if (/\bdram\b/.test(q)) push('drama');
  if (/bilim kurgu|sci fi|science fiction/.test(q)) push('science fiction');
  if (/\baksiyon\b/.test(q)) push('action');
  if (/\bsuc\b|\bmafya\b/.test(q)) push('crime');
  if (/gerilim|thriller/.test(q)) push('thriller');
  if (/korku|horror/.test(q)) push('horror');
  if (/gizem|mystery|dedektif/.test(q)) push('mystery');
  if (/romantik|ask|romance/.test(q)) push('romance');
  if (/animasyon|anime/.test(q)) push('animation');
  if (/belgesel|documentary/.test(q)) push('documentary');
  if (/fantastik|fantasy/.test(q)) push('fantasy');
  if (/aile|cocuk/.test(q)) push('family');

  return genres;
}

function applyQueryHeuristics(normalizedInput, query) {
  const normalized = { ...FALLBACK_NORMALIZE, ...(normalizedInput || {}) };
  const q = toSearchText(query);
  const inferredGenres = inferGenresFromQuery(query);

  normalized.genres = addUniqueStrings(normalized.genres, inferredGenres);

  if (/\bkomedi\b/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['comedy']);
  }

  if (/\bmini dizi|minidizi\b/.test(q)) {
    normalized.type = 'tv';
    normalized.must_have = addUniqueStrings(normalized.must_have, ['miniseries']);
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['limited series', 'miniseries']);
  }

  if ((/\bdizi|diziler|sezon\b/.test(q)) && normalized.type === 'any') normalized.type = 'tv';
  if ((/\bfilm|filmler|sinemasi\b/.test(q)) && normalized.type === 'any') normalized.type = 'movie';

  if (/netflix/.test(q)) normalized.watch_provider = normalized.watch_provider || 'Netflix';
  if (/oscar/.test(q)) {
    normalized.sort_by = normalized.sort_by === 'relevance' ? 'vote_average' : normalized.sort_by;
    normalized.min_vote_average = Math.max(normalized.min_vote_average || 0, 7);
    normalized.min_vote_count = Math.max(normalized.min_vote_count || 0, 500);
  }

  if (/tek mekan|tek mekanda|tek ortam|single location|single setting/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['single location']);
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['single setting', 'claustrophobic']);
  }

  if (/yapay zeka/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['artificial intelligence']);
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['technology', 'thought-provoking']);
    normalized.type = normalized.type === 'any' ? 'movie' : normalized.type;
  }

  if (/aksiyondan cok|fikir veren|dusunduren/.test(q)) {
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['philosophical']);
  }

  if (/beyin yakan|akil oyunu|ters kose|tokat gibi final|plot twist/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['mind bending', 'plot twist']);
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['mind-bending', 'twist']);
  }

  if (/zamanla oynayan|zaman yolculugu|zaman dongusu|paradoks/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['time travel']);
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['time loop', 'alternate timeline']);
  }

  if (/sinif catismasi|class conflict/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['class conflict']);
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['social inequality']);
  }

  if (/hirs|takinti/.test(q)) {
    normalized.must_have = addUniqueStrings(normalized.must_have, ['ambition', 'obsession']);
  }

  if (/kisa ve surukleyici/.test(q)) {
    normalized.semantic_topics = addUniqueStrings(normalized.semantic_topics, ['fast-paced']);
  }

  if (/ailece|cocuklarla/.test(q)) normalized.quality_profile = 'family';
  if (/yeni cikan/.test(q)) normalized.quality_profile = 'new';

  return normalized;
}

function parseReleaseYear(releaseDate) {
  if (!releaseDate || typeof releaseDate !== 'string' || releaseDate.length < 4) return null;
  const year = parseInt(releaseDate.substring(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function isFutureRelease(releaseDate) {
  if (!releaseDate) return false;
  const time = Date.parse(releaseDate);
  return Number.isFinite(time) && time > Date.now();
}

function countGenreOverlap(itemGenreIds = [], targetGenreIds = []) {
  if (!itemGenreIds.length || !targetGenreIds.length) return 0;
  return itemGenreIds.filter(id => targetGenreIds.includes(id)).length;
}

let movieProvidersMap = null;
let tvProvidersMap = null;

async function getProviderId(providerName, type) {
  if (!providerName) return null;
  const nameNorm = providerName.toLowerCase().replace(/\s+/g, '');
  
  if (type === 'movie' || type === 'any') {
    if (!movieProvidersMap) {
      try {
        const url = new URL(`${TMDB_BASE_URL}/watch/providers/movie?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&watch_region=TR`);
        const res = await fetch(url.toString());
        if (res.ok) { const data = await res.json(); movieProvidersMap = data.results || []; }
      } catch (err) {}
    }
    const found = (movieProvidersMap || []).find(p => p.provider_name.toLowerCase().replace(/\s+/g, '').includes(nameNorm));
    if (found) return found.provider_id;
  }
  
  if (type === 'tv' || type === 'any') {
    if (!tvProvidersMap) {
      try {
        const url = new URL(`${TMDB_BASE_URL}/watch/providers/tv?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&watch_region=TR`);
        const res = await fetch(url.toString());
        if (res.ok) { const data = await res.json(); tvProvidersMap = data.results || []; }
      } catch (err) {}
    }
    const found = (tvProvidersMap || []).find(p => p.provider_name.toLowerCase().replace(/\s+/g, '').includes(nameNorm));
    if (found) return found.provider_id;
  }
  return null;
}

async function searchPersonTMDB(name) {
  const url = new URL(`${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&query=${encodeURIComponent(name)}`);
  try {
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) return data.results[0];
    }
  } catch (err) {}
  return null;
}

let keywordCache = new Map();
async function getKeywordIds(keywords) {
  const ids = [];
  const resolvedNames = [];
  if (!keywords || !Array.isArray(keywords)) return { ids, resolvedNames };

  for (let kw of keywords) {
    const original = kw.toLowerCase().trim();
    const query = KEYWORD_ALIASES[original] || original;

    if (keywordCache.has(query)) {
      ids.push(keywordCache.get(query));
      resolvedNames.push(original);
      continue;
    }

    try {
      const url = new URL(`${TMDB_BASE_URL}/search/keyword?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        let best = data.results.find(k => k.name.toLowerCase() === query);
        if (!best && data.results.length > 0) best = data.results[0];
        if (best) {
          keywordCache.set(query, best.id);
          ids.push(best.id);
          resolvedNames.push(original);
        }
      }
    } catch (e) {}
  }
  return { ids, resolvedNames };
}

async function getItemKeywords(id, type) {
  const cacheKey = `item_kw_${type}_${id}`;
  if (keywordCache.has(cacheKey)) return keywordCache.get(cacheKey);
  
  try {
    const url = new URL(`${TMDB_BASE_URL}/${type}/${id}/keywords?api_key=${TMDB_API_KEY}`);
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      const kws = (data.keywords || data.results || []).map(k => k.id);
      keywordCache.set(cacheKey, kws);
      return kws;
    }
  } catch (err) {}
  return [];
}

async function searchTMDB(title, type) {
  const typesToSearch = type === 'any' ? ['movie', 'tv'] : [type];
  let bestMatch = null;
  let bestScore = -1;
  const queryNorm = normalizeTitle(title);

  // Hem yerel dil hem en-US aran    ayn    film farkl    dilde daha y     skor alabilir (     "Exit 8" tr-TR'de "              8")
  // Her film i     diller aras    MAX skor tutulur
  for (const t of typesToSearch) {
    const candidateMap = new Map(); // id -> {score, matchData}

    const langs = [TMDB_LANGUAGE, 'en-US'];
    for (const lang of langs) {
      try {
        const url = new URL(`${TMDB_BASE_URL}/search/${t}?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(title)}`);
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          for (const match of (data.results || [])) {
            let score = 0;
            const matchTitle = t === 'movie' ? match.title : match.name;
            const matchOriginalTitle = t === 'movie' ? match.original_title : match.original_name;

            const tNorm = normalizeTitle(matchTitle);
            const otNorm = normalizeTitle(matchOriginalTitle);

            if (tNorm.includes('making of') || tNorm.includes('behind the scenes') || tNorm.includes('interview') || tNorm.includes('special')) continue;

            if (tNorm === queryNorm) score += 50000;
            else if (otNorm === queryNorm) score += 40000;
            // startsWith yaln    tam kelime s          ge    : "exit 8 something"     , "exit 8a"     
            else if (tNorm.startsWith(queryNorm) && (tNorm.length === queryNorm.length || tNorm[queryNorm.length] === ' ')) score += 5000;
            else if (otNorm.startsWith(queryNorm) && (otNorm.length === queryNorm.length || otNorm[queryNorm.length] === ' ')) score += 4000;
            else if (tNorm.includes(queryNorm)) score += 1000;
            else if (otNorm.includes(queryNorm)) score += 800;

            score += (match.popularity || 0) * 0.1;
            score += (match.vote_count || 0) * 5;

            if (match.genre_ids && match.genre_ids.includes(99)) score -= 10000;

            const existing = candidateMap.get(match.id);
            // Ayn    film i     en y     skoru ve o skora kar          gelen ba             sakla
            if (!existing || score > existing.score) {
              candidateMap.set(match.id, {
                score,
                data: { id: match.id, type: t, title: matchTitle, genre_ids: match.genre_ids || [], vote_count: match.vote_count || 0, popularity: match.popularity || 0 }
              });
            }
          }
        }
      } catch (err) {}
    }

    // Bu t     i     en iyi aday    global bestMatch ile kar            
    for (const { score, data } of candidateMap.values()) {
      if (score > bestScore) {
        bestScore = score;
        bestMatch = data;
      }
    }
  }

  if (bestMatch) {
    try {
      const res = await fetch(`${TMDB_BASE_URL}/${bestMatch.type}/${bestMatch.id}?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}`);
      if (res.ok) {
        const dData = await res.json();
        bestMatch.genre_ids = (dData.genres || []).map(g => g.id);
        bestMatch.original_language = dData.original_language || null;
      }
    } catch(err) {}
  }
  return bestMatch;
}

// Complex Final Scoring and Enrichment Pipeline
async function fetchSimilarTMDB(reference, normalized) {
  const results = [];
  const endpoints = ['recommendations', 'similar'];
  for (const ep of endpoints) {
    for (let page = 1; page <= 2; page++) {
      try {
        const url = new URL(`${TMDB_BASE_URL}/${reference.type}/${reference.id}/${ep}?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&page=${page}`);
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          results.push(...(data.results || []).map(i => ({ ...i, type: reference.type, strategy: page === 1 ? 'strict' : 'relaxed' })));
        }
      } catch (err) {}
    }
  }
  return results;
}

async function fetchReferenceDiscoverTMDB(reference, normalized, providerId = null) {
  const results = [];
  const referenceKeywordIds = await getItemKeywords(reference.id, reference.type);
  const genreSeed = (reference.genre_ids || []).slice(0, 3);
  const keywordSeed = referenceKeywordIds.slice(0, 4);

  for (let page = 1; page <= 2; page++) {
    try {
      const url = new URL(`${TMDB_BASE_URL}/discover/${reference.type}`);
      url.searchParams.append('api_key', TMDB_API_KEY);
      url.searchParams.append('language', TMDB_LANGUAGE);
      url.searchParams.append('region', TMDB_REGION);
      url.searchParams.append('sort_by', page === 1 ? 'vote_average.desc' : 'popularity.desc');
      url.searchParams.append('vote_count.gte', normalized.quality_profile === 'hidden_gems' ? '50' : '150');
      url.searchParams.append('vote_average.gte', normalized.quality_profile === 'hidden_gems' ? '6' : '6.5');
      url.searchParams.append('page', page);

      if (genreSeed.length > 0) url.searchParams.append('with_genres', genreSeed.join(','));
      if (keywordSeed.length > 0) url.searchParams.append('with_keywords', keywordSeed.join('|'));
      if (providerId) {
        url.searchParams.append('with_watch_providers', providerId);
        url.searchParams.append('watch_region', 'TR');
      }
      if (reference.original_language && reference.original_language !== 'en') {
        url.searchParams.append('with_original_language', reference.original_language);
      }

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.push(...(data.results || []).map(i => ({ ...i, type: reference.type, strategy: 'reference_discover' })));
      }
    } catch (err) {}
  }
  return results;
}

async function enrichResults(results, normalized, reference) {
  const enrichPromises = results.map(async (item) => {
    // Advanced Reason
    if (item.custom_reason) {
      item.reason = item.custom_reason;
    } else if (normalized.intent === 'similar_to_title' && reference) {
      const refIds = reference.genre_ids || [];
      const itemIds = item.genre_ids || [];
      const intersection = itemIds.filter(id => refIds.includes(id));
      if (intersection.length > 0) {
        const genreNames = intersection.slice(0, 2).map(id => TMDB_GENRE_NAMES[id]).filter(Boolean);
        item.reason = genreNames.length > 0 ? `"${reference.title}" ile ortak ${genreNames.join('/')} temas\u0131 ta\u015f\u0131yor` : `"${reference.title}" ile benzer bir atmosfere sahip`;
      } else {
        item.reason = `"${reference.title}" ile benzer tarzda bir yap\u0131m`;
      }
    } else if (normalized.intent === 'person_search' && normalized.actors && normalized.actors.length > 0) {
      item.reason = `"${normalized.actors[0]}" yer al\u0131yor`;
    } else if (normalized.intent === 'person_search' && normalized.directors && normalized.directors.length > 0) {
      item.reason = `"${normalized.directors[0]}" y\u00f6netti`;
    } else {
       // Search Plan Reasons
       let reasonParts = [];
       if (normalized.resolved_must_have && normalized.resolved_must_have.length > 0) {
           reasonParts.push(`${normalized.resolved_must_have.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ve ')} temas\u0131n\u0131 merkeze alan`);
       } else if (normalized.resolved_semantic && normalized.resolved_semantic.length > 0) {
           reasonParts.push(`${normalized.resolved_semantic.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} temalar\u0131na sahip`);
       }

       let genreStr = "";
       if (normalized.genres && normalized.genres.length > 0) {
           const map = item.type === 'movie' ? MOVIE_GENRES : TV_GENRES;
           const validGenres = normalized.genres.map(g => {
              const lower = g.toLowerCase();
              return map[lower] ? lower.charAt(0).toUpperCase() + lower.slice(1) : null;
           }).filter(Boolean);
           if (validGenres.length > 0) genreStr = validGenres.join('-');
       }

       if (reasonParts.length > 0) {
           item.reason = `${reasonParts.join(' ')} ba\u015far\u0131l\u0131 bir ${genreStr ? genreStr : (item.type === 'movie' ? 'film' : 'dizi')} \u00f6nerisi`;
       } else {
           item.reason = `\u0130ste\u011finize uygun pop\u00fcler bir \u00f6neri`;
       }
    }

    item.providers = [];
    item.trailer_url = null;
    item.original_title = item.title;
    item.genres = [];
    item.runtime = null;
    item.director = null;
    item.number_of_seasons = null;
    
    try {
      const url = new URL(`${TMDB_BASE_URL}/${item.type}/${item.id}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=watch/providers,videos,credits`);
      const res = await fetch(url.toString());
      if (res.ok) {
        const d = await res.json();
        item.original_title = item.type === 'movie' ? d.original_title : d.original_name;
        item.genres = (d.genres || []).map(g => g.name);
        
        if (item.type === 'movie') {
           item.runtime = d.runtime;
           const director = (d.credits?.crew || []).find(c => c.job === 'Director');
           if (director) item.director = director.name;
        } else {
           item.runtime = d.episode_run_time && d.episode_run_time.length > 0 ? d.episode_run_time[0] : null;
           item.number_of_seasons = d.number_of_seasons || null;
           const creator = (d.created_by && d.created_by.length > 0) ? d.created_by[0].name : null;
           if (creator) item.director = creator;
           else {
               const director = (d.credits?.crew || []).find(c => c.job === 'Director' || c.department === 'Directing');
               if (director) item.director = director.name;
           }
        }
        
        if (d.overview && d.overview.length > (item.overview || '').length) item.overview = d.overview;

        const trData = d['watch/providers']?.results?.['TR'];
        if (trData) {
          const tempProviders = [];
          if (trData.flatrate) trData.flatrate.forEach(p => tempProviders.push({...p, type: 'flatrate'}));
          if (trData.rent) trData.rent.forEach(p => tempProviders.push({...p, type: 'rent'}));
          if (trData.buy) trData.buy.forEach(p => tempProviders.push({...p, type: 'buy'}));
          const seen = new Set();
          for (const p of tempProviders) {
            if (!seen.has(p.provider_id)) {
              seen.add(p.provider_id);
              item.providers.push({ provider_name: p.provider_name, logo_path: p.logo_path, type: p.type });
            }
          }
        }

        const trVideos = d.videos?.results || [];
        let selectedTrailer = trVideos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official) 
                           || trVideos.find(v => v.type === 'Trailer' && v.site === 'YouTube')
                           || trVideos.find(v => v.site === 'YouTube');
        if (selectedTrailer) item.trailer_url = `https://www.youtube.com/watch?v=${selectedTrailer.key}`;
      }
    } catch (err) {}
    
    if (!item.trailer_url) {
      try {
        const vUrl = new URL(`${TMDB_BASE_URL}/${item.type}/${item.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`);
        const vRes = await fetch(vUrl.toString());
        if (vRes.ok) {
           const vData = await vRes.json();
           const enVideos = vData.results || [];
           let selectedTrailer = enVideos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official) 
                              || enVideos.find(v => v.type === 'Trailer' && v.site === 'YouTube')
                              || enVideos.find(v => v.site === 'YouTube');
           if (selectedTrailer) item.trailer_url = `https://www.youtube.com/watch?v=${selectedTrailer.key}`;
        }
      } catch (err) {}
    }
    return item;
  });
  
  return Promise.all(enrichPromises);
}

// MAIN TMDB WORKFLOW
async function fetchTMDB(normalized, originalQuery) {
  if (!TMDB_API_KEY) {
    return {
      reference: null, people: [], warnings: ["TMDB API key yok."],
      results: [{ id: 1, type: normalized.type || 'movie', title: "Mock Film", overview: "Test.", poster: null, vote_average: 8.5, vote_count: 100, popularity: 50, providers: [], trailer_url: null, reason: "Mock" }]
    };
  }

  if (normalized.reference_title && originalQuery) {
    const q = originalQuery.toLowerCase();
    if (/benzeri|gibi|tarz\u0131|benzeyen|ayar\u0131nda/.test(q)) {
      normalized.intent = 'similar_to_title';
    }
  }

  let reference = null;
  let people = [];
  let warnings = [];
  let rawResults = [];
  const types = normalized.type === 'any' ? ['movie', 'tv'] : [normalized.type];
  const queryGenresByType = {};

  for (const type of types) {
    const map = type === 'movie' ? MOVIE_GENRES : TV_GENRES;
    queryGenresByType[type] = Array.from(new Set(
      (normalized.genres || [])
        .map(g => String(g).toLowerCase())
        .map(g => map[g])
        .filter(id => id !== undefined)
    ));
  }

  // Process direct AI title recommendations
  if (normalized.recommended_titles && Array.isArray(normalized.recommended_titles) && normalized.recommended_titles.length > 0) {
    for (const recItem of normalized.recommended_titles) {
      const recTitle = typeof recItem === 'string' ? recItem : recItem.title;
      const recReason = typeof recItem === 'object' ? recItem.reason : null;
      if (recTitle) {
        try {
          const match = await searchTMDB(recTitle, normalized.type || 'any');
          if (match) {
            if (recReason) match.custom_reason = recReason;
            match.strategy = 'ai_direct_recommendation';
            rawResults.push(match);
          }
        } catch (err) {}
      }
    }
  }

  if (normalized.intent === 'similar_to_title' && normalized.reference_title) {
    reference = await searchTMDB(normalized.reference_title, normalized.type || 'any');
    if (reference) {
      rawResults = await fetchSimilarTMDB(reference, normalized);
      rawResults.push(...await fetchReferenceDiscoverTMDB(reference, normalized));

      if (reference.original_language && reference.original_language !== 'en') {
        try {
          const suppUrl = new URL(`${TMDB_BASE_URL}/discover/${reference.type}`);
          suppUrl.searchParams.append('api_key', TMDB_API_KEY);
          suppUrl.searchParams.append('language', TMDB_LANGUAGE);
          suppUrl.searchParams.append('sort_by', 'popularity.desc');
          suppUrl.searchParams.append('with_original_language', reference.original_language);
          if (reference.genre_ids?.length > 0) {
            suppUrl.searchParams.append('with_genres', reference.genre_ids.slice(0, 2).join(','));
          }
          suppUrl.searchParams.append('vote_count.gte', 50);
          const suppRes = await fetch(suppUrl.toString());
          if (suppRes.ok) {
            const suppData = await suppRes.json();
            rawResults.push(...(suppData.results || []).map(i => ({ ...i, type: reference.type, strategy: 'language_supplement' })));
          }
        } catch (err) {}
      }
    } else {
      const refLabel = reference ? `"${reference.title}" (${reference.vote_count} oy)` : `"${normalized.reference_title}"`;
      warnings.push(`${refLabel} i\u00e7in yeterli e\u015fle\u015fme bulunamad\u0131, tema bazl\u0131 arama yap\u0131l\u0131yor.`);
      reference = null;
      normalized.intent = 'discover';
    }
  }

  let providerId = null;
  if (normalized.watch_provider) {
    providerId = await getProviderId(normalized.watch_provider, normalized.type || 'any');
    if (!providerId) warnings.push(`'${normalized.watch_provider}' platformu bulunamad\u0131.`);
  }

  if (reference && normalized.intent === 'similar_to_title') {
    rawResults.push(...await fetchReferenceDiscoverTMDB(reference, normalized, providerId));
  }

  let personId = null;
  const personName = (normalized.actors && normalized.actors[0]) || (normalized.directors && normalized.directors[0]);
  if (personName) {
    const person = await searchPersonTMDB(personName);
    if (person) {
      personId = person.id;
      people.push({ id: person.id, name: person.name, role: normalized.actors?.length > 0 ? 'actor' : 'director' });
    } else {
      warnings.push(`'${personName}' isminde ki\u015fi bulunamad\u0131.`);
    }
  }

  if (personId) {
    const role = normalized.directors?.length > 0 ? 'director' : 'actor';
    for (const type of types) {
      const endpoint = type === 'movie' ? 'movie_credits' : 'tv_credits';
      try {
        const res = await fetch(`${TMDB_BASE_URL}/person/${personId}/${endpoint}?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}`);
        if (res.ok) {
          const data = await res.json();
          const credits = role === 'director'
            ? (data.crew || []).filter(c => c.job === 'Director')
            : (data.cast || []);
          rawResults.push(...credits.map(c => ({ ...c, type, strategy: 'strict' })));
        }
      } catch (err) {}
    }
  }

  const shouldRunDiscover = !personId && normalized.intent === 'discover' && rawResults.length < 10;

  if (shouldRunDiscover) {
    const kwMustHave = await getKeywordIds(normalized.must_have);
    const kwSemantic = await getKeywordIds(normalized.semantic_topics);
    const kwLegacy = await getKeywordIds(normalized.keywords);

    normalized.resolved_must_have = kwMustHave.resolvedNames;
    normalized.resolved_semantic = kwSemantic.resolvedNames;

    const strictIds = Array.from(new Set([...kwMustHave.ids]));
    const relaxedIds = Array.from(new Set([...kwMustHave.ids, ...kwSemantic.ids, ...kwLegacy.ids]));

    for (const type of types) {
      const fetchDiscover = async (keywordIds, strategy) => {
        for (let page = 1; page <= DISCOVER_PAGES_PER_STRATEGY; page++) {
          const url = new URL(`${TMDB_BASE_URL}/discover/${type}`);
          url.searchParams.append('api_key', TMDB_API_KEY);
          url.searchParams.append('language', TMDB_LANGUAGE);
          url.searchParams.append('region', TMDB_REGION);
          url.searchParams.append('page', page);

          if (normalized.sort_by === 'release_date') url.searchParams.append('sort_by', type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc');
          else if (normalized.sort_by === 'vote_average') url.searchParams.append('sort_by', 'vote_average.desc');
          else url.searchParams.append('sort_by', page === 1 ? 'popularity.desc' : 'vote_average.desc');

          if (normalized.year_min) {
            if (type === 'movie') url.searchParams.append('primary_release_date.gte', `${normalized.year_min}-01-01`);
            else url.searchParams.append('first_air_date.gte', `${normalized.year_min}-01-01`);
          }
          if (normalized.year_max) {
            if (type === 'movie') url.searchParams.append('primary_release_date.lte', `${normalized.year_max}-12-31`);
            else url.searchParams.append('first_air_date.lte', `${normalized.year_max}-12-31`);
          }

          if (providerId) {
            url.searchParams.append('with_watch_providers', providerId);
            url.searchParams.append('watch_region', 'TR');
          }

          if (queryGenresByType[type].length > 0) {
            url.searchParams.append('with_genres', queryGenresByType[type].join(','));
          }

          if (keywordIds.length > 0) {
            url.searchParams.append('with_keywords', keywordIds.join('|'));
          }

          let minVoteCount = 100;
          let minVoteAvg = 5.0;
          if (normalized.quality_profile === 'hidden_gems') {
            minVoteCount = type === 'movie' ? 30 : 20;
            minVoteAvg = 6.0;
            url.searchParams.append('vote_count.lte', 1500);
          } else if (normalized.quality_profile === 'mainstream') {
            minVoteCount = type === 'movie' ? 300 : 120;
            minVoteAvg = 5.8;
          } else if (normalized.quality_profile === 'new') {
            minVoteCount = 10;
            minVoteAvg = 5.0;
          }

          if (normalized.min_vote_count) minVoteCount = normalized.min_vote_count;
          if (normalized.min_vote_average) minVoteAvg = normalized.min_vote_average;

          url.searchParams.append('vote_count.gte', minVoteCount);
          url.searchParams.append('vote_average.gte', minVoteAvg);

          try {
            const res = await fetch(url.toString());
            if (res.ok) {
              const data = await res.json();
              rawResults.push(...(data.results || []).map(i => ({ ...i, type, strategy })));
            }
          } catch (err) {}
        }
      };

      const promises = [];
      if (strictIds.length > 0) promises.push(fetchDiscover(strictIds, 'strict'));
      if (relaxedIds.length > 0) promises.push(fetchDiscover(relaxedIds, 'relaxed'));
      await Promise.all(promises);

      const strictAndRelaxedYield = rawResults.filter(r => r.type === type && ['strict', 'relaxed', 'reference_discover'].includes(r.strategy));
      if (strictAndRelaxedYield.length < 8) {
        await fetchDiscover([], 'fallback');
      }
    }
  }

  const uniqueMap = new Map();
  for (const item of rawResults) {
    if (reference && item.id === reference.id) continue;

    const uniqueKey = `${item.type || 'movie'}_${item.id}`;
    if (uniqueMap.has(uniqueKey)) continue;

    const year = parseReleaseYear(item.release_date || item.first_air_date);
    if (normalized.year_min && year && year < normalized.year_min) continue;
    if (normalized.year_max && year && year > normalized.year_max) continue;

    if (normalized.quality_profile === 'family') {
      if (item.adult) continue;
      const genres = item.genre_ids || [];
      if (genres.includes(27) || genres.includes(53)) continue;
    }

    if (normalized.exclude && normalized.exclude.length > 0) {
      const map = item.type === 'movie' ? MOVIE_GENRES : TV_GENRES;
      const excludeIds = normalized.exclude.map(g => g.toLowerCase()).map(g => map[g]).filter(id => id !== undefined);
      const itemGenres = item.genre_ids || [];
      if (itemGenres.some(id => excludeIds.includes(id))) continue;
    }

    uniqueMap.set(uniqueKey, {
      id: item.id,
      type: item.type,
      title: item.type === 'movie' ? item.title : item.name,
      overview: item.overview,
      poster: item.poster_path,
      release_date: item.type === 'movie' ? item.release_date : item.first_air_date,
      vote_average: item.vote_average || 0,
      vote_count: item.vote_count || 0,
      popularity: item.popularity || 0,
      genre_ids: item.genre_ids || [],
      strategy: item.strategy,
      custom_reason: item.custom_reason
    });
  }

  let finalArray = Array.from(uniqueMap.values());
  const refKeywordIds = reference ? await getItemKeywords(reference.id, reference.type) : [];
  const kwMustHaveIds = (await getKeywordIds(normalized.must_have)).ids;
  const kwSemanticIds = (await getKeywordIds(normalized.semantic_topics)).ids;
  const verifyIds = kwMustHaveIds.length > 0 ? kwMustHaveIds : kwSemanticIds;

  for (const item of finalArray) {
    let score = (item.vote_average * 2)
      + (Math.log10(item.vote_count + 1) * 4)
      + (Math.log10(item.popularity + 1) * 2);

    if (item.poster) score += 5;
    if (!item.release_date) score -= 10;

    const releaseYear = parseReleaseYear(item.release_date);
    if (isFutureRelease(item.release_date) && normalized.quality_profile !== 'new') score -= 35;
    if (releaseYear && releaseYear >= 2025 && normalized.quality_profile !== 'new') score -= 10;
    if (item.vote_count < 50 && !['hidden_gems', 'new'].includes(normalized.quality_profile)) score -= 20;
    if (item.vote_count < 150 && normalized.quality_profile === 'mainstream') score -= 10;

    if (item.strategy === 'ai_direct_recommendation') score += 500;
    if (item.strategy === 'strict') score += 24;
    if (item.strategy === 'relaxed') score += 10;
    if (item.strategy === 'reference_discover') score += 12;
    if (item.strategy === 'language_supplement') score -= 10;
    if (item.strategy === 'fallback') score -= 28;

    const requestedGenreIds = queryGenresByType[item.type] || [];
    const genreOverlap = countGenreOverlap(item.genre_ids, requestedGenreIds);
    if (requestedGenreIds.length > 0) {
      if (genreOverlap > 0) score += genreOverlap * 18;
      else score -= 35;
    }

    if (reference) {
      const refGenreOverlap = countGenreOverlap(item.genre_ids, reference.genre_ids || []);
      if (refGenreOverlap > 0) score += refGenreOverlap * 20;
      else if (normalized.intent === 'similar_to_title') score -= 18;
    }

    item.base_score = score;
  }

  finalArray.sort((a, b) => b.base_score - a.base_score);
  const topCandidates = finalArray.slice(0, AI_CANDIDATE_LIMIT);

  if (verifyIds.length > 0 && normalized.intent !== 'person_search') {
    await Promise.all(topCandidates.map(async (item) => {
      const itemKws = await getItemKeywords(item.id, item.type);
      const hasKeyword = verifyIds.some(id => itemKws.includes(id));
      item.keyword_verified = hasKeyword;
      if (hasKeyword) item.base_score += 28;
      else item.base_score -= 24;

      if (normalized.intent === 'similar_to_title' && refKeywordIds.length > 0) {
        const keywordOverlap = refKeywordIds.filter(id => itemKws.includes(id)).length;
        item.ref_keyword_overlap = keywordOverlap;
        if (keywordOverlap > 0) item.base_score += keywordOverlap * 8;
        else item.base_score -= 12;
      }
    }));
  } else if (normalized.intent === 'similar_to_title' && refKeywordIds.length > 0) {
    await Promise.all(topCandidates.map(async (item) => {
      const itemKws = await getItemKeywords(item.id, item.type);
      const keywordOverlap = refKeywordIds.filter(id => itemKws.includes(id)).length;
      item.ref_keyword_overlap = keywordOverlap;
      if (keywordOverlap > 0) item.base_score += keywordOverlap * 8;
      else item.base_score -= 10;
    }));
  }

  topCandidates.sort((a, b) => b.base_score - a.base_score);

  const verifiedCandidates = topCandidates.filter(item => item.keyword_verified);
  const stronglySimilarCandidates = topCandidates.filter(item => (item.ref_keyword_overlap || 0) > 0);
  let rankedCandidates = topCandidates;

  if (verifyIds.length > 0 && verifiedCandidates.length >= Math.min(8, AI_RESULT_LIMIT / 2)) {
    rankedCandidates = [...verifiedCandidates, ...topCandidates.filter(item => !item.keyword_verified)];
  } else if (normalized.intent === 'similar_to_title' && stronglySimilarCandidates.length >= Math.min(6, AI_RESULT_LIMIT / 2)) {
    rankedCandidates = [...stronglySimilarCandidates, ...topCandidates.filter(item => (item.ref_keyword_overlap || 0) === 0)];
  }

  const itemsToEnrich = rankedCandidates.slice(0, AI_RESULT_LIMIT);
  let enriched = await enrichResults(itemsToEnrich, normalized, reference);

  enriched = enriched.filter(item => {
    if (normalized.trailer_required && !item.trailer_url) return false;
    if (normalized.watch_provider) {
      const nameNorm = normalized.watch_provider.toLowerCase().replace(/\s+/g, '');
      const hasProvider = item.providers && item.providers.some(p => p.provider_name.toLowerCase().replace(/\s+/g, '').includes(nameNorm));
      if (!hasProvider) return false;
    }
    if ((normalized.must_have || []).includes('miniseries')) {
      if (item.type !== 'tv') return false;
      if (item.number_of_seasons && item.number_of_seasons > 2) return false;
    }
    return true;
  });

  return { reference, people, warnings, results: enriched.slice(0, AI_RESULT_LIMIT) };
}
// Popular endpoint
fastify.get('/api/popular', async (request, reply) => {
  const { type, page = 1 } = request.query;
  if (!type || !['movie', 'tv'].includes(type)) {
    return reply.status(400).send({ ok: false, error: 'type parametresi "movie" veya "tv" olmal\u0131d\u0131r.' });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const cacheKey = `popular_${type}_p${pageNum}`;
  const cached = getFromCache(cacheKey);
  if (cached) return { ok: true, ...cached, cached: true };

  try {
    const listUrl = type === 'movie'
      ? `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&region=${TMDB_REGION}&page=${pageNum}`
      : `${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&page=${pageNum}`;

    const listRes = await fetch(listUrl);
    if (!listRes.ok) throw new Error(`TMDB popular hatas\u0131: ${listRes.status}`);
    const listData = await listRes.json();
    const items = (listData.results || []).slice(0, 20);
    const hasNextPage = (listData.total_pages || 1) > pageNum;

    // Tam veri: providers + videos + credits tek           
    const results = await Promise.all(items.map(async (item) => {
      const title       = type === 'movie' ? (item.title || item.original_title) : (item.name || item.original_name);
      const origTitle   = type === 'movie' ? item.original_title : item.original_name;
      const releaseDate = type === 'movie' ? item.release_date : item.first_air_date;

      let providers = [], trailer_url = null, runtime = null, number_of_seasons = null, genres = [];
      try {
        const detailRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}&append_to_response=watch/providers,videos,credits`);
        if (detailRes.ok) {
          const d = await detailRes.json();
          genres = (d.genres || []).map(g => g.name);
          if (type === 'movie') {
            runtime = d.runtime || null;
          } else {
            number_of_seasons = d.number_of_seasons || null;
            runtime = d.episode_run_time?.[0] || null;
          }
          const trData = d['watch/providers']?.results?.TR;
          if (trData?.flatrate) {
            providers = trData.flatrate.map(p => ({ provider_id: p.provider_id, provider_name: p.provider_name, logo_path: p.logo_path }));
          }
          const videos = d.videos?.results || [];
          const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
                       || videos.find(v => v.type === 'Trailer' && v.site === 'YouTube')
                       || videos.find(v => v.site === 'YouTube');
          if (trailer) trailer_url = `https://www.youtube.com/watch?v=${trailer.key}`;
        }
      } catch {}

      if (!trailer_url) {
        try {
          const vRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`);
          if (vRes.ok) {
            const vData = await vRes.json();
            const trailer = (vData.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)
                         || (vData.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
            if (trailer) trailer_url = `https://www.youtube.com/watch?v=${trailer.key}`;
          }
        } catch {}
      }

      return {
        id: item.id, title, original_title: origTitle,
        overview: item.overview || '', poster: item.poster_path,
        release_date: releaseDate, vote_average: item.vote_average,
        type, genres, runtime, number_of_seasons, providers, trailer_url,
      };
    }));

    const responseData = { results, hasNextPage, page: pageNum };
    setCache(cacheKey, responseData, 1800); // 30 dakika
    return { ok: true, ...responseData };
  } catch (err) {
    fastify.log.error(err);
    return { ok: false, error: err.message };
  }
});

// Genre endpoint
fastify.get('/api/genre', async (request, reply) => {
  const { type, genre_id, page = 1, sort_by = 'popularity.desc' } = request.query;
  if (!type || !['movie', 'tv'].includes(type)) {
    return reply.status(400).send({ ok: false, error: 'type parametresi "movie" veya "tv" olmalıdır.' });
  }
  if (!genre_id) {
    return reply.status(400).send({ ok: false, error: 'genre_id gereklidir.' });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const cacheKey = `genre_${type}_${genre_id}_p${pageNum}_s${sort_by}`;
  const cached = getFromCache(cacheKey);
  if (cached) return { ok: true, ...cached, cached: true };

  try {
    const url = new URL(`${TMDB_BASE_URL}/discover/${type}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', TMDB_LANGUAGE);
    url.searchParams.append('region', TMDB_REGION);
    url.searchParams.append('sort_by', sort_by);
    url.searchParams.append('with_genres', genre_id);
    url.searchParams.append('vote_count.gte', 50);
    url.searchParams.append('page', pageNum);

    const listRes = await fetch(url.toString());
    if (!listRes.ok) throw new Error(`TMDB discover hatası: ${listRes.status}`);
    const listData = await listRes.json();
    const items = (listData.results || []).slice(0, 20);
    const hasNextPage = (listData.total_pages || 1) > pageNum;

    const results = await Promise.all(items.map(async (item) => {
      const title       = type === 'movie' ? (item.title || item.original_title) : (item.name || item.original_name);
      const origTitle   = type === 'movie' ? item.original_title : item.original_name;
      const releaseDate = type === 'movie' ? item.release_date : item.first_air_date;

      let providers = [];
      try {
        const provRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}/watch/providers?api_key=${TMDB_API_KEY}`);
        if (provRes.ok) {
          const provData = await provRes.json();
          const trData   = provData.results?.TR;
          if (trData?.flatrate) {
            providers = trData.flatrate.map(p => ({ provider_id: p.provider_id, provider_name: p.provider_name, logo_path: p.logo_path }));
          }
        }
      } catch {}

      return {
        id: item.id, title, original_title: origTitle,
        overview: item.overview || '', poster: item.poster_path,
        release_date: releaseDate, vote_average: item.vote_average,
        type, providers,
      };
    }));

    const responseData = { results, hasNextPage, page: pageNum, totalPages: listData.total_pages || 1 };
    setCache(cacheKey, responseData, 900); // 15 dakika
    return { ok: true, ...responseData };
  } catch (err) {
    fastify.log.error(err);
    return { ok: false, error: err.message };
  }
});

// Direct TMDB Title Search (No AI Overhead)
fastify.get('/api/search/direct', async (request, reply) => {
  const { query, page = 1 } = request.query;
  if (!query || !query.trim()) {
    return reply.status(400).send({ ok: false, error: 'Arama terimi boş olamaz.' });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const cacheKey = `direct_search_${toSearchText(query)}_p${pageNum}`;
  const cached = getFromCache(cacheKey);
  if (cached) return { ok: true, ...cached, cached: true };

  try {
    const url = new URL(`${TMDB_BASE_URL}/search/multi`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', TMDB_LANGUAGE);
    url.searchParams.append('query', query.trim());
    url.searchParams.append('page', pageNum);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB Direct Search error: ${res.status}`);
    const data = await res.json();
    const rawItems = (data.results || []).filter(i => i.media_type === 'movie' || i.media_type === 'tv');

    const results = await Promise.all(rawItems.map(async (item) => {
      const type = item.media_type;
      const title = type === 'movie' ? (item.title || item.original_title) : (item.name || item.original_name);
      const releaseDate = type === 'movie' ? item.release_date : item.first_air_date;

      let providers = [];
      try {
        const provRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}/watch/providers?api_key=${TMDB_API_KEY}`);
        if (provRes.ok) {
          const provData = await provRes.json();
          const trData = provData.results?.TR;
          if (trData?.flatrate) {
            providers = trData.flatrate.map(p => ({ provider_id: p.provider_id, provider_name: p.provider_name, logo_path: p.logo_path }));
          }
        }
      } catch {}

      return {
        id: item.id,
        title,
        original_title: type === 'movie' ? item.original_title : item.original_name,
        overview: item.overview || '',
        poster: item.poster_path,
        release_date: releaseDate,
        vote_average: item.vote_average || 0,
        type,
        providers,
        reason: `TMDB Doğrudan İsim Arama Sonucu`
      };
    }));

    const payload = { results, page: pageNum, totalPages: data.total_pages || 1, hasNextPage: (data.total_pages || 1) > pageNum };
    setCache(cacheKey, payload, 900);
    return { ok: true, ...payload };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ ok: false, error: err.message });
  }
});

// Advanced TMDB Discover Search (Genres, Year, Min Rating, Sort)
fastify.get('/api/search/advanced', async (request, reply) => {
  const { type = 'movie', genres, year_min, year_max, min_vote, sort_by = 'popularity.desc', page = 1 } = request.query;
  const mediaType = ['movie', 'tv'].includes(type) ? type : 'movie';
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  const cacheKey = `adv_search_${mediaType}_g${genres}_y${year_min}-${year_max}_v${min_vote}_s${sort_by}_p${pageNum}`;
  const cached = getFromCache(cacheKey);
  if (cached) return { ok: true, ...cached, cached: true };

  try {
    const url = new URL(`${TMDB_BASE_URL}/discover/${mediaType}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', TMDB_LANGUAGE);
    url.searchParams.append('region', TMDB_REGION);
    url.searchParams.append('sort_by', sort_by);
    url.searchParams.append('page', pageNum);

    if (genres) url.searchParams.append('with_genres', genres);
    if (min_vote) url.searchParams.append('vote_average.gte', min_vote);
    url.searchParams.append('vote_count.gte', 30);

    if (year_min) {
      if (mediaType === 'movie') url.searchParams.append('primary_release_date.gte', `${year_min}-01-01`);
      else url.searchParams.append('first_air_date.gte', `${year_min}-01-01`);
    }
    if (year_max) {
      if (mediaType === 'movie') url.searchParams.append('primary_release_date.lte', `${year_max}-12-31`);
      else url.searchParams.append('first_air_date.lte', `${year_max}-12-31`);
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB Advanced Discover error: ${res.status}`);
    const data = await res.json();

    const results = await Promise.all((data.results || []).slice(0, 20).map(async (item) => {
      const title = mediaType === 'movie' ? (item.title || item.original_title) : (item.name || item.original_name);
      const releaseDate = mediaType === 'movie' ? item.release_date : item.first_air_date;

      let providers = [];
      try {
        const provRes = await fetch(`${TMDB_BASE_URL}/${mediaType}/${item.id}/watch/providers?api_key=${TMDB_API_KEY}`);
        if (provRes.ok) {
          const provData = await provRes.json();
          const trData = provData.results?.TR;
          if (trData?.flatrate) {
            providers = trData.flatrate.map(p => ({ provider_id: p.provider_id, provider_name: p.provider_name, logo_path: p.logo_path }));
          }
        }
      } catch {}

      return {
        id: item.id,
        title,
        original_title: mediaType === 'movie' ? item.original_title : item.original_name,
        overview: item.overview || '',
        poster: item.poster_path,
        release_date: releaseDate,
        vote_average: item.vote_average || 0,
        type: mediaType,
        providers,
        reason: `Detaylı Filtreleme Sonucu`
      };
    }));

    const payload = { results, page: pageNum, totalPages: data.total_pages || 1, hasNextPage: (data.total_pages || 1) > pageNum };
    setCache(cacheKey, payload, 900);
    return { ok: true, ...payload };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ ok: false, error: err.message });
  }
});

// Update helpers
async function getGitHubRepoPath() {
  const repoPath = process.env.GITHUB_REPO?.trim();
  return repoPath || null;
}

async function getCurrentCommit() {
  return (
    process.env.GIT_COMMIT_SHA?.trim()
    || process.env.COOLIFY_COMMIT_SHA?.trim()
    || process.env.SOURCE_COMMIT?.trim()
    || null
  );
}

// Routes
fastify.get('/health', async (request, reply) => { return { ok: true, service: 'sineai', version: '0.3.0' }; });

fastify.get('/api/check-update', async (request, reply) => {
  try {
    const repoPath = await getGitHubRepoPath();
    if (!repoPath) {
      return reply.status(500).send({
        ok: false,
        error: 'GitHub repo bilgisi al\u0131namad\u0131. GITHUB_REPO env de\u011fi\u015fkenini ayarlay\u0131n.'
      });
    }

    const currentCommit = await getCurrentCommit();
    const headers = { 'User-Agent': 'SineAI-UpdateChecker/1.0' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const apiRes = await fetch(`https://api.github.com/repos/${repoPath}/commits/main`, { headers });
    if (!apiRes.ok) throw new Error(`GitHub API: ${apiRes.status}`);

    const apiData = await apiRes.json();
    const latestCommit = apiData.sha;
    const hasUpdate = currentCommit ? currentCommit !== latestCommit : true;

    return {
      ok: true,
      hasUpdate,
      currentCommit: currentCommit ? currentCommit.substring(0, 7) : 'bilinmiyor',
      latestCommit: latestCommit.substring(0, 7),
      latestMessage: apiData.commit?.message?.split('\n')[0] || ''
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ ok: false, error: `Kontrol ba\u015far\u0131s\u0131z: ${err.message}` });
  }
});

fastify.post('/api/update', async (request, reply) => {
  return reply.send({
    ok: false,
    manual: true,
    message: 'Bu uygulama Coolify ile \u00e7al\u0131\u015f\u0131yor. Container i\u00e7inde .git olmad\u0131\u011f\u0131 i\u00e7in uygulama i\u00e7inden git pull yap\u0131lamaz. G\u00fcncelleme i\u00e7in Coolify \u00fczerinden Redeploy kullan\u0131n.'
  });
});

fastify.post('/api/recommend', async (request, reply) => {
  const { query } = request.body;
  if (!query || typeof query !== 'string') return reply.status(400).send({ ok: false, error: 'Query required' });
  const cacheKey = `recommend_v3.0:${query.trim().toLowerCase()}`;
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return { ok: true, ...cachedData, cached: true };

  let normalized;
  try { normalized = await normalizeQuery(query); }
  catch (error) { normalized = { ...FALLBACK_NORMALIZE }; }

  const tmdbData = await fetchTMDB(normalized, query);
  const responseData = { ok: true, normalized, reference: tmdbData.reference, people: tmdbData.people, warnings: tmdbData.warnings, results: tmdbData.results };
  setCache(cacheKey, responseData);
  return responseData;
});

// Auth & Profile Endpoints
fastify.post('/api/auth/register', async (request, reply) => {
  const { username, password, email } = request.body || {};
  if (!username || !password) return reply.status(400).send({ ok: false, error: 'Kullanıcı adı ve şifre zorunludur.' });
  const users = loadUsers();
  const cleanUsername = username.trim().toLowerCase();
  if (users[cleanUsername]) return reply.status(400).send({ ok: false, error: 'Bu kullanıcı adı zaten alınmış.' });
  
  users[cleanUsername] = {
    username: cleanUsername,
    displayName: username.trim(),
    email: email ? email.trim() : '',
    password,
    favorites: [],
    createdAt: new Date().toISOString()
  };
  saveUsers(users);
  return { ok: true, username: cleanUsername, displayName: username.trim(), favorites: [] };
});

fastify.post('/api/auth/login', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) return reply.status(400).send({ ok: false, error: 'Kullanıcı adı ve şifre giriniz.' });
  const users = loadUsers();
  const cleanUsername = username.trim().toLowerCase();
  const user = users[cleanUsername];
  if (!user || user.password !== password) {
    return reply.status(401).send({ ok: false, error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  return { ok: true, username: user.username, displayName: user.displayName || user.username, favorites: user.favorites || [] };
});

fastify.get('/api/user/profile', async (request, reply) => {
  const { username } = request.query || {};
  if (!username) return reply.status(400).send({ ok: false, error: 'Username parametresi gereklidir.' });
  const users = loadUsers();
  const user = users[username.trim().toLowerCase()];
  if (!user) return reply.status(404).send({ ok: false, error: 'Kullanıcı bulunamadı.' });
  return { ok: true, username: user.username, displayName: user.displayName || user.username, favorites: user.favorites || [] };
});

fastify.post('/api/user/favorites', async (request, reply) => {
  const { username, item, action } = request.body || {};
  if (!username || !item || !item.id) return reply.status(400).send({ ok: false, error: 'Eksik veri.' });
  const users = loadUsers();
  const cleanUsername = username.trim().toLowerCase();
  const user = users[cleanUsername];
  if (!user) return reply.status(404).send({ ok: false, error: 'Kullanıcı oturumu bulunamadı.' });

  if (!user.favorites) user.favorites = [];
  const index = user.favorites.findIndex(f => f.id === item.id && f.type === item.type);

  if (action === 'add' && index === -1) {
    user.favorites.push(item);
  } else if (action === 'remove' && index !== -1) {
    user.favorites.splice(index, 1);
  }
  saveUsers(users);
  return { ok: true, favorites: user.favorites };
});

// Profile Based AI Recommendation (Requires >= 10 favorites)
fastify.post('/api/recommend/profile', async (request, reply) => {
  const { username, favorites: clientFavorites } = request.body || {};
  let favs = clientFavorites;
  if (username) {
    const users = loadUsers();
    const user = users[username.trim().toLowerCase()];
    if (user && user.favorites) favs = user.favorites;
  }
  if (!favs || !Array.isArray(favs) || favs.length < 10) {
    return reply.status(400).send({
      ok: false,
      error: `Kişiselleştirilmiş AI önerileri alabilmek için en az 10 film/dizi favorilemelisiniz! (Mevcut favorileriniz: ${favs ? favs.length : 0}/10)`
    });
  }

  const favTitles = favs.slice(0, 15).map(f => f.title).join(', ');
  const profileQuery = `Benim en sevdiğim filmler ve diziler şunlardır: ${favTitles}. Bu yapımların ortak temalarını, atmosferlerini ve sinema zevkimi analiz ederek bana en uygun yeni öneriler getir.`;

  const cacheKey = `profile_rec:${username || 'guest'}_${favs.length}`;
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return { ok: true, ...cachedData, cached: true };

  let normalized;
  try { normalized = await normalizeQuery(profileQuery); }
  catch (error) { normalized = { ...FALLBACK_NORMALIZE }; }

  const tmdbData = await fetchTMDB(normalized, profileQuery);
  const favIds = new Set(favs.map(f => `${f.type}_${f.id}`));
  const filteredResults = (tmdbData.results || []).filter(item => !favIds.has(`${item.type}_${item.id}`));

  const responseData = { ok: true, isProfileRecommendation: true, favCount: favs.length, normalized, reference: tmdbData.reference, people: tmdbData.people, warnings: tmdbData.warnings, results: filteredResults };
  setCache(cacheKey, responseData, 600);
  return responseData;
});

const start = async () => {
  try { await fastify.listen({ port: PORT, host: '0.0.0.0' }); fastify.log.info(`Server listening on 0.0.0.0:${PORT}`); } 
  catch (err) { fastify.log.error(err); process.exit(1); }
};
start();
