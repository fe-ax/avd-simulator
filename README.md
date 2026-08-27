# AVD Simulator

Twee oefeningen: **Rechtsaf de Kerkstraat in** (afslaan over een vrijliggend fietspad) en
**Invoegen op de A12** (van de oprit het gat in tussen een auto vóór je en een vrachtwagen achter
je). Je kiest ze in de briefing, vóór elke rit.

Browser-simulator voor het **AVD-deel** (*Verkeersdeelneming*) van het Nederlandse
motorrijexamen. Je zit op de motor, kijkt met de muis om je heen, en moet de bediening op het
juiste moment gebruiken. Alles wordt vastgelegd en achteraf teruggespeeld — van bovenaf, of
opnieuw vanuit het zadel met je eigen hoofdbewegingen erbij.

Eén scenario: **rechtsaf de Kerkstraat in**, met een snorfiets in de dode hoek op het fietspad.
Negen stappen, waarvan zes kijken.

## Draaien

Node 20+ (er staat een `.nvmrc` met 24).

```bash
nvm use && npm install && npm run dev
```

Daarna http://localhost:5273. Chrome is het doelplatform.

```bash
npm test        # 57 tests: scoring, perceptie, volgorde, routegeometrie
npm run build   # typecheck + productiebundel
```

## Waarom eerste persoon

De vorige versie was een bovenaanzicht en werkte, maar leerde het verkeerde. Kijken was
*gemodelleerd*: zes met de hand geschreven kijkkegels bepaalden wat de rijder had "waargenomen",
de dode hoek was het gat tussen twee getallen, en een spiegelcontrole was een knop die een sprite
onthulde. Elke afstelronde ging over waar de rand van een abstractie hoorde te liggen — is de
spiegelkegel nu 145 of 148 graden — omdat die abstractie het werk deed dat het beeld hoorde te
doen.

In eerste persoon volgt dat allemaal uit meetkunde. De dode hoek is het gebied dat je spiegels
niet bereiken. Een spiegel laat zien wat er achter je is omdat er een tweede camera staat.
Wegkijken kost je de weg, omdat je met je hoofd over je schouder de weg vóór je werkelijk niet
ziet. Er hoeft niets verklaard te worden.

De simulatiekern is ongewijzigd meegekomen: engine, scoring, volgorderegel, scenario, opname en
herhaling wisten nooit wat een beeld was.

## De kern

**1 — Kijken doe je met de muis, en het is een richting.** Klik in beeld (of sleep) en je hoofd
draait mee, tot 140° opzij en 45° op en neer. Je hoeft nergens op te mikken: het hele gebied
telt. Alles voorbij 60° naar rechts *is* een schouderblik rechts, alles opzij-en-omlaag is die
spiegel, alles opzij-en-vlak is een blik. Zestig graden, omdat je vooruitzicht al 31° bestrijkt —
verder dan dat kwam gewoon vooruitkijken nooit, dus dan heb je je écht omgedraaid.

Houd zo'n richting ongeveer een derde seconde vast en de controle registreert. Die wachttijd is
wat het eerlijk maakt: je hoofd in één zwaai langs alles halen registreert niets, want nergens is
op blijven hangen. Dat is een veel beter antwoord op scannen dan de strafteller die het verving.

De stippen laten zien waar een gebied zijn hart heeft; het gebied eromheen doet het werk. Je
hoofd blijft staan waar je het laat — het veert niet terug naar de weg, want een beeld dat uit
zichzelf beweegt terwijl jij nog aan het kijken bent, is niet te onderscheiden van je eigen
sturen. Je ogen weer op de weg krijgen is jouw werk.

Onder in beeld staat een strook met de zes controles. Die *rapporteert* — hij vertelt niet wat je
nu moet doen.

Snelheid, versnelling en je richtingaanwijzers staan op de teller van de motor zelf, niet in een
hoekje van het scherm. Hij zit zo'n 24° onder je oogpunt: aflezen is een blik omlaag naar de
machine, precies het kleine prijskaartje dat het op de weg ook heeft. Boven de limiet kleurt de
snelheid rood. De pijlen zijn de enige manier om te zien dát je richting aangeeft — vanuit het
zadel zie je je eigen knipperlichten niet.

**Kijken en zien zijn niet hetzelfde.** Het gebied rekent je aan dát je je omdraaide; hoe ver je
draaide bepaalt wat je zág. Te ver doordraaien is net zo blind als niet ver genoeg, en de
nabespreking zegt welke van de twee het was.

**2 — De spiegels zijn echt.** Elke spiegel rendert de scène opnieuw vanuit het gereflecteerde
oogpunt. Wat erin staat is wat een spiegel onder die hoek zou laten zien. Gemeten, niet gekozen:

```
    10 m achter je  ZICHTBAAR        4 m achter je  ZICHTBAAR
     9 m achter je  ZICHTBAAR        2 m achter je  dode hoek
     6 m achter je  ZICHTBAAR        0 m achter je  dode hoek
```

Die tweede kolom *is* de dode hoek. Er is nergens een constante voor en niets bepaalt hem — het
is simpelweg waar de reflectie ophoudt te reiken.

Een spiegel is wazig tot je ernaar kijkt: je ziet dát er iets is, niet wát het is. Zonder
eye-tracking is dat de enige manier waarop een spiegelcontrole een handeling blijft in plaats van
gratis informatie.

**3 — De reeks is de logica, de klok niet.** Vóór de bocht ligt de volgorde vast:

1. blik links — 2. spiegel links — 3. blik rechts — 4. spiegel rechts —
5. schouderblik rechts — 6. richting aangeven — 7. blik links — 8. schouderblik rechts — 9. insturen

Eerst de kant die je verlaat, dan de kant waar je heen gaat, dan de dode hoek, en pas als je wéét
dat het vrij is kondig je het aan. Daarna nog één keer links, en als allerlaatste de dode hoek,
want de schouderblik hoort de laatste handeling vóór de manoeuvre te zijn.

De vensters zijn ruim en overlappen elkaar, maar **beide grenzen zijn echt**: kijken voordat het
kruispunt in zicht is zegt niets over de bocht, en te laat kijken laat geen ruimte om er nog iets
mee te doen. De volgorde wordt apart beoordeeld.

De richtingaanwijzer werkt pas ná de eerste schouderblik. Probeer je het eerder, dan doet de knop
niets en verschijnt er "eerst kijken, dan pas aangeven".

**4 — Vensters liggen vast in meters, niet in seconden.** Wie voorzichtig rijdt komt later aan en
mag daar niet voor gestraft worden. Pas achteraf worden die meters via de eigen `s(t)` van de rit
omgerekend naar seconden.

**5 — De rit breekt nooit af.** Drie gradaties: `opmerking` → `fout` → `kritiek` (een andere
weggebruiker moest ingrijpen). Eén kritieke fout of drie gewone betekent gezakt.

## Wat de meetkunde vanzelf oplevert

De hele leerboog volgt uit het beeld, zonder dat iets hem uitspreekt:

```
    volledige reeks     snorfiets voor het eerst gezien op   8,1s   (de rechterspiegel, stap 4)
    zonder spiegels                                         15,5s   (de schouderblik, stap 8)
    zonder te kijken                                        17,0s   (als hij je al is gepasseerd)
```

En een schouderblik over de verkéérde schouder onthult niets, omdat links kijken je niets vertelt
over wat rechts van je gebeurt. Dat staat nergens als regel.

Diezelfde meetkoppeling geldt voor de spiegels. Hoe schuin het glas staat is geen gekozen getal
meer maar een berekening uit de plek van je oog: verhoog de zithouding tien centimeter en hetzelfde
stukje glas kijkt zes graden verder omlaag, naar het asfalt in plaats van naar het verkeer erop.
Nu volgt de stand van het glas het oog, en een controle in de renderer klaagt als de gerenderde
richting alsnog van `MIRROR_VIEW` afdrijft — in richting, in breedte én in hoogte.

## Instellingen

**Auto-sturen** staat standaard aan: vergeten te sturen is geen fout die echte rijders maken.
Uit betekent dat je zelf instuurt en rechtdoor rijdt als je het vergeet.

**Oefentempo** 0,25× tot 1×. De hele simulatie vertraagt mee, dus de oefening houdt dezelfde vorm
en het enige dat groeit is je bedenktijd. De gesimuleerde klok loopt in normale seconden, dus de
beoordeling verandert niet. Beide instellingen staan op de rit en worden in de nabespreking
genoemd.

## Nabespreking

Standaard van bovenaf: dat is de enige plek waar "hier reed de snorfiets die je nooit gezien
hebt" te laten is. Met een schakelaar terug het zadel in, met je eigen hoofdbewegingen erbij — het
kruisje staat dan letterlijk waar je keek. Scrub naar het moment dat de snorfiets moest remmen en
kijk waar je aandacht was.

## Architectuur

De simulatie draait **buiten React** met een vaste tijdstap van 120 Hz. React rendert alleen de
omlijsting.

```
src/
  sim/                    beeldonafhankelijk: engine, scoring, scenario, opname, herhaling
    roadSurfaces.ts       de weg als pure polygonen — de enige bron die beide beelden lezen
    perception.ts         het gerenderde zicht beschreven, niet een model ervan
    scenario.*.ts         het scenario. Alleen data
  scene/                  three.js
    Stage.ts              renderer en de camerarig: bike → head → camera
    buildWorld.ts         weg, berm, bebouwing uit roadSurfaces
    rider.ts              stuur, spiegelsteunen, armen, schouders
    head.ts               muisbesturing, draaigrenzen, terugveren naar de weg
    mirrors.ts            spiegelcamera's, reflectie, focus
    gazeTargets.ts        de stippen en de wachttijd
  render/                 het bovenaanzicht, nu het nabesprekingsbeeld
  ui/                     RideView · MapView · CheckStrip · Debrief · Timeline · ...
```

**Twee naden dragen het geheel.** `roadSurfaces` bepaalt waar elke markering ligt en beide
renderers lezen hem, dus ze kunnen het niet oneens worden. En `perception.ts` beschrijft hetzelfde
zicht dat three.js rendert — de renderer waarschuwt in dev als de twee uit elkaar lopen.

## Afstellen

De scherpste getallen en waar ze vandaan komen:

| Wat | Waarde | Waarom |
|---|---|---|
| Spiegelhoek | 0° uitgedraaid | Het oog zit binnenboord van het glas, dus een recht gemonteerde spiegel kijkt al 26° naar buiten. Verder uitdraaien richt hem naast de weg |
| Spiegelveld | 40° | Bolle spiegel. Hoe bol bepaalt hoe groot de dode hoek is |
| Schouderdrempel | 60° | Vooruitzicht bestrijkt 31°; daarbuiten heb je je werkelijk omgedraaid |
| Stip schouder | 102° | Waar het gebied zijn hart heeft. Verder naar achteren kijkt langs de dode hoek heen |
| Wachttijd | 0,3 s | Lang genoeg dat langs vegen niets doet, kort genoeg om niet plakkerig te voelen |

Om te zien waar de snorfiets werkelijk rijdt:

```bash
AVD_TUNE=1 npx vitest run tune
```

### Pauzeren

Zet **Debug-overlay** aan en er verschijnt boven in beeld een regel met `⏸ Pauze`, `+0,1s` en
`+1s`. Pauze bevriest de gesimuleerde tijd terwijl het beeld blijft draaien, dus je kunt rustig
rondkijken in een moment dat normaal een zestigste seconde duurt. De stapknoppen zetten de tijd
met de hand vooruit — de manier om te zien wat er precies gebeurt op 5, 6 en 7 seconden.

De regel eronder toont afstand tot het conflictpunt en waar de snorfiets rijdt: hoeveel meter
achter je, onder welke hoek, en wat hij aan het doen is.

### Ontwikkelhulp

`public/dev-driver.js` is een gescript ritje voor in de console:

```js
await import('/dev-driver.js');
__sync.install();
__sync.run(20, { mirrors: 0 });   // rijd tot 20 m vóór het fietspad, zonder spiegelcontrole
__frames3d(30);                   // teken frames zonder op de browser te wachten
```

`__stage`, `__head`, `__gaze` en `__cam` zijn dev-only handvatten. De app importeert ze niet.

## Bekende beperkingen

- **Pointer lock werkt niet overal.** Sommige omgevingen melden een geslaagde vergrendeling en
  nemen hem nooit. Slepen werkt daar wel, en werkt altijd.
- **De bundel is groot** (~700 kB) doordat three.js er in zijn geheel in zit. Voor een lokale
  oefenomgeving prima; voor uitlevering zou je hem willen opsplitsen.
- **Op grote afstand is het kruispunt matig leesbaar.** Vlak asfalt op veertig meter geeft weinig
  prijs. Wat er staat helpt wel: stoepranden staan omhoog en houden op bij de zijweg, op elke hoek
  staat een lantaarnpaal, en het rood van het fietspad stopt bij de oversteek en gaat over in
  blokmarkering — precies het teken dat je een fietspad kruist in plaats van erlangs rijdt. Verdere
  aankleding is nog te doen.
- **Touchbediening is buiten scope.** Kijken vraagt een muis.
