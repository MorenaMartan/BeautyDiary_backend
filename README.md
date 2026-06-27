# BeautyDiary Backend

Express/Node.js API za BeautyDiary aplikaciju spojen na MongoDB.

Podaci se spremaju u MongoDB kroz Mongoose modele. Datoteke u `data/` služe samo kao početni seed podaci.

## Pokretanje

```bash
npm install
npm run seed
npm start
```

Server se pokreće na:

```text
http://localhost:3000
```

Ako koristiš lokalni MongoDB, može ostati default vrijednost:

```text
mongodb://127.0.0.1:27017/beautydiary
```

MongoDB Atlas connection string je postavljen u `.env`. Prije pokretanja samo zamijeni `<db_password>` stvarnom lozinkom korisnika `mmartan_db_user`:

```text
PORT=3000
MONGODB_URI=mongodb+srv://mmartan_db_user:<db_password>@cluster0.wqgwemc.mongodb.net/beautydiary?appName=Cluster0
```

Ako lozinka ima posebne znakove, treba ih URL-encodeati prije upisa u URI.

## Struktura

```text
server.js                 glavna Express aplikacija
db.js                     MongoDB konekcija i helperi
models/                   Mongoose modeli za MongoDB kolekcije
data/                     početni seed podaci
controllers/              logika za svaku karticu/funkcionalnost
routes/                   API rute
middleware/roles.js       jednostavna provjera admin role
utils/time.js             pomoćne funkcije za raspored i zauzete termine
scripts/seed.js           puni MongoDB početnim podacima
```

## Glavne rute

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `GET /api/clients`
- `GET /api/clients/stats`
- `POST /api/clients`
- `PATCH /api/clients/:id`
- `POST /api/clients/:id/diary`
- `GET /api/employees`
- `POST /api/employees` - samo admin (`x-user-role: Admin`)
- `GET /api/employees/specialties`
- `POST /api/employees/specialties` - samo admin
- `GET /api/treatments`
- `POST /api/treatments` - samo admin
- `GET /api/appointments`
- `GET /api/appointments/availability?date=2026-04-06&treatment=massage`
- `POST /api/appointments`
- `PATCH /api/appointments/:id/cancel`
- `GET /api/product-orders`
- `POST /api/product-orders/:employee`
- `PATCH /api/product-orders/:employee/:index`
- `DELETE /api/product-orders/:employee/:index`
- `GET /api/reviews`
- `POST /api/reviews/:employee`
- `GET /api/sales/daily?date=2026-04-06`
- `GET /api/sales/monthly?month=2026-04`
- `GET /api/sales/treatments`

Admin akcije šalju header:

```text
x-user-role: Admin
```
