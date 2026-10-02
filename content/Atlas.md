---
publish: true
title: Atlas
created: 2026-10-02T02:12:21.000Z
modified: 2026-10-02T02:12:21.000Z
published: 2026-10-02T02:12:21.000Z
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
    - note.type == "hub"
    - file.name == "Atlas"
views:
  - type: toa-atlas
    name: Atlas
    image: z_images/Foundry/scenes/chult/chult-labeled.webp
    mapName: chult
```
