# AVD Simulator

Browser-simulator voor het **AVD-deel** (*Verkeersdeelneming*) van het Nederlandse
motorrijexamen. De leerling krijgt een opdracht, rijdt een geanimeerd kruispunt van bovenaf, en
moet de bediening *op het juiste moment* gebruiken. Alles wordt vastgelegd en achteraf
teruggespeeld op een tijdlijn: verwacht venster tegenover wat er werkelijk gebeurde.

Dit is een proof of concept met één scenario: **rechtsaf de Kerkstraat in**, met een snorfiets
in de dode hoek op het fietspad. Negen stappen, waarvan zes kijken.

De voorrang daar volgt uit de afslaanregel: **wie afslaat laat rechtdoorgaand verkeer op dezelfde
weg voorgaan**. Het vrijliggende fietspad hoort bij de Dorpsstraat, dus de snorfiets die rechtdoor
gaat heeft voorrang op de motorrijder die rechtsaf slaat. De haaientanden in de tekening gaan over
iets anders — verkeer dat de Kerkstraat uit komt — en zijn voor deze opdracht decor.

Daaruit volgt ook hoe de snorfiets zich gedraagt: hij mindert **nooit** vaart voor jou. Iemand met
voorrang wijkt niet uit voor iemand die op het punt staat die voorrang te nemen; hij komt gewoon
aan. De scenario-regisseur mag hem alleen laten *bijtrekken* als hij te ver achterop is geraakt,
nooit laten inhouden — zie `minSpeed` in het scenario.

## Draaien

Node 20+ (er staat een `.nvmrc` met 24).

```bash
nvm use && npm install && npm run dev
```

Daarna http://localhost:5273. Chrome is het doelplatform; Firefox en Safari 16+ werken ook.

```bash
npm test        # 32 tests: scoring, perceptie, routegeometrie
npm run build   # typecheck + productiebundel
```

## De kern in zeven ideeën

**1 — Je ziet alleen wat je zelf controleert.** De kaart toont niet de wereld maar wat de
*rijder heeft waargenomen*. Iedere weggebruiker begint onzichtbaar. Een spiegelcontrole onthult
wat er achter je rijdt, een schouderblik de dode hoek. Wat je nooit bekijkt, staat er niet — tot
de herhaling, die wél de hele werkelijkheid toont en de gemiste weggebruiker rood laat
knipperen.

Linker- en rechterspiegel zijn aparte handelingen met aparte kegels. Het gat tussen de
spiegelkegel (|hoek| ≥ 145° achter je) en de schouderblik (0–25 m, 70°–170° rechtsachter) *is* de
dode hoek. Een snorfiets die zo'n vier meter achter je en vier meter opzij rijdt zit rond −131°:
geen spiegel laat hem zien.

Dat levert vanzelf een boog op. Bij de start rijdt de snorfiets vlak achter je in de dode hoek.
Je haalt hem uit, waardoor hij naar achteren zakt en in je rechterspiegel verschijnt — precies op
het moment dat stap 4 van de reeks je daar laat kijken. Zodra je vaart mindert loopt hij weer in,
tot hij bij het insturen opnieuw in de dode hoek zit. Wie de spiegel oversloeg, ziet hem daar voor
het eerst.

**2 — De reeks is de logica, de klok niet.** Vóór de bocht ligt de volgorde vast:

1. blik links — 2. spiegel links — 3. blik rechts — 4. spiegel rechts —
5. schouderblik rechts — 6. richting aangeven — 7. blik links — 8. schouderblik rechts — 9. insturen

Eerst de kant die je verlaat, dan de kant waar je heen gaat, dan de dode hoek, en pas als je wéét
dat het vrij is kondig je het aan. Daarna komt het nog één keer: links om te zien dát er niets
aankomt — verkeer van links moet jou voor laten gaan, maar dat is geen garantie dat het gebeurt —
en als allerlaatste de dode hoek, want de schouderblik hoort de laatste handeling vóór de manoeuvre
te zijn. Wat je bij stap 1 en 5 zag, is tegen die tijd tientallen meters oud.

De vensters van de voorbereidende stappen zijn ruim — zo'n zestig meter, oftewel meerdere seconden
— en ze overlappen elkaar flink. Een blik is geen stopwatch-oefening; je doet hem omdat je iets
wilt weten. Maar **beide grenzen zijn echt**: kijken voordat het kruispunt in zicht is zegt niets
over de bocht die je gaat maken, en te laat kijken laat geen ruimte meer om er iets mee te doen.
Net buiten het venster is een opmerking, ver erbuiten telt het simpelweg niet als voorbereiding.

Wat de reeks werkelijk structureert is de volgorde, die apart beoordeeld wordt: alles goed doen in
de verkeerde volgorde blijft een fout, en de nabespreking noemt welke twee stappen verwisseld waren.
Alleen de laatste twee stappen hebben een krap venster, omdat die echt aan een moment vastzitten.

De tijdlijn staat in de volgorde van de reeks, níét op tijd gesorteerd. Sorteren op wat er
werkelijk gebeurde husselt de genummerde stappen juist door elkaar op de ritten waar de volgorde
misging — precies wanneer je de lijst wilt kunnen aflezen. Een stap uit de pas is een marker die
scheef staat, geen rij die verspringt.

**De richtingaanwijzer is geen kijkvervanger.** Hij gaat pas aan ná de schouderblik: probeer je het
eerder, dan doet de knop niets, verschijnt er "eerst kijken, dan pas aangeven" in beeld, en wordt de
poging als fout vastgelegd. De richtingaanwijzer kondigt een beslissing aan die je al gecontroleerd
hebt; wie eerst aankondigt, legt zich vast op iets wat misschien niet kan.

**3 — Kijken is ook geen tic.** Dezelfde blik elke paar seconden herhalen is normaal; onafgebroken
alles afgaan is geen kijken maar scannen. Een blik die binnen twee seconden op dezelfde blik
volgt, of die de vierde is binnen anderhalve seconde, **telt niet mee als kijken** — hij wordt
weggegooid vóórdat er iets wordt toegerekend, en levert daarbovenop een opmerking of fout op.

Dat laatste is niet decoratief. Zonder die regel kon een leerling simpelweg alle kijkknoppen
roffelen en per ongeluk elk venster raken. Er is een test die precies dat doet: 121 kijkacties,
en elke kijkhandeling komt uit op *gemist*.

**4 — Vensters liggen vast in meters, niet in seconden.** Elke verwachte handeling is
gedefinieerd als "tussen 32 en 12 meter vóór het fietspad". Wie voorzichtig rijdt komt later aan
en mag daar niet voor gestraft worden. Pas achteraf worden die meters via de eigen `s(t)` van de
rit omgerekend naar seconden, zodat de tijdlijn de vensters toont zoals ze voor *deze* rijder
lagen.

**5 — De rit breekt nooit af.** Een gemiste handeling stopt niets. Wie niet instuurt rijdt
rechtdoor en de rit loopt gewoon uit — met een kritieke fout voor een niet-uitgevoerde opdracht.

**6 — Je kijkt vooruit, niet naar beneden.** De kaart is geen platte plattegrond maar een
geprojecteerd wegdek: dichtbij blijft groot en leesbaar, ver weg loopt samen richting een
horizon die net boven het beeld ligt. Dat levert ongeveer 85 meter zicht vooruit op — wat je in
het zadel ook hebt — in plaats van de twintig meter die een strikt bovenaanzicht toelaat. De
camera draait mee met je koers, sterk gedempt: een meedraaiende *plattegrond* is misselijkmakend,
maar een perspectiefbeeld dat níét meedraait staart na de bocht een straat in waar je niet meer
rijdt. Een weggebruiker die je gezien hebt maar die buiten beeld valt — meestal de snorfiets,
die de hele nadering achter je zit — krijgt een pijltje op de beeldrand met de afstand erbij.

**7 — Drie gradaties.** `opmerking` (richtingaanwijzer bleef even aan) → `fout` (helemaal niet
uitgezet) → `kritiek` (een andere weggebruiker moest ingrijpen om een aanrijding te voorkomen,
of een opdracht is niet uitgevoerd). Eén kritieke fout of drie gewone fouten betekent gezakt.

## Instellingen

**Auto-sturen** staat standaard aan: de motor neemt de opdracht-bocht vanzelf. Vergeten te sturen
is geen fout die echte rijders maken, en de oefening gaat over kijken, aankondigen en voorrang.
De stuurbediening is dan inert — er wordt niets vastgelegd, want een dode knop die wel de log
vult zet spookregels in de nabespreking. Zet je het uit, dan stuur je zelf in en rijd je
rechtdoor als je het vergeet, met een kritieke fout voor een niet-uitgevoerde opdracht.

## Oefentempo

Boven de startknop staat een tempokeuze: 0,25× · 0,5× · 0,75× · 1×. De hele simulatie vertraagt
mee, dus de oefening houdt exact dezelfde vorm en het enige dat groeit is je bedenktijd. De
gesimuleerde klok loopt gewoon door in normale seconden, dus een rit op half tempo is regel voor
regel vergelijkbaar met een rit op vol tempo en de beoordeling verandert niet — die kijkt naar
meters vóór het fietspad. Het aftellen loopt bewust wél op echte tijd. Het gekozen tempo staat
op de rit — net als of auto-sturen aanstond — en wordt in de nabespreking genoemd, zodat niemand
een 0,25×-rit met auto-sturen voor een examenrit aanziet. De herhaling heeft daarnaast een eigen snelheid (0,25× / 0,5× / 1×).

## Architectuur

De simulatie draait **buiten React**: een vaste tijdstap van 120 Hz die zijn eigen toestand
muteert en elk frame naar canvas tekent. React rendert alleen de omlijsting en abonneert zich op
een afgeknepen momentopname — een simulatie van 120 Hz mag nooit 120 rerenders per seconde
veroorzaken.

```
src/
  sim/
    types.ts                       Scenario + RunRecord: de twee dingen die pure data zijn
    scenario.rechtsaf-fietspad.ts  Het scenario. Alleen data, geen code
    route.ts                       Booglengte-geparametriseerde route, beide takken
    engine.ts                      Lus, natuurkunde, actoren, opname
    perception.ts                  Kijkkegels en de dodehoekwig
    scoring.ts                     RunRecord → fouten → uitslag (puur, getest)
    replay.ts                      Speelt opgenomen samples af, simuleert niet opnieuw
    recorder.ts                    localStorage en JSON-export
    testDriver.ts                  Headless rijder voor de tests
  render/
    camera.ts                      Perspectiefprojectie op het wegdek, meedraaiende yaw
    paint.ts                       Wereldpolygonen tekenen, clippen achter het oogpunt
    roadArt.ts                     Belijning, haaientanden, fietspad, bebouwing
    drawScene.ts                   Motor, actoren, kijkkegels, randmarkeringen
  ui/        MapView · ControlPanel · BriefingModal · Hud · Debrief · Timeline · RunHistory
             RideSettings · controls.ts (de bedieningscatalogus: label, groep, toets)
  hooks/     useEngine · useControls
```

**Eén ingang voor invoer.** Een knopklik en een toetsaanslag roepen allebei `engine.dispatch`
aan. Niets anders mag de toestand van de engine veranderen; dat is wat de opname compleet en de
herhaling waarheidsgetrouw houdt.

**Herhaling speelt samples af, niet de simulatie.** Een `RunRecord` bevat alles wat nodig is, dus
een opgeslagen rit opent zonder engine en is elke keer identiek.

### Met het oog op de editor

De volgende versie wordt een drag-and-drop scenario-editor met opname en nabewerking. Daarom is
een scenario **pure data** en een rit **pure data**. De editor bewerkt het eerste, de
rit-editor het tweede. Geen enkele component bevat vaste geometrie of timing.

## Het scenario afstellen

De snorfiets doet 25 km/u. Wil hij van *achteren* in de dode hoek komen in plaats van vóór je te
beginnen, dan moet je eigen gemiddelde onder de 25 km/u liggen — vandaar de 30-kilometerzone.

`keepInBlindSpot` in het scenario houdt hem op ~3,5 m achter je binnen een geloofwaardige
snelheidsband, tot je vlak bij het fietspad bent; daarna is het pure natuurkunde. Zet
`enabled: false` voor een strikt deterministische actor met constante snelheid.

De camera zelf is met drie begrijpelijke getallen ingesteld, boven in
[`camera.ts`](src/render/camera.ts): hoeveel meter de bovenrand toont (`aheadM`), hoeveel de
onderrand (`behindM`), en hoe plat het beeld dichtbij is (`NEAR_ASPECT`). Meer zicht naar
achteren kost automatisch scherpte vooruit — dat is de afweging die het perspectief nu eenmaal
oplegt.

Om te zien waar de snorfiets werkelijk zit:

```bash
AVD_TUNE=1 npx vitest run tune
```

Dat drukt per afstand tot het conflictpunt de snelheid, de tussenruimte, de hoek en de afstand
tot de snorfiets af. Zet in de app "Debug-overlay" aan voor dezelfde cijfers tijdens het rijden.

Twee vallen bij het afstellen. De eerste: `targetGap` is de afstand **recht achter je**, gemeten
langs je eigen koers — níét het verschil tussen de twee `distanceToConflict`-waarden. Die twee
meten vanaf verschillende punten (de hartlijn van het fietspad langs een gebogen route tegenover
de rand van de doorkruiste strook langs een rechte), en dat scheelt zo'n drie meter: genoeg om de
snorfiets in plaats van in de dode hoek gewoon in de spiegel te laten belanden.

De tweede: bij een correcte rit onthult de **rechterspiegel** de snorfiets al bij stap 4. Dat is
de bedoeling — wie kijkt, weet meer — maar het betekent dat het "verschijnt plotseling"-moment
alleen optreedt bij wie die spiegel oversloeg. Wil je dat altijd, verklein dan `maxDist` van de
spiegelkegel in `perception.ts`.

### Ontwikkelhulp

`public/dev-driver.js` is een gescript ritje voor in de console, handig om de scène op een exacte
afstand tot het conflictpunt te bekijken zonder twintig seconden mee te rijden:

```js
await import('/dev-driver.js');
__sync.install();
__sync.run(12, { mirrors: 0 });   // rijd tot 12 m vóór het fietspad, zonder spiegelcontrole
__frames(150);                    // laat de camera uitdempen en teken opnieuw
```

Het gebruikt dezelfde `dispatch`-ingang als de UI. De app importeert het niet. `__cam` en
`__frames` zijn dev-only handvatten uit `MapView`: de camera is de enige toestand die noch in de
engine noch in React zit, en een browser die animatieframes afknijpt (een verborgen tab) maakt
het anders onmogelijk om een frame gecontroleerd te laten uitdempen.
