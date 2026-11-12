# Türkçe matematik dersi: bağımsız doğrulama

İlk doğrulama: 2026-11-12. Kapsam: mevcut motor/oyun/simülasyon sözleşmeleri,
`docs/tutorial-examples.json`, ardından ders metni ve etkileşimli örnekler.
Bu inceleme yalnızca bu raporu değiştirir; yazar ve uygulama dosyaları değiştirilmez.

## Doğrulanmış sayısal dayanaklar

- JSON içindeki dört altı-deste senaryosu, iki küçük-ayakkabı hesabı ve iki
  natural olasılığı yeniden hesaplandı: **8/8 eşleşme**. Üretici betiği
  çalıştırılmadı; örnek dosyası yeniden yazılmadı.
- Küçük ayakkabının tam hesabı ayrıca motor yardımcılarını kullanmayan açık
  çekiliş ağacıyla doğrulandı: stand = `-0.5592074592074592`,
  hit = `-0.5780238280238281`, double = `-1.1560476560476562`.
  Tam modelde stand üstünlüğü `0.0188163688163688`; yerine koymalı modelde
  hit üstünlüğü yalnızca `0.0005575271205214` birimdir.
- Taze destede natural: `2 A T / [N(N-1)]`.
  Bir deste: `0.048265460030165915`; altı deste:
  `0.04748948800395746`. Bunlar dağıtım öncesi olasılıklardır.
- Hi-Lo bakımından aynı gözlem, aynı bileşim değildir. Bir desteden bir as
  çıkarılırsa natural `96/2550 = 0.03764705882352941`; bir onluk çıkarılırsa
  `120/2550 = 0.047058823529411764`. Her iki gözlem de running count'u `-1`
  değiştirir ve kalan kart sayısı aynıdır.
- Negatif peek karşı örneği: görünmeyen havuz, kapalı kart dahil
  `[A, T, T, T]`; dağıtıcı açık kartı `T`. Blackjack olmadığı öğrenilince
  oyuncunun sonraki as olasılığı `1/3` olur, `1/4` değil. Kapalı kartı as
  olmayan dokuz eş olasılıklı sıralı dünya sayılarak doğrulandı.
- İkili, bağımsız, eşit ödemeli oyuncakta `p=0.55`: Kelly `f=0.10`,
  beklenen log büyüme `0.005008366846356846`; `f=0.40` için
  `-0.04481180055302866`. Pozitif parasal beklenti aşırı bahiste log
  büyümeyi pozitif yapmaz.
- Sabit birimlik bağımsız `±1` yürüyüşte `p=0.55`, başlangıç `20` birim:
  sonsuz ufukta sıfıra erişim `(0.45/0.55)^20 = 0.018071595021380355`.
  Bu sayı uygulamanın değişken bahisli, sınırlı ufuklu iflas oranı değildir.
- `npm test`: **135/135**, beş test dosyası (yeni `learningMath.test.ts` dahil).
  Bu koşu metin ve arayüz incelemesinin yerini tutmaz.
- `learningMath.ts` ayrıca 31.092 sayısal kontrolden geçti: ödeme varyansı
  doğrudan merkezlenmiş karelerden; natural küçük havuzlarda sırasız çift
  sayımından; Bellman değerleri açık doğrusal denklemden kontrol edildi.

## Ders metni için kısa denetim listesi

1. **ENHC / natural:** Uygulamada kapalı kart ve peek yoktur; dağıtıcı ikinci
   kartını oyuncudan sonra alır. İlk iki kartlık oyuncu natural'ı dağıtıcı
   natural'ına push olur; aksi halde net `1.5` kazanır. Dağıtıcı natural'ı
   double ve split'teki bütün bahisleri alır. Split sonrası iki kartlık 21
   normal eldir; natural değildir. Split asları yalnızca bir kart alır.
2. **Peek koşullaması:** Amerikan negatif-peek modeli anlatılabilir, fakat
   mevcut motorda uygulanmış sayılamaz. Sonlu havuzda yalnız dağıtıcı
   dağılımından blackjack kütlesini silmek yetmez; gizli kart posterior'u
   oyuncunun çekiliş olasılıklarını da değiştirir.
3. **Kart sayımı / avantaj:** Bahis öncesi avantaj, henüz dağıtılmamış bütün
   eller üzerinden beklenen net getiridir. Dağıtılmış `11 vs 6` elindeki
   pozitif double EV'si sayımın avantaj yarattığına kanıt değildir.
   True count yeterli istatistik değildir; kesin bileşimi korumaz.
4. **Bahis birimleri:** Motor EV'si ilk bahis başınadır. Double `±2`, tek
   split ve iki DAS ile toplam `±4` mümkün; natural net `+1.5`, push `0`.
   Genel EV `Σ p_x x`, ikinci moment `Σ p_x x²`; kazanma oranı tek başına
   bu nicelikleri belirlemez. `2 × hit EV` genel double formülü değildir;
   double yalnız bir kart çeker, hit devamında tekrar karar verilebilir.
5. **Split bağımlılığı:** `E[X₁+X₂]=E[X₁]+E[X₂]` bağımsızlık gerektirmez.
   `Var(X₁+X₂)=Var(X₁)+Var(X₂)+2 Cov(X₁,X₂)`; ortak dağıtıcı sonucu
   korunmalıdır. Tam sonlu split, tek el hesabının iki katı değildir.
   Mevcut split yaklaşımı sonraki DAS bahislerinin fonlanabildiğini varsayar.
6. **Kelly:** Genel problem `max_f E[log(1+fX)]`; bütün mümkün sonuçlarda
   `1+fX>0` olmalıdır. `±1` oyuncakta `f*=max(0,2p-1)` (uç durumlar
   ayrıca ele alınır). Küçük bahis Taylor yaklaşımı `μ/E[X²]` verir;
   `μ/Var(X)` küçük avantaj varsayımıyla kullanılan ek bir yaklaşımdır.
   Dağıtılmış elin EV'sinden başlangıç bahis miktarı seçilmez.
7. **İflas:** Sonlu ufuk, sonsuz ufuk, sabit birim bahis, oransal bahis,
   sıfır servet ve minimum bahsi karşılayamama ayrı olaylardır. Sabit
   `±1` yürüyüşte sonsuz ufuk iflası `p≤1/2` için `1`, `p>1/2` için
   `(q/p)^B` olur; bu sonuç değişken bahisli blackjack'e doğrudan taşınamaz.
8. **Model ve istatistik:** `analyzeExact` tek aktif el için sonlu tam
   çözüm sunar; split eylemi üretmez ve bekleyen diğer elleri çözmez.
   `analyze` sabit gözlenen bileşimle yerine koymalıdır. Simülasyon 20
   oturum, 200 başlangıç birimi kullanır; ortalama kârın paydası planlanan
   tur sayısıdır, iflastan sonraki sıfır kârlar dahil. Yaklaşık %95 t aralığı
   19 serbestlik derecelidir; el başına bağımsızlık varsaymaz. Gözlenen
   `ruined/20` sonsuz ufukta kesin iflas olasılığı değildir.

## Metin ve etkileşimli matematik incelemesi

### Düzeltilen bulgu: risk açıklaması seçilen durumu ayırmıyordu

**P2, düzeltildi — `RiskLesson`, deney 06; ilk sürüm satır 37,
güncel `src/LearningLab.tsx:712`.** Sonuç açıklaması ilk sürümde
yalnız `g < 0` koşuluna göre seçiliyordu. İzin verilen `p=0.45, f=0.10`
ayarında parasal oransal beklenti `-0.01`, log büyüme yaklaşık `-0.015059`;
bu negatif avantajlı bir oyundur. Burada açıklama pozitif avantajın aşırı
bahisle bozulmasını seçilen durumun nedeni gibi sunmamalı. Daha açık uç
durum: `f=0` iken `g=0` ve bu oyuncakta servet hiç değişmez; sonlu oturumda
kayıp olasılığı tam `0` olur. İlk sürümün diğer açıklaması yine kayıp
olasılığı olduğunu söylüyordu. Bulgu uygulamanın sorumlusuna iletildi ve
sorumlu tarafından düzeltildi; inceleyici uygulama dosyasını değiştirmedi.

Güncel bileşen, bellekte derlenip beş farklı durum girdisiyle çağrıldı:
`(p,f) = (0.55,0), (0.45,0.10), (0.50,0.10), (0.55,0.40), (0.55,0.10)`.
Üretilen açıklamalar sırasıyla bahis yok, negatif avantaj, sıfır avantaj,
pozitif avantajda aşırı bahis ve pozitif log büyüme durumlarını doğru
ayırıyor. Beş kontrol de geçti. Bu, tarayıcı/lifecycle testi değildir.

### Doğru bulunan bölümler ve kapsam

- `MATHEMATICS_TUTORIAL_TR.md`, **Bölüm 1–5**, ilk sürümde satır 32–224:
  oyun akışı, aslar, natural, nakit hesabı, split gözlem sırası,
  hipergeometrik örnekler, batış sayımı ve EV karşılaştırmaları doğru.
  Özellikle Bölüm 4'teki `13/168`, Bölüm 5'teki `189/309` ve motor
  tabloları kontrol edildi.
- `LearningLab.tsx`, **deney 01–05**: el değerleri, ödeme tablosu,
  natural/Hi-Lo karşı örneği, üç sonuçlu EV/varyans, Bellman `p=1/3`
  eşiği ve tam/yaklaşık motor örneği ilan edilen modellerle uyumlu.
- `learningMath.ts` içindeki dört formül, arayüzün kullandığı sınırlı
  girdiler ve ilan edilen oyuncak modeller için doğru.

Metin ilk beş bölümden sonra henüz tamamlanmamıştı; devam bölümleri hazır
olduğunda kapsam ve bulgular bu bölüme eklenecek. Bu ifade tamamlanmış
kitabın bütünü için onay değildir.

## Tamamlama ve son kontrol notu

Alt ajan kullanım sınırı nedeniyle bağımsız Sol incelemesi kitabın ilk beş bölümü ve atölye formülleriyle sınırlı kaldı. Ana ajan kalan bölümleri tamamladı, taslakta yinelenen bölüm başlıklarını temizledi ve yayımlanan sayısal örnekler için `src/tutorial.test.ts` kontrollerini ekledi. Bu durum bağımsız denetimin bütün metne genişlediği şeklinde yorumlanmamalıdır.

Son kitap 15 sıralı bölüm içerir. Yeni kontroller, dört gerçek motor senaryosunu; aynı küçük destede tam/yaklaşık karar değişimini; elle çizilen üç kartlık krupiye ağacını; bahis, varyans, log-büyüme, t aralığı ve iflas örneklerinin aritmetiğini doğrular. Toplam 143 otomatik test geçmiştir. Türkçe atölyedeki altı deney, negatif/sıfır avantaj ve sıfır bahis uç durumları, Markdown indirme ve mobil taşma tarayıcı testinde ayrıca kontrol edilir.
