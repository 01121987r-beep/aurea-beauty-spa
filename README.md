# Aurea Beauty Spa

Demo completa per un centro estetico / beauty spa con:
- app cliente Android-ready in stile mobile-first
- pannello admin web per la gestione centralizzata
- backend/API unico
- database SQLite persistente ed estendibile

## Stack scelto
- `Node.js + Express`
  - un solo server per API, area cliente e area admin
  - semplice da portare online o collegare a Capacitor
- `SQLite + better-sqlite3`
  - perfetto per demo realistica e gestione locale rapida
  - facile da migrare in futuro verso database esterno
- `Frontend web app-first`
  - UX mobile curata e subito wrappabile come app Android
- `Admin web separato`
  - servizi, disponibilità e prenotazioni restano governati centralmente

## Struttura progetto
```text
beauty-spa-booking/
  android/
  docs/
    ARCHITECTURE.md
  public/
    admin/
      index.html
      app.js
      services.html
      services.js
      specialists.html
      specialists.js
      shared.js
      styles.css
    client/
      assets/
        logo-spa.svg
      index.html
      app.js
      styles.css
    index.html
    runtime-config.js
    runtime-config.example.js
  src/
    auth.js
    db.js
    server.js
  package.json
  capacitor.config.json
  README.md
```

## Flusso cliente
- Splash screen animata
- Home con 6 trattamenti in card visuali
- Dettaglio trattamento con immagine, descrizione e benefici
- Selezione giorno disponibile
- Selezione orario disponibile
- Form cliente con privacy obbligatoria
- Riepilogo prenotazione
- Conferma finale
- Area `Le mie prenotazioni`

## Flusso admin
- Login owner
- Agenda appuntamenti filtrabile
- Gestione trattamenti
- Gestione operatrici
- Gestione disponibilità, fasce ed eccezioni
- Cambio stato prenotazioni
- Cambio password admin

## Dati demo inclusi
Trattamenti demo:
- Trattamenti viso
- Trattamenti corpo
- Nails Atelier
- Massaggi relax
- Epilazione silk
- Percorsi benessere

Operatrici demo:
- Giulia Rinaldi
- Marta Leone
- Sofia Conti

Credenziali admin demo:
- username: `admin`
- password: `beauty123`

## API principali
### Cliente
- `GET /api/client/bootstrap`
- `GET /api/client/services`
- `GET /api/client/services/:id`
- `GET /api/client/availability?serviceId=&specialistId=`
- `GET /api/client/bookings?deviceId=`
- `POST /api/client/bookings`

### Admin
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `POST /api/admin/change-password`
- `GET /api/admin/dashboard`
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:id/status`
- `GET /api/admin/availability?specialistId=`
- `PUT /api/admin/availability/:specialistId`
- `POST /api/admin/services`
- `PUT /api/admin/services/:id`
- `DELETE /api/admin/services/:id`
- `POST /api/admin/specialists`
- `PUT /api/admin/specialists/:id`
- `DELETE /api/admin/specialists/:id`

## Avvio locale
Installa dipendenze:
```bash
cd /Users/buscattidocet/Documents/Playground/beauty-spa-booking
npm install
```

Avvia il server:
```bash
npm start
```

Apri:
- cliente: [http://localhost:3200](http://localhost:3200)
- admin: [http://localhost:3200/admin](http://localhost:3200/admin)

## Android
Il progetto è già predisposto per Android tramite Capacitor. Per sincronizzare il frontend nel wrapper Android:
```bash
cd /Users/buscattidocet/Documents/Playground/beauty-spa-booking
npx cap sync android
```

## Stato attuale
Questa base è pronta come demo funzionante e facilmente estendibile per:
- backend online
- notifiche
- associazione futura a operatori/cabine
- autenticazione cliente più forte
- upload immagini reale
