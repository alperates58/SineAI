# SineAI

SineAI, doğal dille yazdığınız isteklere uygun film ve dizi önerileri sunan yapay zeka destekli bir web uygulamasıdır. Kullanıcıların girdiği "Karanlık atmosferli, zeka işi bir dizi öner" gibi cümleler AI tarafından normalize edilir ve The Movie Database (TMDB) API'si kullanılarak en uygun sonuçlar sunulur.

## Gereksinimler

- Node.js 20+
- Docker ve Docker Compose (Opsiyonel, Coolify ile deploy için)

> **Not:** AI tarafından üretilen genre (tür) string'leri, backend üzerinde otomatik olarak TMDB genre ID'lerine (örn: action -> 28) çevrilerek arama filtrelerine dahil edilir.

## Lokal Çalıştırma

1. Projeyi indirin.
2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
3. `.env.example` dosyasını kopyalayarak `.env` dosyası oluşturun ve içerisindeki anahtarları yapılandırın. Özellikle `TMDB_API_KEY` ve tercih ettiğiniz `AI_PROVIDER` için gerekli anahtarları girin.
4. Uygulamayı başlatın:
   ```bash
   npm start
   ```

## Ortam Değişkenleri (.env) Kurulumu

Proje, sırları korumak adına `.env` dosyası kullanmaktadır. **Lütfen API anahtarları gibi secret değerleri hiçbir zaman GitHub'a yüklemeyin (.gitignore içerisinde .env mevcuttur).** 

- `AI_PROVIDER`: `mock`, `deepseek`, `openai` veya `gemini` olabilir. (Varsayılan: `mock`)
- `PORT`: Uygulamanın dinleyeceği port (Varsayılan: `3000`)
- `TMDB_API_KEY`: TMDB platformundan alınan V3 API anahtarı.

## Gelişmiş Özellikler (v2)

- **Platform Rozetleri (Watch Providers)**: TMDB `/watch/providers` API'si kullanılarak, önerilen film ve dizilerin Türkiye (TR) bölgesinde hangi platformlarda (Netflix, Prime Video, BluTV vb.) izlenebileceği kartların üzerinde badge olarak gösterilir.
- **Fragman Desteği**: TMDB `/videos` API'si üzerinden YouTube fragmanları çekilir ve sonuç kartlarında/modallarda "Fragmanı Aç" butonu olarak yer alır.
- **Kişi Arama & Gelişmiş Filtreler**: Kullanıcı "Christopher Nolan filmleri" gibi sorgular yaptığında, ilgili kişi `search/person` ile bulunup filtrelemeye dahil edilir. AI, puan, yıl ve süre limitlerini anlayarak TMDB API filtrelerine çevirir.
- **Android TV Uyumu**: Arayüz, akıllı televizyonlarda (Android TV) kumanda ile gezinmeye uygun hale getirilmiştir. Kartlar, butonlar ve detay modalları `tabindex="0"` ve `:focus-visible` ile donatılarak yön tuşları ile kontrol edilebilir bir deneyim sunar. Ek olarak, detay modalı iki kolonlu premium bir görünüme kavuşturulmuş; eserlerin süresi (runtime), yönetmen/yaratıcı bilgileri ve ait oldukları kategoriler rozetler halinde modal içine entegre edilmiştir.
- **Sesli Arama (Voice Search)**: Web Speech API kullanılarak arama kutusuna konuşarak metin yazdırılabilir.
  > **Gizlilik/Güvenlik**: Web sürümünde sesli arama, tarayıcının Web Speech API desteğine bağlıdır. İleride mobil/Android TV sürümüne geçildiğinde Native Speech Recognizer ile değiştirilebilir.

## Docker Build / Test

```bash
docker build -t sineai .
docker run -p 3000:3000 --env-file .env sineai
```

## Coolify Deploy Notları

- SineAI, Coolify veya Traefik üzerinden deploy edilmeye uygun olarak tasarlanmıştır.
- `docker-compose.yml` dosyasında host portları açılmamıştır. Yalnızca `expose: "3000"` tanımlanmıştır.
- Container'ın iç portu (Container Port) her zaman **3000** olarak yapılandırılmalıdır.
- Network olarak dışarıdan `coolify` ağına entegre edilmiştir.

## Kod Kalitesi ve Kontroller

`server.js`'deki olası hataları bulmak için şu komutu çalıştırabilirsiniz:
```bash
npm run check
```

---

*Bu ürün TMDB API kullanır ancak TMDB tarafından onaylanmamış veya sertifikalandırılmamıştır.*
