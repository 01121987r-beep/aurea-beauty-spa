# Architettura Aurea Beauty Spa

## Obiettivo
Costruire una demo premium per centro estetico / spa con flusso cliente semplice e gestione centralizzata lato admin.

## Visione architetturale
- `public/client`
  - esperienza mobile-first per il cliente
  - tutte le informazioni arrivano da API
- `public/admin`
  - pannello gestionale desktop-oriented
  - CRUD trattamenti, operatrici, disponibilità e prenotazioni
- `src/server.js`
  - orchestration layer per cliente e admin
- `src/db.js`
  - schema, seed demo e logica disponibilità

## Data flow
1. L’admin configura trattamenti, operatrici e fasce orarie.
2. Il backend salva tutto in SQLite.
3. L’app cliente interroga le API e mostra solo i trattamenti attivi.
4. Alla scelta del trattamento, il backend restituisce i giorni prenotabili e gli slot realmente liberi.
5. Alla conferma, la prenotazione viene salvata con stato `confirmed` e legata a un `customer_device_id`.
6. L’area cliente rilegge dal backend le prenotazioni del dispositivo.

## Modelli dati
### shop_settings
Impostazioni del centro.
- `shop_name`
- `tagline`
- `logo_url`
- `phone`
- `email`
- `address`
- `city`
- `opening_note`

### services
Catalogo trattamenti.
- `name`
- `category`
- `description`
- `benefits`
- `duration_minutes`
- `price`
- `image_url`
- `icon`
- `active`
- `featured_home`
- `sort_order`

### specialists
Anagrafica team beauty.
- `name`
- `role`
- `bio`
- `photo_url`
- `active`

### specialist_services
Relazione molti-a-molti tra trattamenti e operatrici.

### availability_rules
Disponibilità settimanale per operatrice.
- `weekday`
- `label`
- `start_time`
- `end_time`
- `active`

### availability_exceptions
Chiusure, ferie o blocchi temporanei.
- `date_from`
- `date_to`
- `start_time`
- `end_time`
- `scope`
- `note`

### manual_slot_blocks
Blocco puntuale di slot singoli.
- `booking_date`
- `slot_time`
- `reason`

### bookings
Prenotazioni cliente.
- `booking_token`
- `service_id`
- `specialist_id`
- `booking_date`
- `booking_time`
- `end_time`
- `customer_name`
- `customer_phone`
- `customer_email`
- `customer_note`
- `privacy_consent`
- `customer_device_id`
- `status`
- `source`

## Regole business implementate
- solo i trattamenti attivi sono visibili lato cliente
- la disponibilità dipende dalle regole admin e dalle prenotazioni già confermate
- gli slot sono a intervalli di 30 minuti
- un trattamento viene associato alla prima operatrice attiva collegata, lasciando aperta l’estensione futura a scelta operatrice/cabina
- niente doppie prenotazioni sullo stesso slot
- il cliente deve accettare il consenso privacy per confermare

## Evoluzioni previste
- scelta esplicita dell’operatrice lato cliente
- associazione a cabine o stanze
- notifiche push o locali
- backend online e storage immagini reale
- login cliente / storico avanzato
