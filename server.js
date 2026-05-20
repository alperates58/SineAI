import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

// Cache Settings
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '900', 10);
const cache = new Map();

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

function getFromCache(key) {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) return item.data;
  cache.delete(key);
  return null;
}

function setCache(key, data, ttlSeconds = CACHE_TTL_SECONDS) {
  cache.set(key, { data, expires: Date.now() + (ttlSeconds * 1000) });
}

// Prompt Generation
const SYSTEM_PROMPT = `Sen bir film ve dizi öneri asistanısın. Kullanıcının girdisini analiz et ve bir SEARCH PLAN (arama planı) oluşturarak sadece aşağıdaki JSON formatında çıktı ver.
Kurallar:
- Eğer kullanıcı "X benzeri", "X gibi", "X tarzı", "X'e benzeyen", "X ayarında" gibi kalıplar kullanırsa HER ZAMAN intent "similar_to_title" ve reference_title "X" olsun. Bu kural Türkçe başlıklar ve yerli yapımlar için de geçerlidir (Örn: "Kurtlar Vadisi benzeri dizi öner" => intent: "similar_to_title", reference_title: "Kurtlar Vadisi", type: "tv").
- "X oynadığı", "X yönettiği" gibi aramalarda aktör/yönetmen alanlarını mutlaka doldur. Niyet ne olursa olsun bu alanlar doluysa sistem onu dikkate alacaktır (Örn: "Donnie Yen dövüş filmleri" => actors:["Donnie Yen"], must_have:["martial arts"], intent:"discover").
- "az bilinen", "gizli cevher", "bağımsız" derse quality_profile: "hidden_gems".
- "yeni çıkan" derse quality_profile: "new".
- "klasik" derse quality_profile: "classic".
- "aile", "çocuk" derse quality_profile: "family".
- Varsayılan quality_profile: "mainstream".
- Anlamsal konuları (uzay, yapay zeka, zaman yolculuğu, karanlık, dövüş vb.) İNGİLİZCE olarak semantic_topics, must_have ve nice_to_have dizilerine dağıt. En kritik temaları must_have içine koy.
- Tarihler için: "90'lar" => year_min: 1990, year_max: 1999. "2020 sonrası" => year_min: 2020.
{
  "intent": "discover" | "similar_to_title" | "person_search",
  "reference_title": "",
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
  "quality_profile": "mainstream|hidden_gems|new|classic|family|any",
  "sort_by": "relevance|popularity|vote_average|release_date",
  "trailer_required": false
}`;

async function callMockAI(query) {
  const q = query.toLowerCase();
  const normalized = { ...FALLBACK_NORMALIZE };

  // Türkçe benzeri kalıpları yakala (benzeri, gibi, tarzı, benzeyen, ayarında)
  const similarPattern = /(.+?)\s+(benzeri|gibi|tarzı|benzeyen|ayarında)\s+(dizi|film)?/i;
  const similarMatch = q.match(similarPattern);

  if (q.includes('kurtlar vadisi benzeri') || q.includes('kurtlar vadisi gibi')) { normalized.intent = 'similar_to_title'; normalized.reference_title = 'Kurtlar Vadisi'; normalized.type = 'tv'; }
  else if (similarMatch) {
    // Generic fallback: benzeri kalıpı bulundu, intent'i similar_to_title yap
    const titlePart = similarMatch[1].trim();
    const typePart = similarMatch[3] ? (similarMatch[3].includes('dizi') ? 'tv' : 'movie') : 'any';
    normalized.intent = 'similar_to_title';
    normalized.reference_title = titlePart.charAt(0).toUpperCase() + titlePart.slice(1);
    if (typePart !== 'any') normalized.type = typePart;
  }
  else if (q.includes('yapay zeka')) { normalized.type = 'movie'; normalized.genres = ['science fiction']; normalized.must_have = ['artificial intelligence']; normalized.semantic_topics = ['robot', 'technology']; }
  else if (q.includes('zaman')) { normalized.type = 'movie'; normalized.genres = ['science fiction']; normalized.must_have = ['time travel']; }
  else if (q.includes('uzayda geçen gerilim')) { normalized.type = 'movie'; normalized.genres = ['science fiction', 'thriller']; normalized.must_have = ['space']; }
  else if (q.includes('uzay')) { normalized.genres = ['science fiction']; normalized.must_have = ['space']; }
  else if (q.includes('suç dizisi') && q.includes('karanlık')) { normalized.type = 'tv'; normalized.genres = ['crime', 'drama']; normalized.must_have = ['crime', 'detective']; normalized.semantic_topics = ['psychological thriller']; }
  else if (q.includes('aileyle izlenecek komedi')) { normalized.type = 'movie'; normalized.genres = ['comedy', 'family']; normalized.quality_profile = 'family'; }
  else if (q.includes('mini dizi')) { normalized.type = 'tv'; normalized.semantic_topics = ['miniseries']; }
  else if (q.includes('nolan')) { normalized.intent = 'person_search'; normalized.directors = ['Christopher Nolan']; normalized.semantic_topics = ['mind bending']; }
  else if (q.includes('true detective')) { normalized.intent = 'similar_to_title'; normalized.reference_title = 'True Detective'; normalized.type = 'tv'; }
  else if (q.includes('tom hardy')) { normalized.intent = 'person_search'; normalized.actors = ['Tom Hardy']; normalized.genres = ['action']; }
  else if (q.includes('90\'lardan')) { normalized.year_min = 1990; normalized.year_max = 1999; normalized.genres = ['crime']; }
  else if (q.includes('gizli cevher')) { normalized.genres = ['animation']; normalized.quality_profile = 'hidden_gems'; }
  else if (q.includes('yeni çıkan zombi')) { normalized.type = 'tv'; normalized.quality_profile = 'new'; normalized.must_have = ['zombie']; }
  else if (q.includes('kıyamet sonrası')) { normalized.type = 'movie'; normalized.must_have = ['post-apocalyptic', 'survival']; }
  else if (q.includes('tarantino')) { normalized.intent = 'person_search'; normalized.directors = ['Quentin Tarantino']; }
  else if (q.includes('romantik komedi')) { normalized.year_min = 2020; normalized.genres = ['romance', 'comedy']; }
  else if (q.includes('hapishaneden')) { normalized.type = 'movie'; normalized.must_have = ['prison']; }
  else if (q.includes('çoklu evren')) { normalized.type = 'movie'; normalized.must_have = ['multiverse']; }
  else if (q.includes('soğuk savaş')) { normalized.type = 'movie'; normalized.must_have = ['spy']; }
  else if (q.includes('hayvanlı')) { normalized.type = 'movie'; normalized.genres = ['family']; normalized.quality_profile = 'family'; }
  else if (q.includes('donnie yen')) { normalized.actors = ['Donnie Yen']; normalized.must_have = ['martial arts']; }
  else if (q.includes('vampir')) { normalized.type = 'tv'; normalized.must_have = ['vampire']; }
  else if (q.includes('seri katil')) { normalized.type = 'movie'; normalized.must_have = ['serial killer']; normalized.semantic_topics = ['based on a true story']; }
  else if (q.includes('akıl hastanesinde')) { normalized.type = 'movie'; normalized.must_have = ['psychological thriller']; }
  else if (q.includes('lisede')) { normalized.type = 'tv'; normalized.must_have = ['high school']; }
  else if (q.includes('uzaylı istilası')) { normalized.type = 'movie'; normalized.must_have = ['alien']; }
  else if (q.includes('doğa belgeseli')) { normalized.type = 'tv'; normalized.genres = ['documentary']; }
  else if (q.includes('kılıçlı')) { normalized.type = 'tv'; normalized.must_have = ['middle ages']; }
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
    if (AI_PROVIDER === 'deepseek') return await callDeepSeek(safeQuery);
    if (AI_PROVIDER === 'openai') return await callOpenAI(safeQuery);
    if (AI_PROVIDER === 'gemini') return await callGemini(safeQuery);
    return await callMockAI(safeQuery);
  } catch (error) {
    fastify.log.error(`AI Provider error:`, error);
    return await callMockAI(safeQuery);
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
  "yapay zeka": "artificial intelligence", "robot": "robot", "android": "android",
  "zaman yolculuğu": "time travel", "zamanda yolculuk": "time travel", "zaman döngüsü": "time loop",
  "paralel evren": "parallel universe", "çoklu evren": "multiverse", "alternatif zaman çizgisi": "alternate timeline",
  "uzay": "space", "uzay yolculuğu": "space travel", "astronot": "astronaut", "mars": "mars", "uzaylı": "alien",
  "distopya": "dystopia", "kıyamet": "apocalypse", "kıyamet sonrası": "post-apocalyptic", "hayatta kalma": "survival",
  "seri katil": "serial killer", "dedektif": "detective", "mafya": "mafia", "uyuşturucu": "drug cartel",
  "siberpunk": "cyberpunk", "vampir": "vampire", "zombi": "zombie", "büyü": "magic", "cadı": "witch",
  "doğaüstü": "supernatural", "kafa yakan": "mind bending", "psikolojik": "psychological thriller",
  "hapishane": "prison", "soygun": "heist", "casus": "spy", "politik": "politics",
  "aile": "family", "çocuk": "children", "romantik": "romance", "komik": "comedy", "eğlenceli": "fun",
  "dövüş": "martial arts", "dövüş sanatları": "martial arts", "samuray": "samurai", "ninja": "ninja",
  "biyografi": "biography", "gerçek hikaye": "based on a true story", "tarihi": "history", "orta çağ": "middle ages",
  "anime": "anime", "spor": "sports", "futbol": "football", "basketbol": "basketball", "yarış": "racing",
  "gerilim": "thriller", "korku": "horror", "gizem": "mystery", "aksiyon": "action",
  "aşk": "romance", "duygusal": "emotional", "dram": "drama", "suç": "crime"
};

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ");
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

  // Hem yerel dil hem en-US aranır; aynı film farklı dilde daha yüksek skor alabilir (örn. "Exit 8" tr-TR'de "Çıkış 8")
  // Her film için diller arasındaki MAX skor tutulur
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
            // startsWith yalnızca tam kelime sınırında geçerli: "exit 8 something" ✓, "exit 8a" ✗
            else if (tNorm.startsWith(queryNorm) && (tNorm.length === queryNorm.length || tNorm[queryNorm.length] === ' ')) score += 5000;
            else if (otNorm.startsWith(queryNorm) && (otNorm.length === queryNorm.length || otNorm[queryNorm.length] === ' ')) score += 4000;
            else if (tNorm.includes(queryNorm)) score += 1000;
            else if (otNorm.includes(queryNorm)) score += 800;

            score += (match.popularity || 0) * 0.1;
            score += (match.vote_count || 0) * 5;

            if (match.genre_ids && match.genre_ids.includes(99)) score -= 10000;

            const existing = candidateMap.get(match.id);
            // Aynı film için en yüksek skoru ve o skora karşılık gelen başlığı sakla
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

    // Bu tür için en iyi adayı global bestMatch ile karşılaştır
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
    try {
      const url = new URL(`${TMDB_BASE_URL}/${reference.type}/${reference.id}/${ep}?api_key=${TMDB_API_KEY}&language=${TMDB_LANGUAGE}`);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.push(...(data.results || []).map(i => ({...i, type: reference.type})));
      }
    } catch (err) {}
  }
  return results;
}

async function enrichResults(results, normalized, reference) {
  const enrichPromises = results.map(async (item) => {
    // Advanced Reason
    if (normalized.intent === 'similar_to_title' && reference) {
      const refIds = reference.genre_ids || [];
      const itemIds = item.genre_ids || [];
      const intersection = itemIds.filter(id => refIds.includes(id));
      if (intersection.length > 0) {
        const genreNames = intersection.slice(0, 2).map(id => TMDB_GENRE_NAMES[id]).filter(Boolean);
        item.reason = genreNames.length > 0 ? `"${reference.title}" ile ortak ${genreNames.join('/')} teması taşıyor` : `"${reference.title}" ile benzer bir atmosfere sahip`;
      } else {
        item.reason = `"${reference.title}" ile benzer tarzda bir yapım`;
      }
    } else if (normalized.intent === 'person_search' && normalized.actors && normalized.actors.length > 0) {
      item.reason = `"${normalized.actors[0]}" yer alıyor`;
    } else if (normalized.intent === 'person_search' && normalized.directors && normalized.directors.length > 0) {
      item.reason = `"${normalized.directors[0]}" yönetti`;
    } else {
       // Search Plan Reasons
       let reasonParts = [];
       if (normalized.resolved_must_have && normalized.resolved_must_have.length > 0) {
           reasonParts.push(`${normalized.resolved_must_have.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ve ')} temasını merkeze alan`);
       } else if (normalized.resolved_semantic && normalized.resolved_semantic.length > 0) {
           reasonParts.push(`${normalized.resolved_semantic.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} temalarına sahip`);
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
           item.reason = `${reasonParts.join(' ')} başarılı bir ${genreStr ? genreStr : (item.type==='movie'?'film':'dizi')} önerisi`;
       } else {
           item.reason = `İsteğinize uygun popüler bir öneri`;
       }
    }

    item.providers = [];
    item.trailer_url = null;
    item.original_title = item.title;
    item.genres = [];
    item.runtime = null;
    item.director = null;
    
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

  // Backend fallback: AI yanlış normalize etse de reference_title doluysa ve query'de benzeri kalıpları varsa intent'i similar_to_title yap
  if (normalized.reference_title && originalQuery) {
    const q = originalQuery.toLowerCase();
    if (/benzeri|gibi|tarzı|benzeyen|ayarında/.test(q)) {
      normalized.intent = 'similar_to_title';
    }
  }

  let reference = null;
  let people = [];
  let warnings = [];
  let rawResults = [];
  const types = normalized.type === 'any' ? ['movie', 'tv'] : [normalized.type];

  // Similar to Title Logic
  if (normalized.intent === 'similar_to_title' && normalized.reference_title) {
    reference = await searchTMDB(normalized.reference_title, normalized.type || 'any');
    if (reference && reference.vote_count >= 150) {
      rawResults = await fetchSimilarTMDB(reference, normalized);
      // Non-English content: supplement with same-language discover (e.g. Kurtlar Vadisi)
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
            rawResults.push(...(suppData.results || []).map(i => ({ ...i, type: reference.type, strategy: 'relaxed' })));
          }
        } catch (err) {}
      }
    } else {
      // Referans bulunamadı veya çok az oylanmış (bilinmeyen/hatalı başlık)
      // AI'ın çıkardığı genre/must_have ile discover moduna geç
      const refLabel = reference ? `"${reference.title}" (${reference.vote_count} oy)` : `"${normalized.reference_title}"`;
      warnings.push(`${refLabel} için yeterli eşleşme bulunamadı, tema bazlı arama yapılıyor.`);
      reference = null;
      normalized.intent = 'discover';
    }
  }

  // Provider Resolution
  let providerId = null;
  if (normalized.watch_provider) {
    providerId = await getProviderId(normalized.watch_provider, normalized.type || 'any');
    if (!providerId) warnings.push(`'${normalized.watch_provider}' platformu bulunamadı.`);
  }

  // Person Logic (Always check if actors/directors are present)
  let personId = null;
  const personName = (normalized.actors && normalized.actors[0]) || (normalized.directors && normalized.directors[0]);
  if (personName) {
    const person = await searchPersonTMDB(personName);
    if (person) {
      personId = person.id;
      people.push({ id: person.id, name: person.name, role: normalized.actors?.length > 0 ? 'actor' : 'director' });
    } else {
      warnings.push(`'${personName}' isminde kişi bulunamadı.`);
    }
  }

  // PERSON CREDITS: Filmografiyi doğrudan person/{id}/credits'ten çek
  // discover with_cast/with_crew filtresi TV için güvenilmez; bu yaklaşım kesin sonuç verir
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

  // DISCOVER LOGIC (Multi-Strategy) — sadece person olmayan sorgular için
  if (!personId && (normalized.intent !== 'similar_to_title' || (normalized.intent === 'similar_to_title' && rawResults.length < 10))) {
     const kwMustHave = await getKeywordIds(normalized.must_have);
     const kwSemantic = await getKeywordIds(normalized.semantic_topics);
     const kwNice = await getKeywordIds(normalized.nice_to_have);
     const kwLegacy = await getKeywordIds(normalized.keywords);

     normalized.resolved_must_have = kwMustHave.resolvedNames;
     normalized.resolved_semantic = kwSemantic.resolvedNames;

     const strictIds = Array.from(new Set([...kwMustHave.ids]));
     const relaxedIds = Array.from(new Set([...kwMustHave.ids, ...kwSemantic.ids, ...kwLegacy.ids]));

     for (const type of types) {
        const fetchDiscover = async (keywordIds, strategy) => {
           const url = new URL(`${TMDB_BASE_URL}/discover/${type}`);
           url.searchParams.append('api_key', TMDB_API_KEY);
           url.searchParams.append('language', TMDB_LANGUAGE);
           url.searchParams.append('region', TMDB_REGION);

           if (normalized.sort_by === 'release_date') url.searchParams.append('sort_by', 'primary_release_date.desc');
           else if (normalized.sort_by === 'vote_average') url.searchParams.append('sort_by', 'vote_average.desc');
           else url.searchParams.append('sort_by', 'popularity.desc');

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

           if (normalized.genres && normalized.genres.length > 0) {
             const map = type === 'movie' ? MOVIE_GENRES : TV_GENRES;
             const genreIds = normalized.genres.map(g => g.toLowerCase()).map(g => map[g]).filter(id => id !== undefined);
             if (genreIds.length > 0) url.searchParams.append('with_genres', genreIds.join(','));
           }

           if (keywordIds.length > 0) {
             // OR mantığı (|): AND (,) çok kısıtlayıcı, keyword doğrulama top-20'yi zaten filtreler
             url.searchParams.append('with_keywords', keywordIds.join('|'));
           }

           // Quality Profile Defaults
           let minVoteCount = 100;
           let minVoteAvg = 5.0;
           if (normalized.quality_profile === 'hidden_gems') { 
               minVoteCount = type==='movie'?30:20; 
               minVoteAvg = 6.0; 
               url.searchParams.append('vote_count.lte', 1500); 
           }
           else if (normalized.quality_profile === 'mainstream') { minVoteCount = type==='movie'?300:100; minVoteAvg = 5.5; }
           else if (normalized.quality_profile === 'new') { minVoteCount = 10; minVoteAvg = 5.0; }
           
           if (normalized.min_vote_count) minVoteCount = normalized.min_vote_count;
           if (normalized.min_vote_average) minVoteAvg = normalized.min_vote_average;

           url.searchParams.append('vote_count.gte', minVoteCount);
           url.searchParams.append('vote_average.gte', minVoteAvg);

           try {
             const res = await fetch(url.toString());
             if (res.ok) {
                const data = await res.json();
                rawResults.push(...(data.results || []).map(i => ({...i, type, strategy})));
             }
           } catch (e) {}
        };

        const promises = [];
        if (strictIds.length > 0) promises.push(fetchDiscover(strictIds, 'strict'));
        if (relaxedIds.length > 0) promises.push(fetchDiscover(relaxedIds, 'relaxed'));

        await Promise.all(promises);

        // Fallback Strategy: Sadece hedef odaklı aramalardan yeterli sonuç çıkmazsa tetikle!
        const strictAndRelaxedYield = rawResults.filter(r => r.type === type && (r.strategy === 'strict' || r.strategy === 'relaxed'));
        if (strictAndRelaxedYield.length < 5) {
            await fetchDiscover([], 'fallback');
        }
     }
  }

  // Deduplication & Quality Filtering
  const uniqueMap = new Map();
  for (const item of rawResults) {
     if (reference && item.id === reference.id) continue;
     if (uniqueMap.has(item.id)) continue;

     const year = item.release_date || item.first_air_date ? parseInt((item.release_date || item.first_air_date).substring(0, 4)) : null;
     if (normalized.year_min && year && year < normalized.year_min) continue;
     if (normalized.year_max && year && year > normalized.year_max) continue;
     
     if (normalized.quality_profile === 'family') {
         if (item.adult) continue;
         const genres = item.genre_ids || [];
         if (genres.includes(27) || genres.includes(53)) continue; // korku, gerilim cikar
     }

     if (normalized.exclude && normalized.exclude.length > 0) {
         const map = item.type === 'movie' ? MOVIE_GENRES : TV_GENRES;
         const excludeIds = normalized.exclude.map(g => g.toLowerCase()).map(g => map[g]).filter(id => id !== undefined);
         const itemGenres = item.genre_ids || [];
         const hasExcluded = itemGenres.some(id => excludeIds.includes(id));
         if (hasExcluded) continue;
     }

     uniqueMap.set(item.id, {
        id: item.id, type: item.type, title: item.type === 'movie' ? item.title : item.name,
        overview: item.overview, poster: item.poster_path, 
        release_date: item.type === 'movie' ? item.release_date : item.first_air_date,
        vote_average: item.vote_average || 0, vote_count: item.vote_count || 0,
        popularity: item.popularity || 0, genre_ids: item.genre_ids || [], strategy: item.strategy
     });
  }

  let finalArray = Array.from(uniqueMap.values());

  // Base Scoring
  for (let item of finalArray) {
     let score = (item.vote_average * 2) 
               + (Math.log10(item.vote_count + 1) * 4) 
               + (Math.log10(item.popularity + 1) * 2);
     if (item.poster) score += 5;
     if (!item.release_date) score -= 10;
     if (item.strategy === 'strict') score += 20; // Artırıldı
     if (item.strategy === 'relaxed') score += 10; // Artırıldı
     if (item.strategy === 'fallback') score -= 20; // Cezalandırıldı
     item.base_score = score;
  }
  
  finalArray.sort((a,b) => b.base_score - a.base_score);
  
  // Must-Have Keyword Verification for Top 20
  const top20 = finalArray.slice(0, 20);
  const kwMustHaveIds = (await getKeywordIds(normalized.must_have)).ids;
  const kwSemanticIds = (await getKeywordIds(normalized.semantic_topics)).ids;
  
  const verifyIds = kwMustHaveIds.length > 0 ? kwMustHaveIds : kwSemanticIds;

  if (verifyIds.length > 0 && normalized.intent !== 'similar_to_title' && normalized.intent !== 'person_search') {
      const verifyPromises = top20.map(async (item) => {
         const itemKws = await getItemKeywords(item.id, item.type);
         const hasKeyword = verifyIds.some(id => itemKws.includes(id));
         if (hasKeyword) item.base_score += 25; // Massive bonus
         else item.base_score -= 30; // Massive penalty if requested strictly
         return item;
      });
      await Promise.all(verifyPromises);
      top20.sort((a,b) => b.base_score - a.base_score);
  }

  const itemsToEnrich = top20.slice(0, 20);
  let enriched = await enrichResults(itemsToEnrich, normalized, reference);

  // Post Enrichment Filters (Trailer/Provider)
  enriched = enriched.filter(item => {
    if (normalized.trailer_required && !item.trailer_url) return false;
    if (normalized.watch_provider) {
       const nameNorm = normalized.watch_provider.toLowerCase().replace(/\s+/g, '');
       const hasProvider = item.providers && item.providers.some(p => p.provider_name.toLowerCase().replace(/\s+/g, '').includes(nameNorm));
       if (!hasProvider) return false;
    }
    return true;
  });

  return { reference, people, warnings, results: enriched.slice(0, 20) };
}

// Popular endpoint
fastify.get('/api/popular', async (request, reply) => {
  const { type, page = 1 } = request.query;
  if (!type || !['movie', 'tv'].includes(type)) {
    return reply.status(400).send({ ok: false, error: 'type parametresi "movie" veya "tv" olmalıdır.' });
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
    if (!listRes.ok) throw new Error(`TMDB popular hatası: ${listRes.status}`);
    const listData = await listRes.json();
    const items = (listData.results || []).slice(0, 20);
    const hasNextPage = (listData.total_pages || 1) > pageNum;

    // Tam veri: providers + videos + credits tek çağrıda
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
  const { type, genre_id, page = 1 } = request.query;
  if (!type || !['movie', 'tv'].includes(type)) {
    return reply.status(400).send({ ok: false, error: 'type parametresi "movie" veya "tv" olmalıdır.' });
  }
  if (!genre_id) {
    return reply.status(400).send({ ok: false, error: 'genre_id gereklidir.' });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const cacheKey = `genre_${type}_${genre_id}_p${pageNum}`;
  const cached = getFromCache(cacheKey);
  if (cached) return { ok: true, ...cached, cached: true };

  try {
    const url = new URL(`${TMDB_BASE_URL}/discover/${type}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    url.searchParams.append('language', TMDB_LANGUAGE);
    url.searchParams.append('region', TMDB_REGION);
    url.searchParams.append('sort_by', 'popularity.desc');
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

    const responseData = { results, hasNextPage, page: pageNum };
    setCache(cacheKey, responseData, 900); // 15 dakika
    return { ok: true, ...responseData };
  } catch (err) {
    fastify.log.error(err);
    return { ok: false, error: err.message };
  }
});

// Update helpers
async function getGitHubRepoPath() {
  try {
    const { stdout } = await execAsync('git remote get-url origin');
    const match = stdout.trim().match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {}
  return process.env.GITHUB_REPO || null;
}

async function getCurrentCommit() {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD');
    return stdout.trim();
  } catch {}
  return null;
}

// Routes
fastify.get('/health', async (request, reply) => { return { ok: true, service: 'sineai', version: '0.3.0' }; });

fastify.get('/api/check-update', async (request, reply) => {
  try {
    const repoPath = await getGitHubRepoPath();
    if (!repoPath) return reply.status(500).send({ ok: false, error: 'GitHub repo bilgisi alınamadı. GITHUB_REPO env değişkeni ayarlayın.' });

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
    return reply.status(500).send({ ok: false, error: `Kontrol başarısız: ${err.message}` });
  }
});

fastify.post('/api/update', async (request, reply) => {
  try {
    const repoPath = await getGitHubRepoPath();
    // Docker'da SSH key olmadığından her zaman HTTPS kullan
    let pullTarget;
    if (repoPath) {
      const auth = process.env.GITHUB_TOKEN ? `${process.env.GITHUB_TOKEN}@` : '';
      pullTarget = `https://${auth}github.com/${repoPath}.git main`;
    } else {
      pullTarget = 'origin main';
    }
    const { stdout } = await execAsync(`git pull ${pullTarget}`);
    fastify.log.info(`Git pull: ${stdout}`);
    reply.send({ ok: true, message: 'Güncelleme indirildi. Sunucu yeniden başlatılıyor...' });
    setTimeout(() => process.exit(1), 800);
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ ok: false, error: `Güncelleme başarısız: ${err.message}` });
  }
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

const start = async () => {
  try { await fastify.listen({ port: PORT, host: '0.0.0.0' }); fastify.log.info(`Server listening on 0.0.0.0:${PORT}`); } 
  catch (err) { fastify.log.error(err); process.exit(1); }
};
start();
