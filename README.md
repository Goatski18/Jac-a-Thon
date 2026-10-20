# Jac-a-thon

Installerbar webbapp (PWA) för att planera Jacobs svensexa. Ingen inloggning.

- **Deltagare** öppnar inbjudningslänken (`…/#k=<gruppkod>`). Under planeringen ser de bara Hem (nyheter, fotoalbum, sin jak och sitt mobilnummer). I helgläget ser de också Helgen (släppt schema, praktiskt, bilar, rum), Utlägg och Deltagare.
- **Arrangörer** låser upp arrangörsläget med en PIN-kod (knappen Arrangör längst ner). Där finns översikt, uppgifter, datum, budget, resmål, aktiviteter, hemligt schema och allergier/nödkontakt.

## Filer
- `index.html` – sidan med bilder och stil. `app.js` – all logik.
- `config.js` – Firebase-inställningar. `?demo` i adressen kör appen mot webbläsarens lagring i stället.
- `firestore.rules` – säkerhetsregler att klistra in i Firebase-konsolen (Firestore → Rules).
- `vendor/` – Firebase SDK 10.12.2, lokalt så att appen startar offline. `sw.js` cachar allt.
- `manifest.webmanifest`, `icons/` – installation på hemskärmen. På iPhone tas manifestet bort vid start så att hemskärmsikonen behåller gruppkoden.

## Data
- `g/<gruppkod>/…` – deltagardelen: people, expenses, news, schedule (bara släppta punkter), cars, rooms, settings/meta (phase, startDate, photoUrl), settings/practical.
- `o/<SHA-256(gruppkod + ":" + PIN)>/…` – arrangörsdelen: datevotes, budget, activities, destinations, tasks, schedule (alla punkter), diet, orgsettings.
- Utlägg raderas mjukt (`deleted: true`) och kan återställas. `sharedBy` anger vilka som delar; tomt = alla med status Kommer.
