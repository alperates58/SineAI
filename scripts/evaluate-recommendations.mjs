const baseUrl = process.env.SINEAI_BASE_URL || 'http://127.0.0.1:3300';

const cases = [
  {
    query: 'beyin yakan film istiyorum',
    validate(data) {
      const topTitles = (data.results || []).slice(0, 8).flatMap(item => [item.title, item.original_title].filter(Boolean));
      const strongMatches = ['Inception', 'Memento', 'Predestination', 'The Prestige', 'Coherence']
        .filter(title => topTitles.includes(title));
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.must_have?.includes('mind bending'), 'mind bending zorunlu tema'],
        [strongMatches.length >= 3, 'ilk 8 içinde en az 3 güçlü zihin oyunu eşleşmesi'],
        [!topTitles.some(title => ['3 Aptal', 'Kefaret', "Cadılar Bayramı 4: Michael Myers'ın Dönüşü"].includes(title)), 'bilinen alakasız sonuçlar yok']
      ];
    }
  },
  {
    query: 'Dark gibi gizemli bir dizi istiyorum',
    validate(data) {
      return [
        [data.normalized?.intent === 'similar_to_title', 'intent=similar_to_title'],
        [String(data.normalized?.reference_title).toLowerCase() === 'dark', 'referans=Dark'],
        [data.normalized?.type === 'tv', 'type=tv'],
        [!(data.results || []).some(item => String(item.title).toLowerCase() === 'dark'), 'referans sonuçlarda tekrarlanmıyor']
      ];
    }
  },
  {
    query: 'çocuklarla izlenecek komik animasyon filmi',
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.quality_profile === 'family', 'aile profili'],
        [data.normalized?.genres?.includes('animation'), 'animasyon türü'],
        [data.normalized?.genres?.includes('comedy'), 'komedi türü']
      ];
    }
  },
  {
    query: 'tek mekanda geçen gerilim filmi',
    validate(data) {
      const topTitles = (data.results || []).slice(0, 6).flatMap(item => [item.title, item.original_title].filter(Boolean));
      const strongMatches = ['Exam', 'Buried', 'Den skyldige', 'The Guilty', 'Locke', 'Phone Booth', '10 Cloverfield Lane', 'Cube']
        .filter(title => topTitles.includes(title));
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.genres?.includes('thriller'), 'gerilim türü'],
        [data.normalized?.must_have?.includes('single location'), 'tek mekân zorunlu tema'],
        [strongMatches.length >= 3, 'ilk 6 içinde en az 3 güçlü tek mekân gerilimi']
      ];
    }
  },
  {
    query: "Christopher Nolan'ın yönettiği bilim kurgu filmleri",
    validate(data) {
      return [
        [data.normalized?.type === 'movie', 'type=movie'],
        [data.normalized?.directors?.includes('Christopher Nolan'), 'yönetmen doğru ayrıştırıldı'],
        [data.normalized?.genres?.includes('science fiction'), 'bilim kurgu türü']
      ];
    }
  }
];

let failures = 0;

for (const testCase of cases) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: testCase.query })
  });
  const data = await response.json();
  const checks = response.ok && data.ok ? testCase.validate(data) : [[false, `HTTP ${response.status}`]];
  const failed = checks.filter(([ok]) => !ok);
  failures += failed.length;

  console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${testCase.query} (${Date.now() - startedAt} ms)`);
  console.log(`  Analiz: ${data.analysis?.summary || '-'}`);
  console.log(`  Kaynak: ${data.analysis?.model || data.analysis?.provider || '-'}${data.analysis?.fallback ? ' (fallback)' : ''}`);
  console.log(`  İlk 5: ${(data.results || []).slice(0, 5).map(item => item.title).join(', ') || '-'}`);
  for (const [ok, label] of checks) console.log(`  ${ok ? '✓' : '✗'} ${label}`);
}

console.log(`\n${failures ? `${failures} kontrol başarısız.` : 'Tüm kontroller başarılı.'}`);
process.exitCode = failures ? 1 : 0;
