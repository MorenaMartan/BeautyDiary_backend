# BeautyDiary – backend

Backend web aplikacije izrađene u sklopu završnog rada „BeautyDiary – web aplikacija za naručivanje, evidenciju i praćenje potrošnje klijenata kozmetičkog salona“.

**Autor:** Morena Martan

**Mentor:** izv. prof. dr. sc. Nikola Tanković

**Ustanova:** Sveučilište Jurja Dobrile u Puli, Fakultet informatike

**Godina:** 2026.

## O projektu

BeautyDiary je web aplikacija namijenjena digitalizaciji poslovanja kozmetičkog salona. Sustav objedinjuje upravljanje klijentima, zaposlenicima, tretmanima, terminima, recenzijama, potrošnjom i narudžbama proizvoda te omogućuje praćenje rada salona iz uloga klijenta, kozmetičara i administratora.

Ovaj repozitorij sadrži REST API, poslovnu logiku, modele podataka i autentikaciju sustava. Backend provjerava i obrađuje zahtjeve frontend aplikacije te podatke pohranjuje u MongoDB bazu putem Mongoosea.

## Funkcionalnosti

- registracija i prijava korisnika uz JWT autentikaciju
- autorizacija prema ulogama Client, Beautician i Admin
- upravljanje profilima klijenata i zaposlenika
- upravljanje tretmanima, cjenikom i kategorijama tretmana
- definiranje radnog vremena, godišnjih odmora i dostupnosti zaposlenika
- rezervacija termina uz provjeru tretmana, stručnosti zaposlenika i radnog vremena
- sprječavanje preklapanja termina klijenta i zaposlenika
- praćenje statusa termina: `booked`, `cancelled`, `completed` i `no_show`
- obračun naknade za kasno otkazivanje termina
- evidencija potrošnje klijenata i sustav Beauty Points pogodnosti
- vođenje dnevnika tretmana i statistike klijenata
- ocjenjivanje zaposlenika nakon završenog termina
- upravljanje narudžbama proizvoda i materijala
- dnevna i mjesečna analitika prodaje i zarade
- sinkronizacija korisničkih računa i podataka povezanih termina
- početno punjenje baze podacima bez brisanja postojećih zapisa
- validacija ulaznih podataka i centralizirana obrada pogrešaka

## Poveznice

- Backend API: https://beautydiarybackend-production.up.railway.app/api/health
- Frontend repozitorij: https://github.com/MorenaMartan/BeautyDiary_frontend
- Backend repozitorij: https://github.com/MorenaMartan/BeautyDiary_backend

## Demo račun

Nakon pokretanja početnog seeda dostupan je administratorski račun:

```text
Administrator
Korisničko ime: Tara
Lozinka: tara
```

```text
Kozmetičar
Korisničko ime: Luna
Lozinka: luna
```

```text
Klijent
Korisničko ime: Petra
Lozinka: petra
```
