const baseUrl = process.env.SINEAI_BASE_URL || 'http://127.0.0.1:3000';
const runExtended = process.argv.includes('--extended');
const listOnly = process.argv.includes('--list');
const caseFilter = process.argv.find(arg => arg.startsWith('--case='))?.slice('--case='.length).trim();

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resultTitles(data) {
  return (data.results || []).flatMap(item => [item.title, item.original_title].filter(Boolean));
}

function hasAnyTitle(data, expectedTitles) {
  const actual = new Set(resultTitles(data).map(fold));
  return expectedTitles.some(title => actual.has(fold(title)));
}

function matchingTitleCount(data, expectedTitles, limit = 8) {
  const actual = new Set(
    (data.results || [])
      .slice(0, limit)
      .flatMap(item => [item.title, item.original_title].filter(Boolean))
      .map(fold)
  );
  return expectedTitles.filter(title => actual.has(fold(title))).length;
}

function arrayIncludes(values, expected) {
  const folded = new Set((values || []).map(fold));
  return folded.has(fold(expected));
}

function oneOfArrayIncludes(values, expected) {
  return expected.some(value => arrayIncludes(values, value));
}

function isFamilyCertification(value) {
  const certification = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  return ['G', 'U', 'TVY', 'TVY7', 'TVG', '0+', '6+', 'PG', 'TVPG', '7+', '9+', '10+', '12'].includes(certification);
}

function hasRomanceSignal(item) {
  const text = fold([
    item.overview,
    item.reason,
    ...(item.ai_match_tags || []),
    ...(item.keyword_names || [])
  ].filter(Boolean).join(' '));
  return /\b(ask|love|romance|romantic|romcom|dating|marriage|couple|sevgi|romantik)\b/.test(text);
}

function commonChecks(data, testCase) {
  const results = data.results || [];
  const resultKeys = results.map(item => `${item.type}:${item.id || fold(item.original_title || item.title)}`);
  const expectedType = data.normalized?.type;
  const minResults = testCase.minResults ?? 4;
  const checks = [
    [data.analysis?.fallback === false, 'DeepSeek yanıtı kullanıldı; fallback yok'],
    [data.analysis?.model === 'deepseek-v4-flash', 'model=deepseek-v4-flash'],
    [results.length >= minResults, `en az ${minResults} sonuç`],
    [results.length <= 10, 'en fazla 10 sonuç'],
    [new Set(resultKeys).size === resultKeys.length, 'yinelenen yapım yok'],
    [results.every(item => String(item.reason || '').trim().length >= 8), 'her sonuçta açıklayıcı neden var'],
    [String(data.analysis?.summary || '').trim().length >= 12, 'Türkçe istek özeti üretildi']
  ];

  if (expectedType === 'movie' || expectedType === 'tv') {
    checks.push([results.every(item => item.type === expectedType), `sonuçların tamamı type=${expectedType}`]);
  }

  return checks;
}

const cases = [
  {
    id: 'mind-bending-movie',
    suite: 'core',
    query: 'beyin yakan film istiyorum',
    validate(data) {
      const strongMatches = matchingTitleCount(data, [
        'Inception', 'Memento', 'Predestination', 'The Prestige', 'Coherence', 'Shutter Island'
      ]);
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [arrayIncludes(data.normalized?.must_have, 'mind bending'), 'mind bending zorunlu tema'],
        [strongMatches >= 3, 'ilk 8 içinde en az 3 güçlü zihin oyunu eşleşmesi'],
        [!hasAnyTitle(data, ['3 Idiots', '3 Aptal', 'Atonement', 'Halloween 4']), 'bilinen alakasız sonuçlar yok']
      ];
    }
  },
  {
    id: 'similar-prestige-ui-prompt',
    suite: 'core',
    query: '"The Prestige" (2006) gibi; önce referansın ayırt edici özelliklerini belirle, sonra tür, tema, atmosfer, anlatı yapısı, tempo, karakter ilişkileri ve bıraktığı his açısından gerçekten benzeyen filmler öner. Aynı seri veya yönetmen tek başına yeterli değildir. Referans yapımı sonuçlara ekleme. Referans bilgileri: Türler: Dram, Gizem, Bilim-Kurgu; Yönetmen: Christopher Nolan.',
    validate(data) {
      const strongMatches = matchingTitleCount(data, [
        'Memento', 'Shutter Island', 'The Illusionist', 'The Game', 'Prisoners', 'Gone Girl', 'Oldboy'
      ]);
      return [
        [data.normalized?.intent === 'similar_to_title', 'intent=similar_to_title'],
        [fold(data.normalized?.reference_title) === fold('The Prestige'), 'referans yalnızca The Prestige'],
        [data.normalized?.type === 'movie', 'type=movie'],
        [!hasAnyTitle(data, ['The Prestige', 'Prestij']), 'referans sonuçlarda tekrarlanmıyor'],
        [strongMatches >= 3, 'ilk 8 içinde en az 3 güçlü Prestij benzeri']
      ];
    }
  },
  {
    id: 'similar-dark-tv',
    suite: 'core',
    query: 'Dark gibi gizemli bir dizi istiyorum',
    validate(data) {
      return [
        [data.normalized?.intent === 'similar_to_title', 'intent=similar_to_title'],
        [fold(data.normalized?.reference_title) === 'dark', 'referans=Dark'],
        [data.normalized?.type === 'tv', 'type=tv'],
        [!hasAnyTitle(data, ['Dark']), 'referans sonuçlarda tekrarlanmıyor'],
        [matchingTitleCount(data, ['1899', 'Bodies', 'Severance', 'Devs', 'The OA', 'Katla', 'Fringe']) >= 2, 'en az 2 güçlü Dark benzeri']
      ];
    }
  },
  {
    id: 'family-animation-typo',
    suite: 'core',
    query: 'cocuklarla izlenecek komik animasyon filmi',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.quality_profile === 'family', 'aile profili'],
        [data.normalized?.safety_level === 'family', 'aile güvenlik seviyesi'],
        [arrayIncludes(data.normalized?.genres, 'animation'), 'animasyon türü'],
        [arrayIncludes(data.normalized?.genres, 'comedy'), 'komedi türü']
      ];
    }
  },
  {
    id: 'single-location-thriller',
    suite: 'core',
    query: 'tek mekanda geçen gerilim filmi',
    validate(data) {
      const strongMatches = matchingTitleCount(data, [
        'Exam', 'Buried', 'Den skyldige', 'The Guilty', 'Locke', 'Phone Booth', '10 Cloverfield Lane', 'Cube'
      ], 6);
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [arrayIncludes(data.normalized?.genres, 'thriller'), 'gerilim türü'],
        [arrayIncludes(data.normalized?.must_have, 'single location'), 'tek mekân zorunlu tema'],
        [strongMatches >= 3, 'ilk 6 içinde en az 3 güçlü tek mekân gerilimi']
      ];
    }
  },
  {
    id: 'director-scifi',
    suite: 'core',
    query: "Christopher Nolan'ın yönettiği bilim kurgu filmleri",
    validate(data) {
      return [
        [data.normalized?.intent === 'person_search', 'intent=person_search'],
        [data.normalized?.type === 'movie', 'type=movie'],
        [arrayIncludes(data.normalized?.directors, 'Christopher Nolan'), 'yönetmen doğru ayrıştırıldı'],
        [arrayIncludes(data.normalized?.genres, 'science fiction'), 'bilim kurgu türü']
      ];
    }
  },
  {
    id: 'casual-typo-comedy',
    suite: 'core',
    query: 'kanka cok dusundurmesin komik bi film olsun ya kafam daginik',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'belirsiz olmayan film tercihi korundu'],
        [arrayIncludes(data.normalized?.genres, 'comedy'), 'komedi türü'],
        [arrayIncludes(data.normalized?.must_have, 'comedy'), 'komedi zorunlu özellik'],
        [/hafif|kolay|komedi|eglenc|kafa/i.test(fold(data.analysis?.summary)), 'özet kolay izlenen komedi niyetini açıklıyor']
      ];
    }
  },
  {
    id: 'negative-horror-constraint',
    suite: 'core',
    query: 'gerilim filmi olsun ama korku, cin ve doğaüstü şeyler olmasın',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [arrayIncludes(data.normalized?.genres, 'thriller'), 'gerilim türü'],
        [!arrayIncludes(data.normalized?.genres, 'horror'), 'korku pozitif türe eklenmedi'],
        [arrayIncludes(data.normalized?.exclude, 'horror'), 'korku exclude alanında'],
        [oneOfArrayIncludes(data.normalized?.exclude, ['supernatural', 'ghost', 'demon', 'paranormal']), 'doğaüstü tema exclude alanında']
      ];
    }
  },
  {
    id: 'similar-breaking-bad-tv',
    suite: 'extended',
    query: '"Breaking Bad" (2008) gibi karakter dönüşümü, suç dünyası ve giderek kararan ahlakı olan diziler öner; kendisini önerme',
    validate(data) {
      return [
        [data.normalized?.intent === 'similar_to_title', 'intent=similar_to_title'],
        [fold(data.normalized?.reference_title) === fold('Breaking Bad'), 'referans=Breaking Bad'],
        [data.normalized?.type === 'tv', 'type=tv'],
        [!hasAnyTitle(data, ['Breaking Bad']), 'referans sonuçlarda tekrarlanmıyor'],
        [matchingTitleCount(data, ['Better Call Saul', 'Ozark', 'Narcos', 'The Sopranos', 'Snowfall', 'Gomorrah']) >= 2, 'en az 2 güçlü Breaking Bad benzeri']
      ];
    }
  },
  {
    id: 'exact-six-episode-crime',
    suite: 'extended',
    minResults: 2,
    query: 'hafta sonu bitecek tam 6 bölümlük sürükleyici suç dizisi',
    validate(data) {
      return [
        [data.normalized?.type === 'tv', 'type=tv'],
        [data.normalized?.episode_count_min === 6, 'minimum bölüm=6'],
        [data.normalized?.episode_count_max === 6, 'maksimum bölüm=6'],
        [arrayIncludes(data.normalized?.genres, 'crime'), 'suç türü']
      ];
    }
  },
  {
    id: 'korean-netflix-romance',
    suite: 'extended',
    minResults: 3,
    query: 'netflixte 2020 sonrası kore yapımı romantik dizi öner',
    validate(data) {
      return [
        [data.normalized?.type === 'tv', 'type=tv'],
        [data.normalized?.country === 'KR', 'country=KR'],
        [data.normalized?.language === 'ko', 'language=ko'],
        [data.normalized?.year_min >= 2020, 'başlangıç yılı 2020 veya sonrası'],
        [arrayIncludes(data.normalized?.genres, 'romance'), 'romantik tür'],
        [fold(data.normalized?.watch_provider) === 'netflix', 'platform=Netflix'],
        [(data.results || []).every(hasRomanceSignal), 'her sonuçta doğrulanabilir romantik hikâye sinyali'],
        [!hasAnyTitle(data, ['Squid Game', 'All of Us Are Dead', 'Bloodhounds', 'Weak Hero']), 'popüler ama romantik olmayan Kore dizileri yok']
      ];
    }
  },
  {
    id: 'actor-with-title-exclusion',
    suite: 'extended',
    query: "Tom Hardy'nin oynadığı aksiyon filmleri ama Venom olmasın",
    validate(data) {
      return [
        [data.normalized?.intent === 'person_search', 'intent=person_search'],
        [data.normalized?.type === 'movie', 'type=movie'],
        [arrayIncludes(data.normalized?.actors, 'Tom Hardy'), 'oyuncu=Tom Hardy'],
        [arrayIncludes(data.normalized?.genres, 'action'), 'aksiyon türü'],
        [oneOfArrayIncludes(data.normalized?.exclude, ['Venom', 'Venom franchise']), 'Venom exclude alanında'],
        [!hasAnyTitle(data, ['Venom', 'Venom: Let There Be Carnage', 'Venom: The Last Dance']), 'Venom filmleri sonuçlarda yok']
      ];
    }
  },
  {
    id: 'turkish-family-comedy',
    suite: 'extended',
    minResults: 1,
    query: 'ailece izlenecek türk yapımı komedi filmi, +18 olmasın',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.country === 'TR', 'country=TR'],
        [data.normalized?.language === 'tr', 'language=tr'],
        [data.normalized?.safety_level === 'family', 'aile güvenlik seviyesi baskın'],
        [arrayIncludes(data.normalized?.genres, 'comedy'), 'komedi türü'],
        [(data.results || []).every(item => isFamilyCertification(item.certification)), 'tüm sonuçlarda doğrulanmış aile yaş derecesi']
      ];
    }
  },
  {
    id: 'vague-boredom-slang',
    suite: 'extended',
    query: 'abi canım sıkıldı saçma sapan bi şey aç da kafa dağıtalım ama çöp olmasın',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'belirsiz istekte varsayılan type=movie'],
        [data.normalized?.quality_profile === 'mainstream', 'erişilebilir ana akım kalite profili'],
        [!/sacma sapan bi sey/i.test(fold(data.analysis?.summary)), 'özet girdiyi aynen tekrarlamak yerine niyeti açıklıyor']
      ];
    }
  },
  {
    id: 'runtime-constraint',
    suite: 'extended',
    minResults: 3,
    query: '90 dakikayı geçmeyen eğlenceli bir film öner',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.runtime_max === 90, 'maksimum süre=90 dakika']
      ];
    }
  },
  {
    id: 'ankara-crime-series',
    suite: 'extended',
    minResults: 1,
    query: "Ankara'da geçen karanlık polisiye dizi istiyorum",
    validate(data) {
      return [
        [data.normalized?.type === 'tv', 'type=tv'],
        [data.normalized?.required_location === 'ankara', 'zorunlu mekân=Ankara'],
        [data.normalized?.country === 'TR', 'country=TR'],
        [arrayIncludes(data.normalized?.genres, 'crime'), 'suç türü'],
        [arrayIncludes(data.normalized?.genres, 'mystery'), 'gizem/polisiye türü']
      ];
    }
  }
];

let selectedCases = cases.filter(testCase => runExtended || testCase.suite === 'core');
if (caseFilter) selectedCases = selectedCases.filter(testCase => testCase.id.includes(caseFilter));

if (listOnly) {
  for (const testCase of selectedCases) console.log(`${testCase.suite.padEnd(8)} ${testCase.id}: ${testCase.query}`);
  process.exit(0);
}

if (selectedCases.length === 0) {
  console.error('Seçilen filtreyle eşleşen test bulunamadı. --list ile testleri görebilirsiniz.');
  process.exit(1);
}

let failedChecks = 0;
let failedCases = 0;
let totalChecks = 0;
const durations = [];

console.log(`SineAI öneri regresyonu: ${selectedCases.length} test (${runExtended ? 'extended' : 'core'})`);
console.log(`Hedef: ${baseUrl}`);

for (const testCase of selectedCases) {
  const startedAt = Date.now();
  let data = {};
  let checks = [];
  let responseStatus = 0;

  try {
    const response = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testCase.query })
    });
    responseStatus = response.status;
    data = await response.json();
    checks = response.ok && data.ok
      ? [...commonChecks(data, testCase), ...testCase.validate(data)]
      : [[false, `HTTP ${response.status}: ${data.error || 'bilinmeyen hata'}`]];
  } catch (error) {
    checks = [[false, `İstek hatası: ${error.message}`]];
  }

  const elapsed = Date.now() - startedAt;
  durations.push(elapsed);
  const failed = checks.filter(([ok]) => !ok);
  totalChecks += checks.length;
  failedChecks += failed.length;
  if (failed.length) failedCases += 1;

  console.log(`\n${failed.length ? 'FAIL' : 'PASS'} [${testCase.id}] (${elapsed} ms, HTTP ${responseStatus || '-'})`);
  console.log(`  Sorgu: ${testCase.query}`);
  console.log(`  Analiz: ${data.analysis?.summary || '-'}`);
  console.log(`  Niyet: ${data.normalized?.intent || '-'} | Tür: ${data.normalized?.type || '-'} | Referans: ${data.normalized?.reference_title || '-'}`);
  console.log(`  İlk 5: ${(data.results || []).slice(0, 5).map(item => item.title).join(', ') || '-'}`);
  for (const [ok, label] of checks) console.log(`  ${ok ? '✓' : '✗'} ${label}`);
}

const sortedDurations = [...durations].sort((a, b) => a - b);
const percentile = ratio => sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * ratio))] || 0;

console.log('\n────────────────────────────────────────');
console.log(`Testler: ${selectedCases.length - failedCases}/${selectedCases.length} başarılı`);
console.log(`Başarısız kontroller: ${failedChecks}/${totalChecks}`);
console.log(`Süre: p50=${percentile(0.5)} ms, p95=${percentile(0.95)} ms, toplam=${durations.reduce((sum, value) => sum + value, 0)} ms`);
console.log(failedChecks ? 'Regresyon başarısız.' : 'Tüm kontroller başarılı.');

process.exitCode = failedChecks ? 1 : 0;
