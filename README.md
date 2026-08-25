# AVD Simulator

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

**1 — Kijken doe je met de muis.** Klik in beeld (of sleep) en je hoofd draait mee, tot 140°
opzij en 45° op en neer. Op elke plek die gecontroleerd moet worden zweeft een grijze stip: houd
het kruisje er ongeveer een derde seconde op en hij registreert, licht groen op, en dooft weer
uit naarmate de informatie veroudert.

Die wachttijd is wat het eerlijk maakt. Je hoofd langs alle stippen vegen registreert er geen
enkele, want op geen ervan is blijven hangen. Dat is een veel beter antwoord op scannen dan de
strafteller die het verving: je kunt niet naar zes dingen tegelijk kijken, en nu kun je ook niet
meer doen alsof.

Onder in beeld staat een strook met de zes controles. Die *rapporteert* — hij vertelt niet wat je
nu moet doen.

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
| Registratiehoek | 5° | De dichtstbijzijnde twee stippen komen tot 12,4° van elkaar; 10° diameter houdt 2,4° marge |
| Schouderrichting | 102° | Verder naar achteren en het veld stopt bij 86°, net vóór waar de snorfiets op het beslissende moment rijdt |
| Wachttijd | 0,3 s | Lang genoeg dat langs vegen niets doet, kort genoeg om niet plakkerig te voelen |

Om te zien waar de snorfiets werkelijk rijdt:

```bash
AVD_TUNE=1 npx vitest run tune
```

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
- **Op grote afstand is het kruispunt zwak leesbaar.** Vlak asfalt op veertig meter geeft weinig
  prijs. Stoepranden staan al omhoog en dat helpt; verdere aankleding is nog te doen.
- **Touchbediening is buiten scope.** Kijken vraagt een muis.
