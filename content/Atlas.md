---
publish: true
title: Atlas
created: 2026-10-02T00:13:19.457Z
modified: 2026-10-02T00:13:19.457Z
published: 2026-10-02T00:13:19.457Z
tags:
  - type/hub
  - campaign/toa
type: hub
---

# Atlas

```base
filters:
  or:
    - note.type == "session"
    - note.type == "location"
    - file.name == "Atlas"
views:
  - type: toa-atlas
    name: Atlas
    image: z_images/Foundry/scenes/chult/chult-labeled.webp
    mapName: chult
```
