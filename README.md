# PrivateFlix

## Version 1.7.0

- Ny selvstændig **Affiliate-katalog** med adgang fra bibliotekets topheader og extensionens popup.
- Linkkort til en verificeret startliste af adult-, cam- og datingprogrammer.
- Søgning og filtrering efter kategori og personlig partnerstatus.
- Gem eget affiliatelink og status for hvert program lokalt.
- Administrér programmer med opret, redigér og slet direkte i extensionen.
- Importér og eksportér kataloget som valideret JSON.
- Tilslut et selvvalgt HTTPS JSON-feed, så kataloget kan opdateres uden at udgive en ny extensionversion.
- Feedet kontrolleres højst én gang i døgnet, caches lokalt og erstatter aldrig listen, hvis valideringen fejler.
- Personlige affiliatelinks og partnerstatus bevares ved fjernopdateringer.
- GitHub-repositoriets `affiliate-programs.json` er standardfeed, så katalogændringer kan udgives centralt uden en ny extensionversion.
- GitHub Actions bygger automatisk en installations-ZIP ved hvert push og opretter en downloadbar release ved tags som `v1.7.1`.

## Version 1.6.3

- Headerens indhold flugter nu med hero, filtre og filmgrid i samme maksimumsbredde.
- Længde og maksimumkvalitet er gjort markant større og mere synlige på kortene.
- Metadataopdatering forsøger at udfylde længde og kvalitet på alle kort.
- Op til 10 videotags vises på hvert kort og kan klikkes for præcis filtrering.
- Skuespillere/performers vises separat på kortene og kan klikkes for filtrering.
- Produktionsselskab/studio hentes fra strukturerede data og relevante meta-/datafelter, vises på kortet og kan filtreres.
- Backupformat version 7 gemmer produktionsselskab og er fortsat kompatibelt med ældre backups.

## Version 1.6.2

- **Se senere / Set** er fjernet fra filmkortenes handlinger.
- Teksterne **Længde** og **Maks. kvalitet** er fjernet; kun de kompakte værdier vises på kortet.
- Kort uden en gemt previewkilde forsøger nu at hente en ny videopreview ved hover.
- Når en hjemmeside ikke udstiller en afspillelig previewfil, bruges en tydelig cover-animation uden defekt videoelement.
- HTTP 404, 410 og tydelige soft-404-sider markeres som slettede links ved metadataopdatering eller previewforsøg.
- Slettede videoer får et deaktiveret kort med forklaring og knappen **Søg efter videoen et andet sted**.
- Loginblokering, HTTP 403 og timeout markeres ikke som slettede videoer.
- Backupformat version 6 gemmer linkstatus og tidspunkt for seneste kontrol.

## Version 1.6.1

- Import, metadataopdatering og backup er samlet i en tilgængelig burgermenu i headeren.
- Filmkortene har fået et roligere layout, tydelig kildeidentitet og mere ensartede handlinger.
- Længde og maksimumkvalitet vises nu i en fast informationsrække på alle kort, også når oplysningerne endnu er ukendte.
- Sidens eget favicon/logo hentes fra metadata og vises ved hjemmesidenavnet. Eksisterende film bruger automatisk sidens standard-favicon som fallback.
- Metadataopdatering kan efterfylde manglende logoer på eksisterende film.
- Backupformat version 5 inkluderer kilde-logoer og understøtter fortsat ældre backups.

## Version 1.6.0

- **Find bedre** analyserer nu et kandidatlink og sammenligner titel, hjemmeside, længde og kvalitet med den gemte version.
- Matchvurderingen bruger titel, performers og længde og advarer, når kandidaten er usikker.
- En kandidat kan gemmes som alternativ eller gøres til foretrukken version.
- Den tidligere foretrukne version bevares automatisk som alternativ ved udskiftning.
- Gemte alternativer kan åbnes, slettes eller gøres til foretrukken version fra filmkortet.
- Hero og header har fået et mere kompakt design med statistik for film, favoritter, sete film og alternative versioner.
- Redigering omfatter nu link, kategorier, performers, længde og kvalitet.
- Ny sortering efter senest åbnede film.
- Metadataopdatering kører tre opslag ad gangen og kan opgradere en kendt kvalitetsangivelse.
- Backupformat version 4 gemmer og validerer alternative versioner. Ældre backups understøttes fortsat.
- Nyt diskret PrivateFlix-ikon i Chromes værktøjslinje og på extensionsiden.

## Version 1.5.1

- Sikker backupvalidering beskytter den eksisterende samling mod ugyldige filer.
- Preview accepterer ikke længere coverbilleder, `blob:`-kilder eller almindelige embed-sider som video.
- Mislykkede previews mister deres preview-markering, og coveret bevares.
- Metadatahentning stopper efter 10 sekunder pr. side, og importen bruger højst tre samtidige opslag.
- Bogmærkesøgning og **Markér alle viste** bruger nu den samme synlige liste.
- Ukendt længde og kvalitet sorteres altid sidst.
- Gridvalget 3–8 overskrives ikke længere på smallere vinduer.
- Højrekliksmenuen **Gem i PrivateFlix** er færdiggjort.
- Tomme søgeresultater, tastaturfokus og tilgængelige navne er forbedret.

## Version 1.5.0

- Knappen **Find bedre** søger efter samme titel i Full HD, 4K eller 8K.
- Søg på samme hjemmeside eller på tværs af hjemmesider.
- Søgeteksten bruger tilgængelige performer-navne og renser typiske site-suffikser fra titlen.
- Den nuværende kvalitet og længde vises før søgningen.

## Version 1.4.0

- Coverbilledet kommer tilbage straks, når musen forlader et video-preview.
- Previewvideoen stoppes, nulstilles og fjernes for at frigive hukommelse og netværksressourcer.
- En kort hover-forsinkelse forhindrer utilsigtet indlæsning, når musen blot passerer et kort.
- Kun ét preview kan afspilles ad gangen.
- Kort med tilgængeligt preview markeres diskret.

Version 1.3 tilføjer valg mellem 3–8 kort pr. række, hover-preview fra flere metadataformater, synlig varighed og kvalitet samt sortering efter længde og maksimumkvalitet. Brug “Opdatér metadata” efter opgradering for at udfylde de nye felter på eksisterende links.

Et privat Chrome-bibliotek til links. Alt indhold gemmes lokalt i Chromes extension-lager. Extensionen downloader eller gemmer ikke selve videoerne.

Version 1.2 viser Chromes bogmærkehierarki med mapper og undermapper, så kun relevante mapper eller links importeres. Den henter titel, thumbnail, eventuel preview-video samt tilgængelige kategorier, performers, varighed og dato. Biblioteket kan filtreres efter de hentede data. Hold musen over et kort for at afspille preview lydløst. Nogle sider skjuler metadata bag login eller blokerer ekstern afspilning; på disse sider bruges et almindeligt cover eller fallback.

## Installation

1. Pak ZIP-filen ud.
2. Åbn `chrome://extensions` i Chrome.
3. Slå **Udviklertilstand** til øverst til højre.
4. Klik **Indlæs upakket**.
5. Vælg mappen `privateflix`.
6. Fastgør PrivateFlix-ikonet i Chromes værktøjslinje.

Klik på extensionen, mens du står på en side, og vælg **Gem denne side**. Åbn derefter biblioteket fra samme vindue.

## Opdatér affiliate-kataloget centralt

Standardfeedet er:

`https://raw.githubusercontent.com/mmgrafisk/privateflix/main/affiliate-programs.json`

1. Redigér `affiliate-programs.json` i GitHub-repositoriet.
2. Commit ændringen til `main`.
3. Åbn **Affiliate-katalog** og vælg **Opdatér nu**, hvis du ikke vil vente på den automatiske kontrol.

Installerede kopier kontrollerer ellers automatisk feedet højst én gang i døgnet. Et andet HTTPS-feed kan stadig angives under **Affiliate-katalog → Administrér**.

## Udgiv en ny extensionversion

1. Opdatér versionsnummeret i `manifest.json`.
2. Commit og merge ændringerne til `main`.
3. Opret et tag i formatet `v1.7.1`.
4. GitHub Actions bygger `PrivateFlix-v1.7.1.zip` og vedhæfter den til en GitHub Release.

Ved almindelige pushes kan ZIP-filen også hentes som workflow-artifact fra fanen **Actions**.

Feedet må højst være 1 MB og 500 programmer. Ugyldige felter, dublet-id'er og usikre links afvises, uden at den fungerende lokale liste bliver erstattet.

## Privatliv

- Links, titler, tags og billeder gemmes lokalt i den aktive Chrome-profil.
- Der er ingen konto, server, analyse eller cloud-synkronisering.
- Brug **Eksportér backup** regelmæssigt. En rydning af Chrome-data kan ellers slette biblioteket.
- PIN-lås er ikke med i version 1. En simpel PIN i en extension giver ikke stærk beskyttelse mod andre med adgang til samme computer. Brug derfor en separat, låst Chrome- eller Windows-profil ved behov.
