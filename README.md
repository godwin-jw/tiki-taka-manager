# Tiki-Taka Manager

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Prisma 5 / PostgreSQL
ve NextAuth 4 ile halısaha yönetimi. shadcn/ui (Radix), Lucide, emerald/altın vurgulu
dark glass arayüz; global havuz, profil, matchmaking, raporlama ve liderlik tabloları.

## Sayfalar ve iş kuralları

- `/`: misafir karşılama ekranı veya giriş sonrası dashboard; gol/asist/MOTM ilk 5 ve son 8 maç.
- Global sidebar: tüm kullanıcılar, arama/mevkii filtresi, Google fotoğrafı/fallback,
  altın ≥85 / gümüş ≥75 / bronz <75 OVR; son 5 **global** maç formu yeniden eskiye W/D/L.
  Oyuncu havuzu yalnız giriş yapmış kullanıcılara açılır; e-posta/telefon paylaşılmaz.
- `/profil`: isim, telefon, forma ve mevkii düzenlenebilir. İstatistikler ve OVR salt okunurdur.
  Kaptanlık yükseltmesi ayrı, oturum kontrollü bir action'dır. Telefon yalnız sahibine görünür.
- `/oyuncu/[id]`: havuz kartından açılan herkese açık oyuncu profili. Giriş yapmış kullanıcı,
  **kendisi hariç** başka oyuncuların Hız, Şut, Pas, Dripling, Defans ve Fizik değerlerine 0–99
  arası tam sayı verir. Her kullanıcı–oyuncu çifti için tek değerlendirme tutulur; tekrar gönderim
  yeni oy eklemek yerine mevcut değerlendirmeyi günceller, böylece ağırlık kazandırmaz.
  Telefon/e-posta ve bireysel oylar gösterilmez; yalnız özellik ortalamaları ve oy sayısı paylaşılır.
- `/yeni-mac`: kaptan 4–22 arası çift sayıda oyuncu seçer. En fazla iki kaleci; kaleciler
  karşı takımlara, saha oyuncuları OVR azalan sırada A–B–B–A düzeninde dağıtılır. Eşit OVR'da
  ID ile deterministik sıralama yapılır. Eksik kaleci uyarılır; kaptan tahtada mevkii atayabilir.
  OVR dengesi bu belirtilen heuristiktir; matematiksel olarak en küçük fark garantisi vermez.
- Taktik tahtası: HTML5 sürükle-bırak; oyuncu üzerine bırakınca yer takası, mevkii alanına
  bırakınca taşıma. Mobil/klavye için mevkii seçimi ve takım değişim butonları vardır.
  Kayıtta eşit takım büyüklüğü ve takım başına en fazla bir GK zorunludur.
- `/mac/[id]`: kayıtlı kadro, İstanbul saatinde maç tarihi, sonuç ve onaylı istatistikler.
- `/mac/[id]/rapor`: yalnız maçı oluşturan kaptan. Oyuncu golleri takım skoruna eşit, asist
  toplamı takım skorundan küçük/eşit olmalı. Tam kadro ve bir MOTM zorunludur. Kendi kalesine gol
  ayrı bir olay olarak modellenmemiştir; bu sürümde tüm goller kadrodaki oyunculara yazılır.
- Rapor, koşullu durum güncellemesiyle transaction içinde tek sefer işlenir. Başarısız işlem
  sayaçları değiştirmez; çift gönderim/eşzamanlı istek istatistikleri iki kez artırmaz.
  Onaylı rapor düzenleme/geri alma bu sürümde yoktur.
- Genel OVR topluluk değerlendirmelerinden türetilir: her özellik için oyların ortalaması,
  ardından altı özellik ortalamasının aritmetik ortalaması alınır ve `GlobalPlayerProfile.ovrRating`
  alanına yazılır. Kart rozeti en yakın tam sayıya yuvarlanır. Değerlendirme yoksa eski (geçmişten
  taşınan) sabit değer korunur; maç raporları OVR'yi değiştirmez ve istemci doğrudan OVR gönderemez.
  Maç kadrosu ve taktik tahtası bu güncel OVR değerini kullanır.

Her action sunucuda oturum, izin ve veri kontrolü yapar. React `useActionState`, pending
spinner'ları, Suspense/loading ekranları, boş/hata durumları, klavye odakları ve reduced-motion
desteği bulunur. Global maçlar giriş yapmış tüm oyuncular tarafından görüntülenebilir.

## Yerel kurulum

Komutları proje kökünde çalıştırın. Testler Node.js 24 gerektirir.

1. `.env.example` dosyasını `.env` olarak kopyalayın; mevcut `.env` dosyanızın üzerine yazmayın.
2. PostgreSQL bağlantılarını ve OAuth değişkenlerini doldurun. `DIRECT_URL` migration için
   doğrudan veya session-mode bağlantı olmalıdır; transaction pooler kullanmayın.
3. `npm ci` çalıştırın. `postinstall`, Prisma Client üretir.
4. Aşağıdaki uygun migration yolunu tamamlayın; ardından `npm run dev` çalıştırın.

### Google OAuth

Google Cloud Console → APIs & Services → Credentials → OAuth Client ID → Web application:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
- Production için aynı adresleri HTTPS alan adınızla ayrıca ekleyin.
- Consent screen'i yapılandırın; uygulama Testing durumundaysa test kullanıcılarını ekleyin.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL` ve `NEXTAUTH_SECRET` doldurulmalıdır.
- Secret üretimi: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`
- Secret'ları `NEXT_PUBLIC_` değişkenlerine veya Git'e koymayın.

Giriş noktası `/api/auth/signin`; tek provider Google'dır. Yalnız doğrulanmış e-posta
kabul edilir. Güvensiz e-posta tabanlı hesap birleştirme açık değildir. Google e-postası
değişse bile hesap bağı provider account ID üzerinden korunur.

Yeni kullanıcı ve global profil aynı nested Prisma create işlemiyle oluşturulur.
Oturumlar `Session` tablosundadır; istemciye sadece standart kullanıcı bilgileri, `id`
ve veritabanından okunan güncel `role` eklenir. OAuth tokenları istemciye aktarılmaz.
Eski JWT oturumları bu değişiklik sonrası geçersiz olur; tekrar Google ile giriş gerekir.
`requireUser()` / `requireCaptain()` sunucu kontrolleri için hazırdır. Kaptan rolü,
başkasının maçını düzenleme hakkı vermez: ilgili action ayrıca sahiplik kontrolü yapmalıdır.

## Migration — verileri sıfırlamadan

**Önce yedek alın ve uygulama yazmalarını durdurun.** Migration dosyalarını değiştirmeden
staging'de doğrulayın. `db push`, `migrate reset` veya `--accept-data-loss` kullanmayın.

### Yeni, boş veritabanı

```sh
npm run db:migrate
npm run db:generate
```

### Eski şemaya sahip, migration geçmişi olmayan veritabanı

Önce şemanın baseline ile aynı olduğunu doğrulayın:

```sh
npx prisma migrate diff --from-schema-datasource prisma/legacy.prisma --to-schema-datamodel prisma/legacy.prisma --exit-code
```

Yalnız `No difference detected` / exit code 0 sonucunda baseline'ı uygulanmış işaretleyin:

```sh
npx prisma migrate resolve --applied 20260905000000_baseline
npm run db:migrate
npm run db:generate
npx prisma migrate status
```

Fark varsa **durun**; baseline'ı körlemesine işaretlemeyin. Migration geçmişi zaten varsa
`resolve` işlemini tekrarlamayın; normal `db:migrate` kullanın. Windows'ta Prisma motoru
kilitlenirse Client üretiminden önce bu projenin geliştirme sunucusunu durdurun.

İkinci migration transaction içindedir; eski maç durumlarını enum'a dönüştürürken korur.
Tanımsız eski durum veya geçersiz istatistik varsa veri silmek yerine hata verir.

### Model ve geçiş kararları

- `User.role`: `PLAYER` varsayılan, `CAPTAIN` alternatif. Mevcut grup kaptanları aktarılır.
- `PlayerProfile`: kullanıcı başına tek global profil; fiziksel tablo `GlobalPlayerProfile`.
  Mevkii `GK / DEF / MID / FWD`, forma 1–99 veya boş, OVR 0–99, gol/asist/maç/MOTM sayaçları.
  Yeni profilde henüz hesaplanmamış OVR 0, varsayılan mevkii MID'dir.
- `GroupPlayerProfile`: eski Prisma modelinin yeni adı; fiziksel `PlayerProfile` tablosu ve
  tüm satırları korunur. Grup ekranları bu delegate'i kullanır.
- Mevcut kullanıcılara global profil açılır. Grup sayaçları toplanır, OVR aritmetik ortalaması
  alınır, ilk geçerli ana mevkii korunur. Bu aktarım tek seferliktir; aynı maç geçmişte birden
  fazla gruba kaydedilmişse istatistikler mükerrer olabilir. Yayından önce veriyi inceleyin.
- `Match`: enum durum, skorlar, tarih, oluşturan kullanıcı, rapor tarihi ve ilişkisel kadro.
  Grup bağı yeni global maçlar için opsiyoneldir. Eski `matchDetails` ve `isCompleted` korunur.
- `MatchPlayer`: takım A/B, maçtaki mevkii/OVR, gol/asist ve MOTM. Aynı oyuncu bir maça iki kez
  eklenemez. Partial unique index maç başına en fazla bir MOTM sağlar; MOTM zaten kadrodadır.
- Check constraint'ler ve partial index Prisma 5 şemasında ifade edilemediği için SQL'dedir;
  sonraki migration'larda korunmalıdır.

**Eski veriler:** Eski JSON maç kadroları `MatchPlayer` tablosuna tahmini olarak aktarılmaz;
eski raporlama ekranı kadro bilgisinin üzerine yazdığı için bazı geçmiş maçlarda takım bilgisi
yoktur. Eski grup ekranları artık yalnız grup üyelerine/kaptanına açık **salt okunur arşivdir**.
Eski yazma action'ları kaldırılmıştır; grup kurma/katılma/oylama ve eski maç raporlama yerine
global akış kullanılır. Eski açık maçlar otomatik tamamlanmaz. Yeni maç linkleri global
oluşturucuya, eski rapor linkleri grup arşivine yönlendirilir. Hiçbir eski tablo veya kayıt silinmez.

## Doğrulama

```sh
npm run db:validate
npm run typecheck
npm test
npm run test:db
npm run lint
npm run build
npm audit
```

### Bağımsız yerel integration + tarayıcı testi

```sh
npx playwright install chromium
npm run build
npm run test:local
```

`test:local`, `embedded-postgres` dev bağımlılığıyla geçici PostgreSQL başlatır (55439),
integration ve Chromium testlerini çalıştırır, sonunda kapatıp geçici dizini siler.
Supabase, Google anahtarı veya mevcut `.env` bağlantısını değiştirmek gerekmez.
Tarayıcı testi production build'i 3107 portunda başlatır; sahte Google provider veya
uygulamada auth bypass eklemez. Yalnız test şemasına fixture kullanıcıları ve gerçek DB
oturumları ekler. Gerçek Google OAuth etkileşimi bu testin kapsamı dışındadır.

Kontroller: migration veri koruma, profil whitelist, rol/maç sahipliği, yanlış kadro/skor,
çift kayıt ve eşzamanlı rapor, dashboard, mobil menü/taşma ve tam maç yaşam döngüsü. Ayrıca
0/99 dışı puan reddi, kendini oylama engeli, tekrar oyda güncelleme (mükerrer kayıt yok),
eşzamanlı oylarda OVR tutarlılığı ve eski maçlardaki OVR anlık görüntülerinin korunması.
Ekran görüntüleri `test-results` altında oluşturulur (Git'e dahil edilmez).
Mevcut test PostgreSQL'inizle `TEST_DATABASE_URL` ayarlayarak `npm run test:db` ve
`npm run test:e2e` de kullanabilirsiniz. Testler uygulama şemasını değil kendi rastgele
şemalarını oluşturur/siler; CREATE SCHEMA yetkisi gerekir.

Windows'ta test runner PostgreSQL binary'lerini kullanır; Linux'ta root olmayan kullanıcıyla
çalıştırın. Test için host üzerinde kullanıcı oluşturma seçeneği açılmamıştır.

`test:db`, `TEST_DATABASE_URL` boşsa atlanır. Test için ayrı PostgreSQL veritabanı ve
CREATE SCHEMA yetkisi verin. Test yalnızca rastgele isimli kendi şemasını oluşturur/siler;
baseline → eski test verisi → yeni migration → adapter/constraint doğrulaması çalıştırır.
Test yarıda zorla kesilirse kalan `auth_test_*` şemasını kontrol edip temizleyin.

NextAuth 4'ün opsiyonel `@auth/core` peer'i eski bir sürüme sabitlendiği için `overrides`
ile adapter'ın kullandığı yamalı `0.41.3` sürümüne hizalanmıştır. Sürüm yükseltmelerinde
typecheck, adapter testleri ve audit'i yeniden çalıştırın.

Gerçek OAuth kabul testi: Google giriş → kullanıcı+tek profil+hesap+oturum → çıkış → tekrar giriş
(mükerrer kayıt yok) → sunucuda rol değişimi sonrası oturumda güncel rol → çıkış sonrası koruma.
Bu test gerçek Google anahtarları ve tarayıcı onayı gerektirir.

## Son doğrulamada ortam durumu

Next.js, güvenlik taramasındaki duyuru nedeniyle 16.3.8'e yükseltildi; audit yeniden kontrol edildi.
Supabase bağlantıları kullanıcı tarafından güncellendikten sonra DATABASE_URL ve DIRECT_URL
doğrulandı. Eski şemanın baseline ile birebir eşleştiği kontrol edildi; public tablo verilerinin
JSON snapshot'ı ve eski Prisma şeması Git dışında `.backups` altında saklandı. Bu snapshot
tam bir PostgreSQL/rol/extension yedeği değildir ve hassas hesap verileri içerir; paylaşmayın.
Baseline işaretlendi ve global profil migration'ı uzak veritabanına başarıyla uygulandı.
Eski tablo kayıt sayıları korundu; mevcut kullanıcıların global profilleri ve adapter'ın
hesap/oturum okuma sorguları doğrulandı. `PlayerRating` tablosu ve 0–99 `CHECK` kısıtını ekleyen
`20261003000000_global_player_ratings` migration'ı da uzak veritabanına uygulandı (`migrate status`
çıktısı: "Database schema is up to date"). Geliştirme sunucusu yeniden başlatıldı.
Gerçek Google OAuth akışının son kontrolü tarayıcıdan giriş yapılarak tamamlanmalıdır.

`tenant/user ... not found` yeniden görülürse önce Supabase projesinin aktif olduğunu ve
Connect ekranındaki güncel pooler bağlantılarını doğrulayın. Bu hata bir uygulama kullanıcısının
eksik olduğunu değil pooler bağlantısının reddedildiğini belirtir; çerez silmek veya kullanıcı
oluşturmak bağlantı sorununu çözmez. Bu veritabanında baseline işlemini tekrar uygulamayın.
