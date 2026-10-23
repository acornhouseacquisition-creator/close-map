# Acorn CRM tools

Map tools for the Close CRM.

## map.html — property map for each lead

A live satellite map of one house, with the pin on the roof. It has Satellite / Hybrid / Map views and buttons for Street View, Google Maps, Zillow, Propwire and Directions.

It opens from a Close **Integration Link** (Settings → Customization → Integration Links → Lead type):

```
https://acornhouseacquisition-creator.github.io/acorn-crm-tools/map.html#a={{lead.display_name}}&s={{lead.status_label}}
```

The address is passed after the `#`, so it never reaches GitHub's servers. The page stores no lead data.

**Never commit lead data to this repo — it is public.**

## close_map_notes.py — pinned map notes (optional)

Adds a pinned note with a satellite photo and links to Close leads. It needs `close-key.txt` (a Close API key, never committed) and a venv with `pillow` and `requests`.

## close-maps.user.js — Tampermonkey add-on (optional, browser only)

For Close in Chrome with Tampermonkey: a map inside each lead page and a map of all leads. It does not work in the Close desktop app.
