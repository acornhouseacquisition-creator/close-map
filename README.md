# Acorn CRM tools

Map tools for the Close CRM.

## map.html — property map for each lead

A live satellite map of one house, with the pin on the roof. It has Satellite / Hybrid / Map views and buttons for Street View, Google Maps, Zillow, Propwire and Directions.

It opens from a Close **Integration Link** (Settings → Customization → Integration Links → Lead type):

```
https://acornhouseacquisition-creator.github.io/close-map/map.html#a={{lead.display_name}}&s={{lead.status_label}}
```

The address is passed after the `#`, so it never reaches GitHub's servers. The page stores no lead data.

**Never commit lead data to this repo — it is public.**

## houses.html — map of all leads (password-locked)

`https://acornhouseacquisition-creator.github.io/close-map/houses.html`

GitHub Actions rebuilds it from Close every 15 minutes (`.github/workflows/pages.yml`). The lead data inside is encrypted with the `MAP_PASSWORD` secret. Pages must be set to **Source: GitHub Actions**.

## close_map_notes.py — pinned map notes (optional)

Adds a pinned note with a satellite photo and links to Close leads. It needs `close-key.txt` (a Close API key, never committed) and a venv with `pillow` and `requests`.

## close-maps.user.js — Tampermonkey add-on (optional, browser only)

For Close in Chrome with Tampermonkey: a map inside each lead page and a map of all leads. It does not work in the Close desktop app.
