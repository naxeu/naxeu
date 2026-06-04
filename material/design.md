# design.md — Naxeu Design System

Stand: 2026-06-04  
Inspiration: Wise Webseite, Wise App, Wise Design System  
Ziel: Eine vertrauenswürdige, mobile-first Finanz-PWA mit klarer Informationsarchitektur, starker Transparenz und einfacher Bedienung.

> Wichtig: Dieses Dokument beschreibt **übertragbare Design-Prinzipien**, nicht das Kopieren der Wise-Marke. Farben, Logo, Claims, Illustrationsstil und visuelle Details sollen eigenständig für Naxeu umgesetzt werden.

---

## 1. Designrichtung

Naxeu soll sich wie ein modernes Finanzprodukt anfühlen: schnell, klar, zuverlässig, freundlich und transparent. Die Oberfläche soll nicht wie eine klassische Bank aussehen, sondern eher wie ein hilfreicher Finanzassistent, der Komplexität reduziert.

### Leitprinzipien

1. **Transparenz zuerst**  
   Nutzer sollen immer sehen, was passiert: importierte Konten, letzte Aktualisierung, erkannte Kategorien, unsichere KI-Zuordnungen, Limits, Budgets und Sparpotenziale.

2. **Eine Hauptaktion pro Screen**  
   Jeder Screen braucht eine klar erkennbare Primäraktion. Beispiel: „Transaktionen importieren“, „Kategorie bestätigen“, „Budget anlegen“, „Sparpotenzial prüfen“.

3. **Zahlen verständlich machen**  
   Finanzdaten dürfen nicht nur als Tabellen dargestellt werden. Jede wichtige Zahl bekommt Kontext: Veränderung zum Vormonat, Budgetstatus, Ampellogik, kurze Erklärung.

4. **Mobile-first, Desktop erweitert**  
   Die App muss am Handy vollständig nutzbar sein. Desktop nutzt mehr Breite für Vergleich, Analyse und Tabellen, darf aber keine andere Logik haben.

5. **Vertrauen durch Kontrolle**  
   KI darf helfen, aber nicht heimlich entscheiden. Jede automatische Kategorisierung muss nachvollziehbar und korrigierbar sein.

6. **Ruhige Oberfläche, starke Akzente**  
   Der Grundlook ist ruhig, hell und luftig. Akzentfarben werden sparsam für wichtige Handlungen, Zustände und Highlights eingesetzt.

---

## 2. Produktpersönlichkeit

### Tonalität

Naxeu klingt:

- direkt, aber nicht kalt
- hilfreich, aber nicht belehrend
- transparent, aber nicht überladen
- optimistisch, aber nicht verspielt
- vertrauenswürdig, aber nicht bürokratisch

### Beispiel-Copy

Gut:

- „Du hast diesen Monat 184 € weniger für Lebensmittel ausgegeben.“
- „Diese Kategorie ist unsicher. Bitte kurz prüfen.“
- „Dein Kreditkartenumsatz wird im nächsten Monat vom Konto abgebucht.“
- „Limit fast erreicht: Noch 42 € bis zum Monatsbudget.“

Vermeiden:

- „Unsere KI hat deine Finanzen optimiert.“
- „Du solltest weniger ausgeben.“
- „Fehlerhafte Transaktion.“
- „Bankdaten-Synchronisationsprozess abgeschlossen.“

---

## 3. Informationsarchitektur

## 3.1 Web/Landingpage

Die Webseite soll sofort erklären, was Naxeu tut und warum es vertrauenswürdig ist.

### Empfohlene Startseitenstruktur

1. **Header**
   - Logo links
   - Navigation: Funktionen, Sicherheit, Preise, Community Edition, Login
   - Primärbutton: „App starten“ oder „Kostenlos testen“

2. **Hero**
   - Starke Headline
   - Kurzer Nutzen-Satz
   - Primäraktion
   - Sekundäraktion: „Demo ansehen“
   - Rechts: App-Screenshot oder interaktiver Demo-Card-Block

3. **Direktes Produktbeispiel**
   - Monatsübersicht
   - Budgetstatus
   - automatisch kategorisierte Transaktionen
   - KI-Sparhinweis

4. **Transparenz-Block**
   - „Importiere CSV/CAMT“
   - „Kategorisierung nachvollziehbar“
   - „Daten bleiben unter deiner Kontrolle“

5. **Vergleich/Warum Naxeu**
   - Gegenüberstellung: Tabellenkalkulation vs. Banking-App vs. Naxeu
   - Fokus auf Kontrolle, Open Source/Community Edition, Self-Hosting und KI-Unterstützung

6. **Sicherheit & Datenschutz**
   - Datenhaltung
   - Verschlüsselung
   - Self-hosted Option
   - keine versteckten Datenweitergaben

7. **CTA-Abschluss**
   - „Starte mit deinem ersten Kontoimport“

---

## 3.2 App/PWA Navigation

Mobile Bottom Navigation mit 5 Hauptbereichen:

1. **Home**  
   Überblick, Kontostände, Monatsstatus, wichtigste Warnungen.

2. **Transaktionen**  
   Suche, Filter, Kategorien, KI-Prüfung, Split-Buchungen.

3. **Budgets**  
   Limits, Monatsfortschritt, Kategorien, wiederkehrende Ausgaben.

4. **Insights**  
   Trends, Sparpotenziale, Prognosen, Kreditkarten-Abrechnung.

5. **Mehr**  
   Konten, Importe, Regeln, Einstellungen, Datenschutz, Export.

Desktop kann dieselben Bereiche als linke Sidebar darstellen.

---

## 4. Visuelle Grundlagen

## 4.1 Farbprinzip

Wise nutzt stark unterscheidbare Grün-Töne und helle Flächen. Für Naxeu sollte daraus eine eigene, ruhigere Palette entstehen.

### Naxeu-Farbpalette

```css
:root {
  /* Brand */
  --nx-primary-950: #102A1C;   /* dunkles, vertrauenswürdiges Grün */
  --nx-primary-800: #17452D;
  --nx-primary-600: #227044;
  --nx-accent-400:  #B8F36B;   /* frischer Akzent, nicht Wise 1:1 */
  --nx-accent-200:  #DDF9BD;

  /* Neutrals */
  --nx-bg:          #F7F8F4;
  --nx-surface:     #FFFFFF;
  --nx-surface-2:   #EEF2EA;
  --nx-border:      #DDE5D8;
  --nx-text:        #102015;
  --nx-text-muted:  #5A665D;

  /* Semantic */
  --nx-success:     #1F8A4C;
  --nx-warning:     #B7791F;
  --nx-danger:      #C2413B;
  --nx-info:        #2563A8;

  /* Data Viz */
  --nx-chart-1:     #227044;
  --nx-chart-2:     #7CB342;
  --nx-chart-3:     #2F80ED;
  --nx-chart-4:     #F59E0B;
  --nx-chart-5:     #C2413B;
}
```

### Farbregeln

- Dunkles Grün für Navigation, Headlines, primäre Icons und aktive Zustände.
- Helles Grün nur für starke Akzente, positive Highlights und Haupt-CTA.
- Finanzwarnungen niemals nur über Farbe kommunizieren: immer Text + Icon + Statuslabel.
- Große Flächen bleiben hell und ruhig.
- Keine rein blauen Banking-Standardflächen als Hauptidentität.

---

## 4.2 Typografie

Empfohlen: **Inter** als UI-Schrift.

Grund:

- sehr gute Lesbarkeit bei Zahlen
- ideal für Tabellen, Listen und App-Oberflächen
- neutral genug, um Vertrauen zu vermitteln
- funktioniert gut in Web/PWA und Mobile

### Type Scale

```css
:root {
  --nx-font-sans: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --nx-text-xs: 0.75rem;     /* 12px */
  --nx-text-sm: 0.875rem;    /* 14px */
  --nx-text-md: 1rem;        /* 16px */
  --nx-text-lg: 1.125rem;    /* 18px */
  --nx-text-xl: 1.375rem;    /* 22px */
  --nx-text-2xl: 1.75rem;    /* 28px */
  --nx-text-3xl: 2.25rem;    /* 36px */
  --nx-text-4xl: 3rem;       /* 48px */
}
```

### Verwendung

- Hero Headline: 48–72 px auf Desktop, 36–44 px mobil.
- Page Title: 28–36 px.
- Section Title: 22–28 px.
- Body: 16 px.
- Hilfetext/Meta: 14 px.
- Beträge dürfen größer sein, aber immer mit Kontextlabel.

---

## 4.3 Spacing

Basis: 4-px-Raster.

```css
:root {
  --nx-space-1: 4px;
  --nx-space-2: 8px;
  --nx-space-3: 12px;
  --nx-space-4: 16px;
  --nx-space-5: 20px;
  --nx-space-6: 24px;
  --nx-space-8: 32px;
  --nx-space-10: 40px;
  --nx-space-12: 48px;
  --nx-space-16: 64px;
  --nx-space-20: 80px;
}
```

Regeln:

- App Screen Padding mobil: 16 px.
- Cards mobil: 16–20 px Innenabstand.
- Cards Desktop: 24 px Innenabstand.
- Landingpage Section Padding: 48–80 px.
- Listenitems: mindestens 56 px Höhe.
- Buttons: 48–56 px Höhe.

---

## 4.4 Radius & Schatten

```css
:root {
  --nx-radius-sm: 8px;
  --nx-radius-md: 12px;
  --nx-radius-lg: 18px;
  --nx-radius-xl: 24px;
  --nx-radius-pill: 999px;

  --nx-shadow-sm: 0 1px 2px rgba(16, 32, 21, 0.06);
  --nx-shadow-md: 0 8px 24px rgba(16, 32, 21, 0.08);
}
```

Regeln:

- Kleine UI-Elemente: 8–12 px Radius.
- Cards und Panels: 18–24 px Radius.
- Buttons und Chips: Pill-Form möglich.
- Schatten sparsam verwenden. Struktur primär über Hintergrund, Border und Abstand.

---

## 5. Komponenten

## 5.1 Buttons

### Primary Button

Für die wichtigste Aktion des Screens.

```css
.button-primary {
  min-height: 52px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--nx-primary-950);
  color: white;
  font-weight: 700;
}
```

Beispiele:

- „Import starten“
- „Kategorie speichern“
- „Budget anlegen“
- „Regel erstellen“

### Accent Button

Für Marketing- oder positive Aktionen.

```css
.button-accent {
  min-height: 52px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--nx-accent-400);
  color: var(--nx-primary-950);
  font-weight: 800;
}
```

### Secondary Button

Für alternative Aktionen.

```css
.button-secondary {
  min-height: 48px;
  padding: 0 20px;
  border-radius: 999px;
  background: var(--nx-surface-2);
  color: var(--nx-primary-950);
  font-weight: 700;
}
```

### Button-Regeln

- Pro Screen maximal ein Primary Button.
- Destruktive Aktionen immer klar benennen: „Import löschen“, nicht „Entfernen“.
- Ladezustände mit Text: „Importiere CAMT-Datei …“.
- Disabled Buttons immer mit erklärendem Hilfetext, falls unklar.

---

## 5.2 Cards

Cards sind die Hauptstruktur für App und Landingpage.

### Standard Card

```css
.card {
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius-xl);
  padding: 24px;
  box-shadow: var(--nx-shadow-sm);
}
```

### Finance Summary Card

Inhalt:

- Label: „Verfügbar“
- Betrag: „2.418,32 €“
- Veränderung: „+184 € gegenüber letztem Monat“
- Meta: „Aktualisiert vor 12 Minuten“

Regeln:

- Betrag groß, aber nicht isoliert.
- Immer Währung anzeigen.
- Negative Werte farblich und textlich kennzeichnen.

---

## 5.3 Account Cards

Für Bankkonten, Kreditkarten und Bargeldkonten.

Inhalt:

- Konto-Icon oder Banklogo
- Kontoname
- Kontotyp
- Saldo
- Status: verbunden, Import erforderlich, Fehler, manuell
- Letzte Aktualisierung

Beispiel:

```md
[Raiffeisen Lana]
Girokonto · verbunden
2.418,32 €
Aktualisiert vor 12 Minuten
```

Kreditkarten bekommen einen gesonderten Hinweis:

```md
[Nexi Kreditkarte]
Offene Umsätze: 642,18 €
Voraussichtliche Abbuchung: 15.07.2026
Wird im nächsten Monat vom Girokonto abgebucht.
```

---

## 5.4 Transaction List Item

Transaktionen müssen schnell scannbar sein.

Struktur:

- links: Icon/Kategorie/Avatar
- Mitte: Empfänger, Kategorie, Datum
- rechts: Betrag, Status
- optional: KI-Konfidenz oder Warnung

Beispiel:

```md
Despar Lana
Lebensmittel · Heute
-42,80 €
KI: sicher
```

Regeln:

- Einnahmen positiv, Ausgaben negativ.
- Beträge rechtsbündig.
- Kategorie direkt sichtbar.
- Unsichere Kategorien mit kleinem Review-Chip: „prüfen“.
- Split-Buchungen mit Icon markieren.

---

## 5.5 Money Input

Für Beträge, Budgets und Limits.

Regeln:

- Große Ziffern.
- Währung als festes Element rechts oder links.
- Tausendertrennzeichen automatisch.
- Dezimalstellen lokalisiert.
- Fehler direkt unter dem Feld.

Beispiel:

```md
Monatslimit
[ 450,00 ] EUR
```

---

## 5.6 Status Chips

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
}
```

Varianten:

- `Verbunden`
- `Import nötig`
- `Prüfen`
- `Limit fast erreicht`
- `Abgebucht`
- `Prognose`

---

## 5.7 Alerts & Nudges

Wise nutzt sehr sichtbare, aber nicht aggressive Hinweise. Für Naxeu:

### Info Nudge

Für hilfreiche Hinweise:

```md
Kreditkarte erkannt
Diese Umsätze werden gesammelt und vermutlich im nächsten Monat vom Girokonto abgebucht.
[Verrechnung einrichten]
```

### Warning Alert

Für finanzielle Risiken:

```md
Budget fast erreicht
Du hast 91 % deines Lebensmittel-Budgets verbraucht. Noch 42 € übrig.
[Details ansehen]
```

### Error Alert

Für technische Probleme:

```md
Import fehlgeschlagen
Die Datei konnte nicht gelesen werden. Bitte prüfe, ob es eine CAMT- oder CSV-Datei deiner Bank ist.
[Erneut versuchen]
```

---

## 5.8 Bottom Sheet

Mobile Detailaktionen sollen als Bottom Sheet erscheinen.

Geeignet für:

- Kategorie ändern
- Transaktion splitten
- Regel vorschlagen
- Konto auswählen
- Importfehler erklären

Regeln:

- Maximal eine primäre Aktion.
- Oben klarer Titel.
- Unten sticky Action-Bar.
- Bei langen Inhalten scrollbar, Button bleibt sichtbar.

---

## 5.9 Tabellen

Desktop nutzt Tabellen für viele Transaktionen. Mobil nutzt Listen.

Tabellenspalten:

- Datum
- Empfänger
- Konto
- Kategorie
- Betrag
- Status
- Aktionen

Regeln:

- Beträge rechtsbündig.
- Kategorie als Chip.
- Zeilen klickbar.
- Filter oberhalb der Tabelle.
- Mobile: keine gequetschten Tabellen, sondern List View.

---

## 6. App Screens

## 6.1 Home Dashboard

Ziel: In 10 Sekunden verstehen, wie der Monat läuft.

### Mobile Aufbau

1. Header
   - Profil/Workspace links
   - Aktualisieren/Import rechts

2. Monatsstatus Card
   - Einnahmen
   - Ausgaben
   - verfügbarer Rest
   - Prognose Monatsende

3. Konto-Karussell
   - Girokonto
   - Kreditkarte
   - Bargeld/manuell
   - Sparkonto

4. Wichtige Hinweise
   - Budget fast erreicht
   - neue unsichere Kategorien
   - Kreditkarten-Abbuchung demnächst

5. Letzte Transaktionen

6. KI-Sparhinweis

### Beispiel Wireframe

```md
┌─────────────────────────────┐
│ Naxeu                 ⟳  👤 │
├─────────────────────────────┤
│ Juni 2026                   │
│ Verfügbar: 775 €            │
│ Prognose: +120 € Monatsende │
│ [Details]                   │
├─────────────────────────────┤
│ [Girokonto] [Nexi] [+ Konto]│
├─────────────────────────────┤
│ ⚠ Lebensmittel: 91 % genutzt│
│ [Budget ansehen]            │
├─────────────────────────────┤
│ Letzte Transaktionen        │
│ Despar Lana        -42,80 € │
│ TIM                -29,99 € │
│ Gehalt          +3.250,00 € │
└─────────────────────────────┘
```

---

## 6.2 Transaktionen

Ziel: schnelle Suche, Kontrolle und Korrektur.

Features:

- Suche nach Empfänger, Betrag, Kategorie
- Filter: Zeitraum, Konto, Kategorie, Status
- Bulk-Aktion: Kategorien bestätigen
- KI-Konfidenz sichtbar
- Regeln erstellen aus wiederkehrenden Mustern

### Empty State

```md
Noch keine Transaktionen
Importiere eine CSV- oder CAMT-Datei, um deine Ausgaben automatisch zu analysieren.
[Datei importieren]
```

---

## 6.3 Import Flow

### Schritte

1. Quelle wählen
   - CSV
   - CAMT
   - manuelle Eingabe
   - später: Bank-API

2. Datei hochladen

3. Spalten erkennen / Mapping prüfen

4. Duplikate erkennen

5. Vorschau anzeigen

6. Import bestätigen

7. KI-Kategorisierung läuft

8. Review unsicherer Transaktionen

### UX-Regeln

- Keine langen technischen Fehlermeldungen.
- Immer Vorschau vor finalem Import.
- Duplikate transparent anzeigen.
- Unsichere Kategorisierung nicht verstecken.

---

## 6.4 Budgets

Ziel: Limits einfach verstehen.

Budget Card:

```md
Lebensmittel
408 € von 450 € genutzt
Noch 42 € übrig
91 %
```

Zustände:

- bis 70 %: neutral
- 70–90 %: Hinweis
- 90–100 %: Warnung
- über 100 %: kritisch

Aktionen:

- Limit ändern
- Transaktionen anzeigen
- Regel erstellen
- Kategorie zusammenführen

---

## 6.5 Insights

Ziel: aus Daten konkrete Entscheidungen machen.

Abschnitte:

1. Monatsvergleich
2. Top-Ausgabenkategorien
3. Wiederkehrende Zahlungen
4. Abo-Erkennung
5. Sparpotenziale
6. Kreditkarten-Verrechnung
7. Prognose Monatsende

### KI-Hinweis Card

```md
Sparpotenzial erkannt
Du zahlst aktuell 3 Streaming-Abos. Wenn du Spotify wie geplant kündigst, sparst du ca. 143,88 € pro Jahr.
[Als erledigt markieren] [Mehr anzeigen]
```

Regeln:

- KI-Hinweise immer mit Rechenweg oder Datenbasis.
- Keine moralischen Bewertungen.
- Vorschläge sollen als Optionen formuliert sein.

---

## 6.6 Kreditkarten-Verrechnung

Für Naxeu besonders wichtig.

Problem: Kreditkartenumsätze entstehen im laufenden Monat, die Abbuchung kommt später gesammelt vom Girokonto. Ohne Verrechnung entstehen doppelte oder zeitlich falsche Ausgaben.

### Designlösung

Kreditkartenumsätze werden als echte Ausgaben am Kaufdatum gezählt. Die spätere Abbuchung vom Girokonto wird als interne Umbuchung markiert und nicht erneut als Ausgabe gezählt.

### UI-Pattern

Bei erkannter Kreditkartenabbuchung:

```md
Mögliche Kreditkarten-Abrechnung erkannt
Nexi Abbuchung: 642,18 € am 15.07.2026
Dazu passen 18 Kreditkartenumsätze aus Juni.

Vorschlag:
Diese Abbuchung als interne Verrechnung markieren, damit Ausgaben nicht doppelt gezählt werden.

[Verrechnung bestätigen]
[Details prüfen]
```

### Statuslabels

- `offen`
- `voraussichtlich abgerechnet`
- `abgerechnet`
- `interne Umbuchung`
- `manuell geprüft`

---

## 7. Landingpage Design

## 7.1 Hero Beispiel

```md
Headline:
Deine Finanzen. Endlich verständlich.

Subline:
Importiere Konto- und Kreditkartenumsätze, lass sie automatisch kategorisieren und erkenne, wo dein Geld wirklich hingeht.

CTA:
Kostenlos starten

Secondary:
Demo ansehen
```

Hero Visual:

- große App-Card mit Monatsübersicht
- Konto-Cards
- ein konkreter KI-Hinweis
- keine abstrakten Stock-Fotos

---

## 7.2 Trust Section

```md
Warum du Naxeu vertrauen kannst

- Deine Daten bleiben unter deiner Kontrolle
- Open-Source Community Edition
- Self-hosted oder gehostet nutzbar
- KI-Vorschläge sind nachvollziehbar
- CSV/CAMT-Import ohne Bank-API-Zwang
```

---

## 7.3 Feature Cards

1. **Alle Konten an einem Ort**
2. **Automatische Kategorien**
3. **Budgets & Limits**
4. **Kreditkarten richtig verrechnen**
5. **KI-Sparhinweise**
6. **Self-hosting möglich**

Jede Feature Card:

- kurzes Icon
- klare Headline
- maximal 2 Zeilen Beschreibung
- optional Mini-Screenshot

---

## 8. Datenschutz & Vertrauen im UI

Finanzprodukte brauchen sichtbare Sicherheit.

### Permanente Vertrauenselemente

- Import-Status sichtbar
- Datenquelle je Transaktion sichtbar
- letzter Sync sichtbar
- KI-Konfidenz sichtbar
- Änderungen rückgängig machbar
- Export jederzeit möglich

### Sicherheitscopy

Gut:

```md
Diese Datei wird lokal verarbeitet und anschließend verschlüsselt gespeichert.
```

```md
Die KI schlägt Kategorien vor. Du kannst jede Zuordnung ändern.
```

```md
Diese Abbuchung wird als Umbuchung behandelt und nicht als zusätzliche Ausgabe gezählt.
```

---

## 9. Accessibility

Mindestanforderungen:

- Touch Targets mindestens 44 × 44 px, bevorzugt 48 × 48 px.
- Body Text mindestens 16 px.
- Fokuszustände sichtbar und kontrastreich.
- Nicht nur Farbe für Status verwenden.
- Charts immer mit Textzusammenfassung.
- Tabellen mit korrekten Headern.
- Screenreader-Labels für Icons.
- Motion reduzierbar.
- Fehlermeldungen direkt am betroffenen Feld.

### Fokuszustände

```css
:focus-visible {
  outline: 3px solid var(--nx-primary-950);
  outline-offset: 2px;
}
```

---

## 10. Motion

Animationen sollen Orientierung geben, nicht beeindrucken.

Geeignet:

- Card erscheint nach Import
- Progress bei Kategorisierung
- Bottom Sheet Slide-in
- Betrag zählt leicht hoch/runter
- Warnung dezent einblenden

Nicht geeignet:

- dauerhafte Effekte
- übertriebene Banking-Animationen
- Animationen, die Zahlen schwer lesbar machen

Dauer:

```css
:root {
  --nx-motion-fast: 120ms;
  --nx-motion-default: 180ms;
  --nx-motion-slow: 260ms;
}
```

---

## 11. Datenvisualisierung

Regeln:

- Keine 3D-Charts.
- Maximal 5 Farben pro Chart.
- Ausgaben nach Kategorie: Balken oder Donut, aber mit klarer Liste daneben/darunter.
- Zeitverlauf: Linienchart oder Balken pro Monat.
- Prognosen optisch von echten Werten trennen.
- Jede Grafik braucht eine kurze Interpretation.

Beispiel:

```md
Lebensmittel sind im Juni 18 % höher als im Mai.
Hauptgrund: 3 größere Einkäufe bei Despar und Aldi.
```

---

## 12. Design Do's & Don'ts

### Do

- konkrete Beträge zeigen
- letzte Aktualisierung zeigen
- KI-Entscheidungen erklärbar machen
- Hauptaktion sichtbar halten
- Mobile zuerst denken
- Tabellen nur dort verwenden, wo sie wirklich helfen
- Kreditkartenumsätze sauber von Abbuchungen trennen

### Don't

- Wise-Farben, Logo oder Claims 1:1 übernehmen
- Finanzdaten ohne Kontext zeigen
- Warnungen nur farblich markieren
- zu viele CTAs gleichzeitig zeigen
- KI als Blackbox darstellen
- Desktop-Tabellen auf Mobile quetschen
- importierte Daten ungeprüft als Wahrheit behandeln

---

## 13. Beispiel-Komponenten für Vue/Nuxt

Empfohlene Komponentenstruktur:

```txt
/components
  /app
    AppShell.vue
    BottomNav.vue
    SidebarNav.vue
  /finance
    AccountCard.vue
    BalanceSummaryCard.vue
    TransactionListItem.vue
    BudgetProgressCard.vue
    CreditCardSettlementCard.vue
    InsightCard.vue
  /import
    ImportDropzone.vue
    ImportMappingTable.vue
    ImportPreview.vue
    DuplicateWarning.vue
  /ui
    NxButton.vue
    NxCard.vue
    NxChip.vue
    NxAlert.vue
    NxBottomSheet.vue
    NxMoneyInput.vue
    NxTabs.vue
```

---

## 14. Erste MVP-Screens

Für das MVP sollten diese Screens zuerst gebaut werden:

1. Landingpage
2. Login/Register
3. Home Dashboard
4. Konto anlegen
5. Dateiimport
6. Import-Vorschau
7. Transaktionsliste
8. Kategorie prüfen
9. Budgetübersicht
10. Kreditkarten-Verrechnung
11. Insights/Sparhinweise
12. Einstellungen/Export

---

## 15. Akzeptanzkriterien für das Design

Ein Screen ist fertig, wenn:

- die Hauptaktion innerhalb von 3 Sekunden erkennbar ist
- alle Beträge eine Währung haben
- alle Status auch ohne Farbe verständlich sind
- Mobile und Desktop sinnvoll funktionieren
- Fehlerzustände vorhanden sind
- Loading/Empty/Success/Error States gestaltet sind
- KI-Aussagen nachvollziehbar sind
- Datenschutz-/Kontrollaspekte sichtbar sind

---

## 16. Research Notes

Analysierte öffentliche Quellen:

- Wise Website: https://wise.com/
- Wise Pricing: https://wise.com/gb/pricing/
- Wise App Store: https://apps.apple.com/ch/app/wise/id612261027
- Wise Google Play: https://play.google.com/store/apps/details?id=com.transferwise.android
- Wise App Landingpage: https://wise.com/es/money-transfer-app/
- Wise Design System — Colour: https://wise.design/foundations/colour
- Wise Design System — Typography: https://wise.design/foundations/typography
- Wise Design System — Spacing: https://wise.design/foundations/spacing
- Wise Design System — Components: https://wise.design/components/card

---

## 17. Kurzfazit

Die stärksten übertragbaren Wise-Prinzipien für Naxeu sind:

1. sofort sichtbarer Nutzen im Hero und auf dem Home Screen
2. sehr klare Betrags- und Gebühren-/Kostenlogik
3. mobile-first Cards statt komplexer Tabellen
4. starke, aber sparsam eingesetzte Akzentfarbe
5. transparente Status- und Sicherheitskommunikation
6. einfache Sprache statt Finanzjargon
7. Vertrauen durch Kontrolle, Nachvollziehbarkeit und klare Korrekturmöglichkeiten

Naxeu sollte diese Prinzipien übernehmen, aber visuell eigenständig bleiben.
