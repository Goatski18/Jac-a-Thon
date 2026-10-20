# Jac-a-thon

Installerbar webbapp (PWA) för att planera Jacobs svensexa. Ingen inloggning: åtkomst via en hemlig gruppkod i inbjudningslänken (`…/#k=<kod>`).

- `index.html` – hela appen (flikar: översikt, deltagare, datum, budget, resmål, aktiviteter, uppgifter, utlägg)
- `config.js` – Firebase-inställningar. Är den `null` körs appen i demoläge (data bara i webbläsaren).
- `firestore.rules` – säkerhetsregler att klistra in i Firebase-konsolen (Firestore → Regler).
- `manifest.webmanifest`, `sw.js`, `icons/` – gör att appen kan installeras på hemskärmen.

Data lagras i Firestore under `g/<gruppkod>/<samling>/<id>`. En ny grupp fylls automatiskt med startdata (arrangörer, resmål, aktiviteter, uppgifter).
